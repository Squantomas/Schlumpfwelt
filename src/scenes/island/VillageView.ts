import Phaser from 'phaser';
import { buildingType } from '../../data/buildings';
import { t } from '../../data/texts';
import { buildingAt, tileIndex } from '../../sim/buildings';
import { nearbyArea, nearbyTiles, productionOf } from '../../sim/economy';
import type { Simulation } from '../../sim/simulation';
import type { PathPreviewTile, Preview } from '../../ui/buildTool';
import { createLabel } from '../../ui/label';
import { markerY } from '../../ui/markerPosition';
import { signsFor } from '../../ui/signs';
import { COLORS, TILE_SIZE } from '../../ui/style';
import {
  MARKER_BUBBLE,
  MARKER_SIZE,
  PUFF_KEY,
  buildingOrigin,
  buildingTextureKey,
  pathTextureKey,
  registerBuildingTextures,
} from './buildingTextures';
import { goodTextureKey, registerGoodTextures, signTextureKey } from './goodTextures';
import { TEXTURE_SCALE } from './objectTextures';
import { addGraphics } from '../../ui/FastGraphics';

const PATH_DEPTH = 2;
const OVERLAY_DEPTH = 800_000;
const GHOST_DEPTH = 800_001;
const PUFF_DEPTH = 900_000;
const MARKER_DEPTH = 950_000;
const POPUP_DEPTH = 960_000;
/** A "+1" over a building is at least this big on screen (CSS px). */
const POPUP_MIN_CSS_PX = 30;
const POPUP_MS = 1300;
const INSPECT_DEPTH = 700_000;
/** The sign above a house is at least this big on screen (CSS px), so it is seen from far away. */
const MARKER_MIN_CSS_PX = 46;
const MARKER_MAX_SCALE = 3.4;

interface BuildingSprite {
  readonly image: Phaser.GameObjects.Image;
  typeId: string;
  x: number;
  y: number;
  baseY: number;
}

interface Marker {
  readonly image: Phaser.GameObjects.Image;
  /** What the sign says: `path`, `tree`, `rock` or `good-<id>`. */
  readonly kind: string;
  readonly phase: number;
  readonly baseX: number;
  readonly baseY: number;
  /** Foot of the house (world px): the sign never slides lower than this. */
  readonly houseBottomY: number;
  /** 0 … 1: how far the sign has popped in; going down means it is leaving. */
  appear: number;
  leaving: boolean;
}

/**
 * Draws what the simulation says is built: house, deco and production
 * building sprites (sorted by their front edge like trees), path tiles that
 * join their neighbours, the signs above buildings that have a problem (no
 * path, no trees nearby, waiting for wood …), the preview of what the child is
 * about to build, little puffs, and – for working production buildings – a
 * gentle rocking and a floating "+1" when something was delivered. It only
 * reads the state; `sync()` compares the state's `revision` with the last
 * drawn one and redraws only on a change, the signs are looked at once per
 * tick.
 */
export class VillageView {
  private readonly sprites = new Map<number, BuildingSprite>();
  private readonly pathImages = new Map<number, Phaser.GameObjects.Image>();
  private readonly markers = new Map<number, Marker>();
  private readonly overlay: Phaser.GameObjects.Graphics;
  /** The area (and the trees / rocks in it) of the production building whose card is open. */
  private readonly inspectOverlay: Phaser.GameObjects.Graphics;
  /** How often each building had delivered when we last looked (a rise = a "+1"). */
  private readonly delivered = new Map<number, number>();
  /** Buildings that are rocking right now (so they can be set straight when they stop). */
  private readonly rocking = new Set<number>();
  private signTick = -1;
  private inspectId: number | undefined;
  /** The "no path" sign on the preview of a building that would have no path yet. */
  private readonly previewSign: Phaser.GameObjects.Image;
  private previewSignAt: { x: number; y: number; bottom: number } | undefined;
  /** The ✓ / ✕ signs of the preview, above the ghost. */
  private readonly badges: Phaser.GameObjects.Graphics;
  private readonly ghost: Phaser.GameObjects.Image;
  private revision = -1;
  private liftedId: number | undefined;
  private tintedId: number | undefined;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    private readonly simulation: Simulation,
  ) {
    registerBuildingTextures(scene);
    registerGoodTextures(scene);
    this.inspectOverlay = addGraphics(scene).setDepth(INSPECT_DEPTH);
    this.overlay = addGraphics(scene).setDepth(OVERLAY_DEPTH);
    this.ghost = scene.add.image(0, 0, PUFF_KEY).setDepth(GHOST_DEPTH).setVisible(false);
    this.badges = addGraphics(scene).setDepth(GHOST_DEPTH + 1);
    this.previewSign = scene.add.image(0, 0, signTextureKey('path')).setOrigin(0.5, 1).setDepth(MARKER_DEPTH).setVisible(false);
    layer.add([this.inspectOverlay, this.overlay, this.ghost, this.badges, this.previewSign]);
  }

  /** Number of signs ("this house needs a path") that are showing. */
  get markerCount(): number {
    let count = 0;
    for (const marker of this.markers.values()) {
      if (!marker.leaving) {
        count += 1;
      }
    }
    return count;
  }

  /** The id of the house whose sign is at this world point (the sign is bigger than a tile), if any. */
  markerAt(x: number, y: number): number | undefined {
    for (const [id, marker] of this.markers) {
      if (!marker.leaving && marker.image.getBounds().contains(x, y)) {
        return id;
      }
    }
    return undefined;
  }

  /** Redraws buildings, paths and signs if the state changed since last time. Returns whether it did. */
  sync(): boolean {
    const state = this.simulation.state;
    if (state.revision === this.revision) {
      return false;
    }
    const animate = this.revision >= 0;
    this.revision = state.revision;
    this.syncBuildings(animate);
    this.syncPaths(animate);
    this.syncSigns(animate);
    this.signTick = state.tick;
    if (this.inspectId !== undefined) {
      // The building may have moved: draw its area again.
      const id = this.inspectId;
      this.inspectId = undefined;
      this.setInspect(id);
    }
    return true;
  }

  private syncBuildings(animate: boolean): void {
    const { buildings } = this.simulation.state;
    const seen = new Set<number>();
    for (const building of buildings) {
      const type = buildingType(building.type);
      if (!type) {
        continue;
      }
      seen.add(building.id);
      const baseX = (building.x + type.footprint.w / 2) * TILE_SIZE;
      const baseY = (building.y + type.footprint.h) * TILE_SIZE;
      let entry = this.sprites.get(building.id);
      if (!entry) {
        const origin = buildingOrigin(type);
        const image = this.scene.add
          .image(baseX, baseY, buildingTextureKey(type.id))
          .setOrigin(origin.x, origin.y)
          .setScale(1 / TEXTURE_SCALE)
          .setDepth(baseY - 4);
        this.layer.add(image);
        entry = { image, typeId: type.id, x: building.x, y: building.y, baseY };
        this.sprites.set(building.id, entry);
        if (animate) {
          this.popIn(image);
        }
      } else if (entry.x !== building.x || entry.y !== building.y) {
        entry.x = building.x;
        entry.y = building.y;
        entry.baseY = baseY;
        entry.image.setPosition(baseX, baseY).setDepth(baseY - 4);
        if (animate) {
          this.popIn(entry.image);
        }
      }
    }
    for (const [id, entry] of this.sprites) {
      if (!seen.has(id)) {
        const type = buildingType(entry.typeId);
        if (animate && type) {
          this.puff((entry.x + type.footprint.w / 2) * TILE_SIZE, (entry.y + type.footprint.h / 2) * TILE_SIZE, Math.max(type.footprint.w, type.footprint.h));
        }
        entry.image.destroy();
        this.sprites.delete(id);
        this.delivered.delete(id);
        this.rocking.delete(id);
        if (this.liftedId === id) {
          this.liftedId = undefined;
        }
        if (this.tintedId === id) {
          this.tintedId = undefined;
        }
      }
    }
  }

  private syncPaths(animate: boolean): void {
    const { world, paths } = this.simulation.state;
    const { width, height } = world;
    const laid = new Set<number>(paths);
    const isPath = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && laid.has(y * width + x);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = tileIndex(world, x, y);
        const image = this.pathImages.get(index);
        if (!isPath(x, y)) {
          if (image) {
            if (animate) {
              this.puff((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE, 0.7);
            }
            image.destroy();
            this.pathImages.delete(index);
          }
          continue;
        }
        const mask = (isPath(x, y - 1) ? 1 : 0) | (isPath(x + 1, y) ? 2 : 0) | (isPath(x, y + 1) ? 4 : 0) | (isPath(x - 1, y) ? 8 : 0);
        const key = pathTextureKey(mask);
        if (!image) {
          const created = this.scene.add
            .image(x * TILE_SIZE, y * TILE_SIZE, key)
            .setOrigin(0, 0)
            .setScale(1 / TEXTURE_SCALE)
            .setDepth(PATH_DEPTH);
          this.layer.add(created);
          this.pathImages.set(index, created);
          if (animate) {
            created.setAlpha(0.2);
            this.scene.tweens.add({ targets: created, alpha: 1, duration: 180 });
          }
        } else if (image.texture.key !== key) {
          image.setTexture(key);
        }
      }
    }
  }

  private syncSigns(animate: boolean): void {
    const { buildings } = this.simulation.state;
    const wanted = signsFor(this.simulation.state);
    for (const [id, kind] of wanted) {
      const building = buildings.find((b) => b.id === id);
      const type = building ? buildingType(building.type) : undefined;
      if (!building || !type) {
        continue;
      }
      const existing = this.markers.get(id);
      const baseX = (building.x + type.footprint.w / 2) * TILE_SIZE;
      // The tip of the sign points at the top of the roof or cap.
      const baseY = building.y * TILE_SIZE - type.look.rise * 0.62;
      if (existing && !existing.leaving && existing.kind === kind && existing.baseX === baseX && existing.baseY === baseY) {
        continue;
      }
      if (existing) {
        existing.image.destroy();
      }
      const image = this.scene.add
        .image(baseX, baseY, signTextureKey(kind))
        .setOrigin(0.5, 1)
        .setDepth(MARKER_DEPTH)
        .setScale(0);
      this.layer.add(image);
      this.markers.set(id, { image, kind, phase: id * 1.7, baseX, baseY, houseBottomY: (building.y + type.footprint.h) * TILE_SIZE, appear: animate ? 0 : 1, leaving: false });
    }
    for (const [id, marker] of this.markers) {
      if (!wanted.has(id)) {
        marker.leaving = true;
      }
    }
  }

  /** Moves the signs (bobbing, size for the current zoom) and wobbles the lifted building. `seconds` is simulation time, `minWorldY` the top edge (world px) they must stay below. */
  update(seconds: number, deltaMs: number, zoom: number, minWorldY = Number.NEGATIVE_INFINITY): void {
    const step = Math.min(deltaMs, 100) / 1000;
    // Whether a building waits for wood or has no path can change with every tick, not only with the revision.
    if (this.simulation.state.tick !== this.signTick) {
      this.signTick = this.simulation.state.tick;
      this.syncSigns(true);
    }
    this.updateProduction(seconds, zoom);
    this.updatePreviewSign(seconds, zoom, minWorldY);
    for (const [id, marker] of this.markers) {
      marker.appear = marker.leaving ? marker.appear - step * 5 : Math.min(1, marker.appear + step * 4);
      if (marker.leaving && marker.appear <= 0) {
        marker.image.destroy();
        this.markers.delete(id);
        continue;
      }
      const fit = Phaser.Math.Clamp(MARKER_MIN_CSS_PX / (MARKER_BUBBLE * zoom), 1, MARKER_MAX_SCALE);
      const pop = Phaser.Math.Easing.Back.Out(Math.max(0, marker.appear));
      const bob = Math.sin(seconds * 3 + marker.phase) * 4 * fit;
      // A house at the top of the screen: the sign slides down so it stays below the hint bar (`minWorldY`).
      marker.image
        .setPosition(marker.baseX, markerY(marker.baseY + bob - 4, minWorldY, MARKER_SIZE.height * fit * pop, marker.houseBottomY))
        .setScale((fit * pop) / TEXTURE_SCALE);
    }
    const lifted = this.liftedId === undefined ? undefined : this.sprites.get(this.liftedId);
    if (lifted) {
      lifted.image.setAngle(Math.sin(seconds * 9) * 2.4).setY(lifted.baseY - 8 + Math.sin(seconds * 9) * 1.5);
    }
  }

  /** The sign on the ghost of a building that would stand without a path: the same size and bob as the real one. */
  private updatePreviewSign(seconds: number, zoom: number, minWorldY: number): void {
    const at = this.previewSignAt;
    this.previewSign.setVisible(at !== undefined);
    if (!at) {
      return;
    }
    const fit = Phaser.Math.Clamp(MARKER_MIN_CSS_PX / (MARKER_BUBBLE * zoom), 1, MARKER_MAX_SCALE);
    // Like the real signs: under the hint bar if the ghost is at the top of the screen.
    this.previewSign
      .setPosition(at.x, markerY(at.y + Math.sin(seconds * 3) * 4 * fit - 4, minWorldY, MARKER_SIZE.height * fit, at.bottom))
      .setScale(fit / TEXTURE_SCALE);
  }

  /**
   * Working production buildings rock gently; whenever a building has
   * delivered something since the last look, a small picture with "+1" floats
   * up from its roof (coins for the market).
   */
  private updateProduction(seconds: number, zoom: number): void {
    const { production } = this.simulation.state;
    for (const producer of production) {
      const sprite = this.sprites.get(producer.buildingId);
      if (!sprite) {
        continue;
      }
      const lastDelivered = this.delivered.get(producer.buildingId);
      if (lastDelivered !== undefined && producer.delivered > lastDelivered) {
        this.popDelivery(producer.buildingId, zoom);
      }
      this.delivered.set(producer.buildingId, producer.delivered);

      const rocks = producer.status === 'working' && this.liftedId !== producer.buildingId;
      if (rocks) {
        const phase = seconds * 5.5 + producer.buildingId;
        sprite.image.setAngle(Math.sin(phase) * 1.1).setY(sprite.baseY - Math.max(0, Math.sin(phase * 2)) * 1.6);
        this.rocking.add(producer.buildingId);
      } else if (this.rocking.delete(producer.buildingId) && this.liftedId !== producer.buildingId) {
        sprite.image.setAngle(0).setY(sprite.baseY);
      }
    }
  }

  /** What a building delivered last: its outputs, or the coins the market earned. */
  private popDelivery(buildingId: number, zoom: number): void {
    const { buildings, production } = this.simulation.state;
    const building = buildings.find((b) => b.id === buildingId);
    const type = building ? buildingType(building.type) : undefined;
    const rules = building ? productionOf(building.type) : undefined;
    const producer = production.find((p) => p.buildingId === buildingId);
    if (!building || !type || !rules || !producer) {
      return;
    }
    const amounts: [string, number][] = rules.sell ? [['coins', producer.lastSale]] : Object.entries(rules.outputs);
    this.popAmounts((building.x + type.footprint.w / 2) * TILE_SIZE, building.y * TILE_SIZE - type.look.rise * 0.5, amounts, zoom);
  }

  /**
   * Little pictures with "+3" that float up from a world point and fade away
   * (a delivery, or the refund when something is demolished). Several
   * amounts stand next to each other.
   */
  popAmounts(x: number, y: number, amounts: readonly (readonly [string, number])[], zoom: number): void {
    const shown = amounts.filter(([, amount]) => amount > 0);
    // Big enough on screen even when the island is far away.
    const fit = Phaser.Math.Clamp(POPUP_MIN_CSS_PX / (28 * zoom), 1, 3);
    const gap = 62 * fit;
    shown.forEach(([id, amount], index) => {
      const offset = (index - (shown.length - 1) / 2) * gap;
      const picture = this.scene.add.image(-18 * fit, 0, goodTextureKey(id)).setDisplaySize(36 * fit, 36 * fit);
      const label = createLabel(this.scene, t('effect.plus', { count: amount }), 26).setPosition(16 * fit, 0).setScale(fit);
      const group = this.scene.add.container(x + offset, y, [picture, label]).setDepth(POPUP_DEPTH);
      this.layer.add(group);
      group.setAlpha(0);
      this.scene.tweens.add({ targets: group, alpha: 1, duration: 140 });
      this.scene.tweens.add({
        targets: group,
        y: y - 64 * fit,
        duration: POPUP_MS,
        ease: 'Sine.easeOut',
      });
      this.scene.tweens.add({
        targets: group,
        alpha: 0,
        delay: POPUP_MS * 0.55,
        duration: POPUP_MS * 0.45,
        onComplete: () => group.destroy(),
      });
    });
  }

  /** Shows (or hides, with `undefined`) the area around the production building whose info card is open. */
  setInspect(buildingId: number | undefined): void {
    if (buildingId === this.inspectId) {
      return;
    }
    this.inspectId = buildingId;
    const g = this.inspectOverlay.clear();
    const building = buildingId === undefined ? undefined : this.simulation.state.buildings.find((b) => b.id === buildingId);
    const type = building ? buildingType(building.type) : undefined;
    if (building && type) {
      this.drawNearby(g, building.type, building.x, building.y);
    }
  }

  /** The soft area a lumberjack / quarry works in, with the trees / rocks in it marked. */
  private drawNearby(g: Phaser.GameObjects.Graphics, typeId: string, x: number, y: number): void {
    const type = buildingType(typeId);
    const nearby = productionOf(typeId)?.needsNearby;
    if (!type || !nearby) {
      return;
    }
    const { world } = this.simulation.state;
    const area = nearbyArea(world, type, x, y, nearby.radius);
    const left = area.x0 * TILE_SIZE;
    const top = area.y0 * TILE_SIZE;
    const w = (area.x1 - area.x0 + 1) * TILE_SIZE;
    const h = (area.y1 - area.y0 + 1) * TILE_SIZE;
    g.fillStyle(COLORS.radiusFill, 0.2).fillRoundedRect(left, top, w, h, 22);
    g.lineStyle(4, COLORS.radiusFill, 0.75).strokeRoundedRect(left, top, w, h, 22);
    for (const tile of nearbyTiles(world, type, x, y, nearby.terrain, nearby.radius)) {
      g.fillStyle(COLORS.radiusFill, 0.38).fillRoundedRect(tile.x * TILE_SIZE + 3, tile.y * TILE_SIZE + 3, TILE_SIZE - 6, TILE_SIZE - 6, 12);
      g.lineStyle(3, COLORS.white, 0.9).strokeCircle((tile.x + 0.5) * TILE_SIZE, (tile.y + 0.5) * TILE_SIZE, 11);
    }
  }

  /** Shows what the child is about to build, move or demolish (green = fits, red = does not). */
  setPreview(preview: Preview): void {
    const g = this.overlay.clear();
    this.badges.clear();
    this.ghost.setVisible(false);
    this.previewSignAt = undefined;
    this.resetHighlights();

    switch (preview.kind) {
      case 'none':
        return;
      case 'place': {
        this.drawNearby(g, preview.typeId, preview.x, preview.y);
        this.showGhost(preview.typeId, preview.x, preview.y, preview.result === 'ok');
        if (preview.result === 'ok' && !preview.connected) {
          this.showPreviewSign(preview.typeId, preview.x, preview.y);
        }
        break;
      }
      case 'path': {
        for (const tile of preview.tiles) {
          this.drawPathTile(tile);
        }
        break;
      }
      case 'move': {
        const type = buildingType(preview.typeId);
        if (type) {
          fillTiles(g, preview.from.x, preview.from.y, type.footprint.w, type.footprint.h, COLORS.selected, 0.4);
        }
        this.liftedId = preview.id;
        if (preview.target) {
          this.drawNearby(g, preview.typeId, preview.target.x, preview.target.y);
          this.showGhost(preview.typeId, preview.target.x, preview.target.y, preview.target.result === 'ok');
          if (preview.target.result === 'ok' && !preview.target.connected) {
            this.showPreviewSign(preview.typeId, preview.target.x, preview.target.y);
          }
        }
        break;
      }
      case 'demolish': {
        for (const tile of preview.tiles) {
          fillTiles(g, tile.x, tile.y, 1, 1, COLORS.ghostBad, 0.5);
        }
        if (preview.tiles.length > 0) {
          const xs = preview.tiles.map((tile) => tile.x);
          const ys = preview.tiles.map((tile) => tile.y);
          const left = Math.min(...xs);
          const top = Math.min(...ys);
          drawCornerBadge(this.badges, left, top, Math.max(...xs) - left + 1, Math.max(...ys) - top + 1, false);
        }
        const first = preview.tiles[0];
        const building = first ? buildingAt(this.simulation.state, first.x, first.y) : undefined;
        const sprite = building ? this.sprites.get(building.id) : undefined;
        if (building && sprite) {
          sprite.image.setTint(COLORS.demolishTint);
          this.tintedId = building.id;
        }
        break;
      }
      case 'invite': {
        // The house the new resident will move into (with a ✓ when ✓ can send the boat).
        const home = preview.home === undefined ? undefined : this.simulation.state.buildings.find((b) => b.id === preview.home);
        const type = home ? buildingType(home.type) : undefined;
        if (home && type) {
          const fits = preview.result === 'ok';
          fillTiles(g, home.x, home.y, type.footprint.w, type.footprint.h, fits ? COLORS.ghostOk : COLORS.selected, 0.45);
          if (fits) {
            drawCornerBadge(this.badges, home.x, home.y, type.footprint.w, type.footprint.h, true);
          }
        }
        break;
      }
    }
  }

  /** The "no path" sign over the ghost, if the building needs a path (houses and production buildings). */
  private showPreviewSign(typeId: string, x: number, y: number): void {
    const type = buildingType(typeId);
    if (type?.needsPath) {
      this.previewSignAt = { x: (x + type.footprint.w / 2) * TILE_SIZE, y: y * TILE_SIZE - type.look.rise * 0.62, bottom: (y + type.footprint.h) * TILE_SIZE };
    }
  }

  private resetHighlights(): void {
    if (this.liftedId !== undefined) {
      const lifted = this.sprites.get(this.liftedId);
      lifted?.image.setAngle(0).setY(lifted.baseY);
      this.liftedId = undefined;
    }
    if (this.tintedId !== undefined) {
      this.sprites.get(this.tintedId)?.image.clearTint();
      this.tintedId = undefined;
    }
  }

  private showGhost(typeId: string, x: number, y: number, fits: boolean): void {
    const type = buildingType(typeId);
    if (!type) {
      return;
    }
    const color = fits ? COLORS.ghostOk : COLORS.ghostBad;
    // The ground under the ghost is green or red, with a ✓ or ✕ sign on top: no colour guessing needed.
    fillTiles(this.overlay, x, y, type.footprint.w, type.footprint.h, color, 0.55);
    drawCornerBadge(this.badges, x, y, type.footprint.w, type.footprint.h, fits);
    const origin = buildingOrigin(type);
    // The picture keeps its own colours (a tint would turn yellow-on-red orange).
    this.ghost
      .setTexture(buildingTextureKey(typeId))
      .setOrigin(origin.x, origin.y)
      .setScale(1 / TEXTURE_SCALE)
      .setPosition((x + type.footprint.w / 2) * TILE_SIZE, (y + type.footprint.h) * TILE_SIZE)
      .setAlpha(0.82)
      .clearTint()
      .setVisible(true);
  }

  private drawPathTile(tile: PathPreviewTile): void {
    const g = this.overlay;
    if (tile.status === 'existing') {
      g.lineStyle(3, COLORS.ghostOk, 0.8).strokeRoundedRect(tile.x * TILE_SIZE + 6, tile.y * TILE_SIZE + 6, TILE_SIZE - 12, TILE_SIZE - 12, 8);
      return;
    }
    const color = tile.status === 'ok' ? COLORS.ghostOk : COLORS.ghostBad;
    fillTiles(g, tile.x, tile.y, 1, 1, color, 0.55);
    if (tile.status === 'blocked') {
      drawBadge(this.badges, (tile.x + 0.5) * TILE_SIZE, (tile.y + 0.5) * TILE_SIZE, false, 0.6);
    } else {
      // A small stone in the middle of a tile that will get a path.
      g.fillStyle(COLORS.white, 0.9).fillCircle((tile.x + 0.5) * TILE_SIZE, (tile.y + 0.5) * TILE_SIZE, 6);
    }
  }

  private popIn(image: Phaser.GameObjects.Image): void {
    const scale = 1 / TEXTURE_SCALE;
    image.setScale(scale * 0.7);
    this.scene.tweens.add({ targets: image, scaleX: scale, scaleY: scale, duration: 260, ease: 'Back.easeOut' });
  }

  /** A short cloud of puffs around a point; `size` is about the number of tiles it spreads over. */
  puff(x: number, y: number, size: number): void {
    const count = 7;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + 0.4;
      const reach = TILE_SIZE * 0.42 * size;
      const image = this.scene.add
        .image(x + Math.cos(angle) * reach * 0.25, y + Math.sin(angle) * reach * 0.2, PUFF_KEY)
        .setDepth(PUFF_DEPTH)
        .setScale((0.5 + 0.18 * size) / TEXTURE_SCALE)
        .setAlpha(0.95);
      this.layer.add(image);
      this.scene.tweens.add({
        targets: image,
        x: x + Math.cos(angle) * reach,
        y: y + Math.sin(angle) * reach * 0.75 - 10,
        scale: (1.1 + 0.35 * size) / TEXTURE_SCALE,
        alpha: 0,
        duration: 520,
        ease: 'Cubic.easeOut',
        onComplete: () => image.destroy(),
      });
    }
  }
}

function fillTiles(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, color: number, alpha: number): void {
  const left = x * TILE_SIZE + 3;
  const top = y * TILE_SIZE + 3;
  g.fillStyle(color, alpha).fillRoundedRect(left, top, w * TILE_SIZE - 6, h * TILE_SIZE - 6, 10);
  g.lineStyle(3, color, 0.95).strokeRoundedRect(left, top, w * TILE_SIZE - 6, h * TILE_SIZE - 6, 10);
}

/** A round sign with a ✓ (fits) or ✕ (does not) – so the preview is clear without telling green from red. */
function drawBadge(g: Phaser.GameObjects.Graphics, x: number, y: number, fits: boolean, scale = 1): void {
  const r = 20 * scale;
  g.fillStyle(COLORS.white, 1).fillCircle(x, y, r);
  g.fillStyle(fits ? COLORS.confirm : COLORS.cancel, 1).fillCircle(x, y, r * 0.84);
  g.lineStyle(r * 0.28, COLORS.white, 1);
  g.beginPath();
  if (fits) {
    g.moveTo(x - r * 0.4, y + r * 0.02).lineTo(x - r * 0.1, y + r * 0.32).lineTo(x + r * 0.42, y - r * 0.3);
  } else {
    g.moveTo(x - r * 0.32, y - r * 0.32).lineTo(x + r * 0.32, y + r * 0.32);
    g.moveTo(x - r * 0.32, y + r * 0.32).lineTo(x + r * 0.32, y - r * 0.32);
  }
  g.strokePath();
}

/** The ✓ / ✕ sign on the ground at the front right corner of a footprint – not on the door in the middle. */
function drawCornerBadge(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, fits: boolean): void {
  const scale = w === 1 && h === 1 ? 0.8 : 1;
  const r = 20 * scale;
  drawBadge(g, (x + w) * TILE_SIZE - r - 5, (y + h) * TILE_SIZE - r - 5, fits, scale);
}
