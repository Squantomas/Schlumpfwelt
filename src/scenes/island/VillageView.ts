import Phaser from 'phaser';
import { buildingType } from '../../data/buildings';
import { buildingAt, isPath, tileIndex, unconnectedBuildings, type Tile } from '../../sim/buildings';
import type { Simulation } from '../../sim/simulation';
import type { Rect } from '../../ui/cameraMath';
import type { PathPreviewTile, Preview } from '../../ui/buildTool';
import { COLORS, TILE_SIZE } from '../../ui/style';
import {
  MARKER_BUBBLE,
  MARKER_KEY,
  PUFF_KEY,
  buildingOrigin,
  buildingTextureKey,
  pathTextureKey,
  registerBuildingTextures,
} from './buildingTextures';
import { TEXTURE_SCALE } from './objectTextures';

const PATH_DEPTH = 2;
const OVERLAY_DEPTH = 800_000;
const GHOST_DEPTH = 800_001;
const PUFF_DEPTH = 900_000;
const MARKER_DEPTH = 950_000;
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
  readonly phase: number;
  readonly baseX: number;
  readonly baseY: number;
  /** 0 … 1: how far the sign has popped in; going down means it is leaving. */
  appear: number;
  leaving: boolean;
}

/**
 * Draws what the simulation says is built: house and deco sprites (sorted by
 * their front edge like trees), path tiles that join their neighbours, the
 * signs above houses without a path, the preview of what the child is about
 * to build, and little puffs. It only reads the state; `sync()` compares the
 * state's `revision` with the last drawn one and redraws only on a change.
 */
export class VillageView {
  private readonly sprites = new Map<number, BuildingSprite>();
  private readonly pathImages = new Map<number, Phaser.GameObjects.Image>();
  private readonly markers = new Map<number, Marker>();
  private readonly overlay: Phaser.GameObjects.Graphics;
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
    this.overlay = scene.add.graphics().setDepth(OVERLAY_DEPTH);
    this.ghost = scene.add.image(0, 0, PUFF_KEY).setDepth(GHOST_DEPTH).setVisible(false);
    layer.add([this.overlay, this.ghost]);
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
    this.syncMarkers(animate);
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
    const state = this.simulation.state;
    const { width, height } = state.world;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = tileIndex(state.world, x, y);
        const image = this.pathImages.get(index);
        if (!isPath(state, x, y)) {
          if (image) {
            if (animate) {
              this.puff((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE, 0.7);
            }
            image.destroy();
            this.pathImages.delete(index);
          }
          continue;
        }
        const mask = (isPath(state, x, y - 1) ? 1 : 0) | (isPath(state, x + 1, y) ? 2 : 0) | (isPath(state, x, y + 1) ? 4 : 0) | (isPath(state, x - 1, y) ? 8 : 0);
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

  private syncMarkers(animate: boolean): void {
    const { buildings } = this.simulation.state;
    const missing = new Set(unconnectedBuildings(this.simulation.state));
    for (const id of missing) {
      const building = buildings.find((b) => b.id === id);
      const type = building ? buildingType(building.type) : undefined;
      if (!building || !type) {
        continue;
      }
      const existing = this.markers.get(id);
      const baseX = (building.x + type.footprint.w / 2) * TILE_SIZE;
      // The tip of the sign points at the top of the cap.
      const baseY = building.y * TILE_SIZE - type.look.rise * 0.62;
      if (existing && !existing.leaving && existing.baseX === baseX && existing.baseY === baseY) {
        continue;
      }
      if (existing) {
        existing.image.destroy();
      }
      const image = this.scene.add
        .image(baseX, baseY, MARKER_KEY)
        .setOrigin(0.5, 1)
        .setDepth(MARKER_DEPTH)
        .setScale(0);
      this.layer.add(image);
      this.markers.set(id, { image, phase: id * 1.7, baseX, baseY, appear: animate ? 0 : 1, leaving: false });
    }
    for (const [id, marker] of this.markers) {
      if (!missing.has(id)) {
        marker.leaving = true;
      }
    }
  }

  /** Moves the signs (bobbing, size for the current zoom) and wobbles the lifted building. `seconds` is simulation time. */
  update(seconds: number, deltaMs: number, zoom: number): void {
    const step = Math.min(deltaMs, 100) / 1000;
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
      marker.image.setPosition(marker.baseX, marker.baseY + bob - 4).setScale((fit * pop) / TEXTURE_SCALE);
    }
    const lifted = this.liftedId === undefined ? undefined : this.sprites.get(this.liftedId);
    if (lifted) {
      lifted.image.setAngle(Math.sin(seconds * 9) * 2.4).setY(lifted.baseY - 8 + Math.sin(seconds * 9) * 1.5);
    }
  }

  /** The world rectangle (px) that the preview covers, including how far the picture reaches up. */
  previewBounds(preview: Preview): Rect | undefined {
    const T = TILE_SIZE;
    const state = this.simulation.state;
    switch (preview.kind) {
      case 'none':
        return undefined;
      case 'place': {
        const type = buildingType(preview.typeId);
        return type ? box(preview.x, preview.y, type.footprint.w, type.footprint.h, type.look.rise) : undefined;
      }
      case 'path':
        return tilesBox(preview.tiles);
      case 'move': {
        const type = buildingType(preview.typeId);
        const at = preview.target ?? preview.from;
        return type ? box(at.x, at.y, type.footprint.w, type.footprint.h, type.look.rise) : undefined;
      }
      case 'demolish': {
        const first = preview.tiles[0];
        const building = first ? buildingAt(state, first.x, first.y) : undefined;
        const rise = (building ? buildingType(building.type)?.look.rise : 0) ?? 0;
        const bounds = tilesBox(preview.tiles);
        return bounds ? { x: bounds.x, y: bounds.y - rise, width: bounds.width, height: bounds.height + rise } : undefined;
      }
    }

    function box(x: number, y: number, w: number, h: number, rise: number): Rect {
      return { x: x * T, y: y * T - rise, width: w * T, height: h * T + rise };
    }
    function tilesBox(tiles: readonly Tile[]): Rect | undefined {
      if (tiles.length === 0) {
        return undefined;
      }
      const xs = tiles.map((tile) => tile.x);
      const ys = tiles.map((tile) => tile.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return { x: minX * T, y: minY * T, width: (Math.max(...xs) - minX + 1) * T, height: (Math.max(...ys) - minY + 1) * T };
    }
  }

  /** Shows what the child is about to build, move or demolish (green = fits, red = does not). */
  setPreview(preview: Preview): void {
    const g = this.overlay.clear();
    this.ghost.setVisible(false);
    this.resetHighlights();

    switch (preview.kind) {
      case 'none':
        return;
      case 'place': {
        this.showGhost(preview.typeId, preview.x, preview.y, preview.result === 'ok');
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
          this.showGhost(preview.typeId, preview.target.x, preview.target.y, preview.target.result === 'ok');
        }
        break;
      }
      case 'demolish': {
        for (const tile of preview.tiles) {
          fillTiles(g, tile.x, tile.y, 1, 1, COLORS.ghostBad, 0.5);
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
    fillTiles(this.overlay, x, y, type.footprint.w, type.footprint.h, color, 0.42);
    const origin = buildingOrigin(type);
    this.ghost
      .setTexture(buildingTextureKey(typeId))
      .setOrigin(origin.x, origin.y)
      .setScale(1 / TEXTURE_SCALE)
      .setPosition((x + type.footprint.w / 2) * TILE_SIZE, (y + type.footprint.h) * TILE_SIZE)
      .setAlpha(0.8)
      .setTint(fits ? COLORS.ghostOkTint : COLORS.ghostBadTint)
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
    // A small stone in the middle of a tile that will get a path.
    g.fillStyle(0xffffff, 0.9).fillCircle((tile.x + 0.5) * TILE_SIZE, (tile.y + 0.5) * TILE_SIZE, 6);
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
