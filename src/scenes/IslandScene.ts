import Phaser from 'phaser';
import { CAMERA_CONFIG } from '../data/camera';
import { t } from '../data/texts';
import { buildingType } from '../data/buildings';
import { buildingAt, isConnected } from '../sim/buildings';
import { hash2 } from '../sim/random';
import type { Simulation } from '../sim/simulation';
import { isLand, landBounds, terrainAt, type Terrain } from '../sim/world';
import { BuildTool, type Preview } from '../ui/buildTool';
import { zoomLayout } from '../ui/buildLayout';
import { growRect, tileAtWorld, visibleRect, type CameraBounds, type Point, type Rect } from '../ui/cameraMath';
import { landRegions } from '../ui/cameraRegions';
import { simulationDelta } from '../ui/frameTime';
import { createLabel, setLabelSize } from '../ui/label';
import { RoundButton } from '../ui/RoundButton';
import { COLORS, TILE_SIZE, clamp, rgb } from '../ui/style';
import { onViewportChange, type ViewSize } from '../ui/viewport';
import { BuildUI } from './island/BuildUI';
import { groundSize, paintGround, repaintGround, type TileRange } from './island/groundTexture';
import {
  GLINT_KEY,
  OBJECT_ORIGIN,
  RING_KEY,
  RING_OUTER_FRACTION,
  RING_SIZE,
  ROCK_KEYS,
  TEXTURE_SCALE,
  TREE_KEYS,
  registerIslandTextures,
} from './island/objectTextures';
import { VillageView } from './island/VillageView';
import { WorldCameraController } from './island/WorldCameraController';
import { ISLAND_EVENTS, SCENES, type TileTapEvent } from './keys';
import { markActiveScene, markCamera, markTap, markVillage } from './sceneMarker';

/** How long the greeting stays fully visible, then it fades away (ms). */
const GREETING_SHOW_MS = 3500;
const GREETING_FADE_MS = 900;
/** Tap ring: how long it takes to grow and fade away (ms). */
const RING_MS = 900;
/** The ring stays fully visible this long before it fades (ms). */
const RING_HOLD_MS = 500;
/** Depth of things above all objects (their depth is their y position in the world). */
const TOP_DEPTH = 1_000_000;

interface Glint {
  readonly sprite: Phaser.GameObjects.Image;
  readonly phase: number;
}

/**
 * The island: ground baked into one texture, trees and rocks as sprites
 * sorted by their y position, a camera you can drag, pinch and wheel-zoom.
 *
 * This scene drives the simulation – `simulation.update()` is called here and
 * nowhere else. The display only reads the state. The glints on the water are
 * drawn from the smooth simulation time `(tick + alpha) * tickMs`, so they
 * move fluidly although the simulation only ticks 10 times per second, and
 * stand still while the simulation is paused.
 *
 * Two cameras: the world camera (behind) shows `worldLayer`; the main camera
 * (in front, CSS pixels as everywhere else) shows `uiLayer`.
 */
export class IslandScene extends Phaser.Scene {
  private readonly simulation: Simulation;
  private worldLayer!: Phaser.GameObjects.Layer;
  private uiLayer!: Phaser.GameObjects.Layer;
  private worldCamera!: Phaser.Cameras.Scene2D.Camera;
  private controller!: WorldCameraController;
  private glints: Glint[] = [];
  /** Tree and rock sprites by tile index (`y * width + x`); M2/M3 remove them when forest is cleared. */
  private readonly objects = new Map<number, Phaser.GameObjects.Image>();
  private ring!: Phaser.GameObjects.Image;
  private ringTween: Phaser.Tweens.Tween | undefined;
  private ringFade: Phaser.Tweens.Tween | undefined;
  private groundKey = '';
  private groundTexture: Phaser.Textures.CanvasTexture | undefined;
  /** The terrain as it is drawn now: the scene compares it with the state when the revision changes. */
  private drawnTerrain: Terrain[] = [];
  private terrainRevision = 0;
  /** What redrawing the ground cost so far (`<html data-repaint>`): count, last and most time in ms, and the tiles of the last one. */
  private repaint = { count: 0, last: 0, max: 0, tiles: 0 };
  private cameraBounds!: { -readonly [K in keyof CameraBounds]: CameraBounds[K] };
  private zoomButtons: RoundButton[] = [];
  private cameraKey = '';
  private landInView = 0;
  private buildTool!: BuildTool;
  private village!: VillageView;
  private buildUI!: BuildUI;
  private greeting!: Phaser.GameObjects.Text;
  private preview: Preview = { kind: 'none' };
  private previewKey = '';
  private publishedRevision = -1;
  private buildings = '[]';
  private paths = '';
  private terrain = '';
  private previewText = 'none';
  private producers = '[]';
  private producersTick = -1;

  constructor(simulation: Simulation) {
    super(SCENES.island);
    this.simulation = simulation;
  }

  create(): void {
    markActiveScene(SCENES.island);

    const { seed, world } = this.simulation.state;
    registerIslandTextures(this);
    // A restarted scene starts clean (the instance is reused).
    this.glints = [];
    this.objects.clear();
    this.ringTween = undefined;
    this.ringFade = undefined;
    this.previewKey = '';
    this.publishedRevision = -1;
    this.preview = { kind: 'none' };
    this.drawnTerrain = [...world.tiles];
    this.terrainRevision = this.simulation.state.revision;
    this.repaint = { count: 0, last: 0, max: 0, tiles: 0 };

    this.worldLayer = this.add.layer();
    this.uiLayer = this.add.layer();

    // World camera behind, main camera (UI) in front and see-through.
    this.worldCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height, false, 'world');
    Phaser.Utils.Array.SendToBack(this.cameras.cameras, this.worldCamera);
    this.worldCamera.setBackgroundColor(COLORS.waterDeep).ignore(this.uiLayer);
    this.cameras.main.setBackgroundColor('rgba(0,0,0,0)').ignore(this.worldLayer);

    this.buildGround(seed);
    this.buildObjects(seed);
    this.buildGlints(seed);
    this.village = new VillageView(this, this.worldLayer, this.simulation);
    this.village.sync();
    this.buildTool = new BuildTool(
      () => this.simulation.state,
      (command) => {
        this.simulation.send(command);
      },
      ({ at, refund }) => {
        // What the player gets back for a demolished building floats up where it stood.
        const type = buildingAt(this.simulation.state, at.x, at.y);
        const size = type ? buildingType(type.type)?.footprint : undefined;
        this.village.popAmounts(
          (at.x + (size?.w ?? 1) / 2) * TILE_SIZE,
          (at.y + (size?.h ?? 1) / 2) * TILE_SIZE,
          Object.entries(refund),
          this.controller.view.zoom,
        );
      },
    );
    this.terrain = terrainLetters(world);
    this.ring = this.add.image(0, 0, RING_KEY).setDepth(TOP_DEPTH).setVisible(false);
    this.worldLayer.add(this.ring);

    const bounds = {
      ...growRect(
        { x: 0, y: 0, width: world.width * TILE_SIZE, height: world.height * TILE_SIZE },
        CAMERA_CONFIG.marginTiles * TILE_SIZE,
      ),
      // The screen centre stays on or right next to land: the island can never leave the picture.
      centerRegions: landRegions(world, TILE_SIZE, CAMERA_CONFIG.landMarginTiles),
    };
    // The camera reads this object each time; new land (a filled beach) replaces the regions.
    this.cameraBounds = bounds;
    this.controller = new WorldCameraController(this, this.worldCamera, {
      bounds,
      focus: islandFocus(world),
      focusPadding: 12,
      tileSize: TILE_SIZE,
      maxTileCssPx: CAMERA_CONFIG.maxTileCssPx,
      minStartTileCssPx: CAMERA_CONFIG.minStartTileCssPx,
      // The start village sits in the middle of the island.
      startCenter: { x: (world.width / 2) * TILE_SIZE, y: (world.height / 2) * TILE_SIZE },
      tapMaxMovePx: CAMERA_CONFIG.tapMaxMovePx,
      wheelZoomPerPixel: CAMERA_CONFIG.wheelZoomPerPixel,
      blocksCamera: (object) => object.displayList === this.uiLayer,
      blocksPoint: (x, y) => this.buildUI.coversPoint(x, y),
      onTap: (point, _screen, time) => this.handleTap(point, time),
    });

    const greeting = createLabel(this, t('island.greeting'), 64);
    this.greeting = greeting;
    this.uiLayer.add(greeting);
    this.tweens.add({ targets: greeting, alpha: 0, delay: GREETING_SHOW_MS, duration: GREETING_FADE_MS });

    const zoomIn = new RoundButton(this, 0, 0, {
      radius: 34, // the real size comes from `zoomLayout` in the layout callback
      icon: 'plus',
      onTap: () => this.controller.zoomBy(CAMERA_CONFIG.buttonZoomFactor),
    });
    const zoomOut = new RoundButton(this, 0, 0, {
      radius: 34, // the real size comes from `zoomLayout` in the layout callback
      icon: 'minus',
      onTap: () => this.controller.zoomBy(1 / CAMERA_CONFIG.buttonZoomFactor),
    });
    this.uiLayer.add([zoomIn, zoomOut]);
    this.zoomButtons = [zoomIn, zoomOut];
    this.buildUI = new BuildUI(
      this,
      this.uiLayer,
      this.buildTool,
      () => this.simulation.state,
      () => {
        this.previewKey = '';
      },
    );

    onViewportChange(this, ({ width, height }: ViewSize) => {
      this.controller.layout({ width, height });

      const m = Math.min(width, height);
      setLabelSize(greeting, clamp(m * 0.07, 26, 64), width * 0.9);

      // The zoom buttons sit at the top right; the bottom belongs to the toolbar.
      const zoom = zoomLayout(width, height);
      zoomIn.setRadius(zoom.radius).setPosition(zoom.zoomIn.x, zoom.zoomIn.y);
      zoomOut.setRadius(zoom.radius).setPosition(zoom.zoomOut.x, zoom.zoomOut.y);
      this.buildUI.layout(
        { width, height },
        {
          'zoom-in': { x: zoomIn.x, y: zoomIn.y, enabled: true },
          'zoom-out': { x: zoomOut.x, y: zoomOut.y, enabled: true },
        },
      );
      // The greeting sits below the store bar.
      greeting.setPosition(width / 2, this.buildUI.stockBottom + 12 + greeting.height / 2);
    });

    const fade = rgb(COLORS.waterDeep);
    this.cameras.main.fadeIn(300, ...fade);
    this.worldCamera.fadeIn(300, ...fade);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.textures.remove(this.groundKey);
    });
  }

  override update(_time: number, delta: number): void {
    // The raw frame time, not Phaser's smoothed `delta`: only the clock of the simulation caps a frame (see frameTime.ts).
    const alpha = this.simulation.update(simulationDelta(this.game.loop.rawDelta, delta));
    const seconds = ((this.simulation.state.tick + alpha) * this.simulation.tickMs) / 1000;

    this.controller.update(delta);
    this.publishCamera();
    this.updateVillage(seconds, delta);

    for (const { sprite, phase } of this.glints) {
      const wave = 0.5 + 0.5 * Math.sin(seconds * 1.6 + phase);
      sprite.setAlpha(0.15 + 0.45 * wave).setScale((0.8 + 0.3 * wave) / TEXTURE_SCALE);
    }
  }

  /** Publishes the camera for tests (`<html data-camera-*>`); the land count is only recomputed when the view changed. */
  private publishCamera(): void {
    const view = this.controller.view;
    const size = this.controller.viewSize;
    const key = `${String(view.zoom)}|${String(view.centerX)}|${String(view.centerY)}|${String(size.width)}|${String(size.height)}`;
    if (key !== this.cameraKey) {
      this.cameraKey = key;
      this.landInView = countLandIn(this.simulation.state.world, visibleRect(view, size));
    }
    markCamera({
      zoom: view.zoom,
      centerX: view.centerX,
      centerY: view.centerY,
      minZoom: this.controller.limits.min,
      maxZoom: this.controller.limits.max,
      landInView: this.landInView,
    });
  }

  /** Paints the ground once onto a canvas texture and shows it as one image. */
  private buildGround(seed: number): void {
    const { world } = this.simulation.state;
    const { width, height } = groundSize(world);
    this.groundKey = `ground-${String(seed)}`;
    if (this.textures.exists(this.groundKey)) {
      this.textures.remove(this.groundKey);
    }
    const texture = this.textures.createCanvas(this.groundKey, width, height);
    if (!texture) {
      return;
    }
    this.groundTexture = texture;
    paintGround(texture.getContext(), world, seed);
    texture.refresh();
    this.worldLayer.add(this.add.image(0, 0, this.groundKey).setOrigin(0, 0).setDepth(0));
  }

  /** One tree per forest tile, one rock per rock tile; the sprite's depth is its ground y. */
  private buildObjects(seed: number): void {
    const { world } = this.simulation.state;
    for (let y = 0; y < world.height; y += 1) {
      for (let x = 0; x < world.width; x += 1) {
        this.addObject(seed, x, y, false);
      }
    }
  }

  /** Puts the tree or rock of a forest or rock tile on the map (nothing for other terrain). A new one pops in. */
  private addObject(seed: number, x: number, y: number, animate: boolean): void {
    const { world } = this.simulation.state;
    const terrain = terrainAt(world, x, y);
    if (terrain !== 'forest' && terrain !== 'rock') {
      return;
    }
    const r = (n: number): number => hash2(seed + n * 977, x, y);
    const groundX = (x + 0.5 + (r(1) - 0.5) * 0.3) * TILE_SIZE;
    const groundY = (y + 0.84 + (r(2) - 0.5) * 0.2) * TILE_SIZE;
    const isTree = terrain === 'forest';
    const keys = isTree ? TREE_KEYS : ROCK_KEYS;
    const key = keys[Math.floor(r(3) * keys.length)] ?? keys[0];
    const origin = isTree ? OBJECT_ORIGIN.tree : OBJECT_ORIGIN.rock;
    const size = (isTree ? 0.9 + r(4) * 0.25 : 0.85 + r(4) * 0.3) / TEXTURE_SCALE;
    const flip = r(5) < 0.5 ? size : -size;
    const sprite = this.add.image(groundX, groundY, key).setOrigin(origin.x, origin.y).setScale(flip, size).setDepth(groundY);
    this.worldLayer.add(sprite);
    this.objects.set(y * world.width + x, sprite);
    if (animate) {
      sprite.setScale(flip * 0.3, size * 0.3);
      this.tweens.add({ targets: sprite, scaleX: flip, scaleY: size, duration: 320, ease: 'Back.easeOut' });
    }
  }

  /** Makes the ground, the trees and rocks, the sea glints and the camera limits follow the terrain of the state. */
  private syncTerrain(): void {
    const { world, seed } = this.simulation.state;
    let x0 = Number.POSITIVE_INFINITY;
    let y0 = Number.POSITIVE_INFINITY;
    let x1 = Number.NEGATIVE_INFINITY;
    let y1 = Number.NEGATIVE_INFINITY;
    let landChanged = false;
    const changed: { x: number; y: number }[] = [];
    for (let y = 0; y < world.height; y += 1) {
      for (let x = 0; x < world.width; x += 1) {
        const now = terrainAt(world, x, y);
        const before = this.drawnTerrain[y * world.width + x];
        if (now !== before) {
          changed.push({ x, y });
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
          landChanged ||= isLand(now) !== (before !== undefined && isLand(before));
          this.drawnTerrain[y * world.width + x] = now;
        }
      }
    }
    if (changed.length === 0) {
      return;
    }
    // Ground: only the surroundings of the changed tiles are painted again (a whole new picture, if very much changed).
    const started = performance.now();
    const texture = this.groundTexture;
    let tiles = 0;
    if (texture) {
      const range: TileRange = { x0, y0, x1, y1 };
      const everything = (x1 - x0 + 1) * (y1 - y0 + 1) > (world.width * world.height) / 4;
      if (everything) {
        paintGround(texture.getContext(), world, seed);
        tiles = world.width * world.height;
      } else {
        const area = repaintGround(texture.getContext(), world, seed, range);
        tiles = (area.x1 - area.x0 + 1) * (area.y1 - area.y0 + 1);
      }
      texture.refresh();
    }
    const elapsed = performance.now() - started;
    this.repaint = { count: this.repaint.count + 1, last: elapsed, max: Math.max(this.repaint.max, elapsed), tiles };

    for (const { x, y } of changed) {
      const index = y * world.width + x;
      this.objects.get(index)?.destroy();
      this.objects.delete(index);
      this.addObject(seed, x, y, true);
      this.village.puff((x + 0.5) * TILE_SIZE, (y + 0.5) * TILE_SIZE, 1);
    }
    // Sea glints on tiles that are land now.
    this.glints = this.glints.filter(({ sprite }) => {
      if (isLand(terrainAt(world, Math.floor(sprite.x / TILE_SIZE), Math.floor(sprite.y / TILE_SIZE)))) {
        sprite.destroy();
        return false;
      }
      return true;
    });
    if (landChanged) {
      // New land is somewhere the camera may look at.
      this.cameraBounds.centerRegions = landRegions(world, TILE_SIZE, CAMERA_CONFIG.landMarginTiles);
    }
    this.terrain = terrainLetters(world);
  }

  /** The tree or rock sprite standing on a tile, if there is one. */
  objectAt(x: number, y: number): Phaser.GameObjects.Image | undefined {
    return this.objects.get(y * this.simulation.state.world.width + x);
  }

  /** A few twinkles on the sea near the coast. */
  private buildGlints(seed: number): void {
    const { world } = this.simulation.state;
    const nearLand = (x: number, y: number): boolean => {
      for (let dy = -3; dy <= 3; dy += 1) {
        for (let dx = -3; dx <= 3; dx += 1) {
          if (isLand(terrainAt(world, x + dx, y + dy))) {
            return true;
          }
        }
      }
      return false;
    };
    for (let y = 0; y < world.height; y += 1) {
      for (let x = 0; x < world.width; x += 1) {
        if (terrainAt(world, x, y) !== 'water' || hash2(seed + 4242, x, y) > 0.07 || !nearLand(x, y)) {
          continue;
        }
        const sprite = this.add
          .image(
            (x + 0.15 + hash2(seed + 4243, x, y) * 0.7) * TILE_SIZE,
            (y + 0.15 + hash2(seed + 4244, x, y) * 0.7) * TILE_SIZE,
            GLINT_KEY,
          )
          .setScale(1 / TEXTURE_SCALE)
          .setDepth(1);
        this.worldLayer.add(sprite);
        this.glints.push({ sprite, phase: hash2(seed + 4245, x, y) * Math.PI * 2 });
      }
    }
  }

  /** A short touch on the world: announce the tile and show a soft ring on it. */
  private handleTap(world: Point, eventTime: number): void {
    // Right after ✓ or ✕ (double taps) a tap on the world must not start a new preview.
    if (this.buildUI.worldTapsPaused(eventTime)) {
      return;
    }
    // The open shop covers the island: a tap beside the panel does nothing (✕ closes it).
    if (this.buildUI.shopOpen) {
      return;
    }
    // A tap beside the open info card closes it and does nothing else.
    if (this.buildTool.inspectedId !== undefined) {
      this.buildTool.closeInfo();
      return;
    }
    const map = this.simulation.state.world;
    const tile = tileAtWorld(world, TILE_SIZE, map);
    if (!tile) {
      return;
    }
    const event: TileTapEvent = tile;
    markTap(tile);
    this.events.emit(ISLAND_EVENTS.tileTap, event);
    if (this.buildTool.tool === 'view') {
      this.showRing(tile);
    }
    const notice = this.buildTool.tap(tile, world);
    if (notice) {
      this.buildUI.showNotice(notice);
    } else if (this.buildTool.tool === 'view') {
      // The sign above a building is tapped too: a production building opens its card, a house says what is missing.
      const signOf = this.village.markerAt(world.x, world.y);
      if (signOf !== undefined) {
        if (buildingType(this.simulation.state.buildings.find((b) => b.id === signOf)?.type ?? '')?.category === 'production') {
          this.buildTool.inspect(signOf);
        } else {
          this.buildUI.showNotice('hint.needsPath');
        }
      }
    }
  }

  /** Keeps the drawn village and the building controls in line with the state and the tool. */
  private updateVillage(seconds: number, deltaMs: number): void {
    // Terrain first (trees, beaches), so the village and the signs see the new ground.
    if (this.simulation.state.revision !== this.terrainRevision) {
      this.terrainRevision = this.simulation.state.revision;
      this.syncTerrain();
    }
    if (this.village.sync()) {
      this.buildTool.refresh();
    }
    this.buildUI.update();
    // The open shop covers the screen: no zoom buttons over it.
    for (const button of this.zoomButtons) {
      button.setVisible(!this.buildUI.shopOpen);
    }
    // A tool is on: the greeting makes room for the hint bar.
    if (this.buildTool.tool !== 'view') {
      this.greeting.setVisible(false);
    }

    const { revision } = this.simulation.state;
    const key = `${String(this.buildTool.version)}|${String(revision)}`;
    if (key !== this.previewKey) {
      this.previewKey = key;
      this.preview = this.buildTool.preview();
      this.previewText = describePreview(this.preview);
      this.village.setPreview(this.preview);
    }
    this.village.setInspect(this.buildTool.inspectedId);
    const view = this.controller.view;
    // The top of the visible world below the hint bar: house signs do not slide under the bar.
    const topEdge = view.centerY - this.controller.viewSize.height / (2 * view.zoom) + this.buildUI.topInset / view.zoom;
    this.village.update(seconds, deltaMs, view.zoom, topEdge);
    this.publishVillage(revision);
  }

  /** Publishes the building state for tests (`<html data-tool data-buildings …>`). */
  private publishVillage(revision: number): void {
    const state = this.simulation.state;
    if (state.tick !== this.producersTick) {
      this.producersTick = state.tick;
      // [building id, status, times delivered] – changes rarely, so the page attribute is rarely written.
      this.producers = JSON.stringify(state.production.map((p) => [p.buildingId, p.status, p.delivered]));
    }
    if (revision !== this.publishedRevision) {
      this.publishedRevision = revision;
      this.buildings = JSON.stringify(state.buildings.map((b) => [b.id, b.type, b.x, b.y, isConnected(state, b.id) ? 1 : 0]));
      const tiles: string[] = [];
      for (const index of state.paths) {
        tiles.push(`${String(index % state.world.width)},${String(Math.floor(index / state.world.width))}`);
      }
      this.paths = tiles.join(';');
    }
    markVillage({
      tool: this.buildTool.tool,
      variant: this.buildTool.item ?? '',
      preview: this.previewText,
      hint: this.buildUI.shownHint,
      markers: this.village.markerCount,
      buildings: this.buildings,
      paths: this.paths,
      terrain: this.terrain,
      ui: this.buildUI.spots,
      stock: this.buildUI.shownStock,
      producers: this.producers,
      card: this.buildTool.inspectedId === undefined ? '' : String(this.buildTool.inspectedId),
      shop: this.buildUI.shownShopState,
      tip: this.buildUI.shownTip,
      unlocked: state.unlocked.join(','),
      earned: String(state.earnedCoins),
      planted: String(state.planted.length),
      repaint: JSON.stringify(this.repaint),
    });
  }


  private showRing(tile: TileTapEvent): void {
    this.ringTween?.stop();
    this.ringFade?.stop();
    // At small zoom a tile is tiny on screen; the ring keeps a minimum size of about 44 CSS px.
    const zoom = this.controller.view.zoom;
    const diameter = Math.max(TILE_SIZE * 1.15, 44 / zoom);
    const base = diameter / (RING_SIZE * TEXTURE_SCALE * RING_OUTER_FRACTION);
    this.ring
      .setPosition((tile.x + 0.5) * TILE_SIZE, (tile.y + 0.5) * TILE_SIZE)
      .setVisible(true)
      .setAlpha(1)
      .setScale(base * 0.7);
    this.ringTween = this.tweens.add({
      targets: this.ring,
      scale: base * 1.1,
      duration: RING_MS,
      ease: 'Cubic.easeOut',
    });
    this.ringFade = this.tweens.add({
      targets: this.ring,
      alpha: 0,
      delay: RING_HOLD_MS,
      duration: RING_MS - RING_HOLD_MS,
      onComplete: () => this.ring.setVisible(false),
    });
  }
}

/** Number of land tiles that overlap the rectangle (world px). */
function countLandIn(world: Parameters<typeof landBounds>[0], rect: Rect): number {
  const x0 = Math.max(0, Math.floor(rect.x / TILE_SIZE));
  const x1 = Math.min(world.width - 1, Math.floor((rect.x + rect.width) / TILE_SIZE));
  const y0 = Math.max(0, Math.floor(rect.y / TILE_SIZE));
  const y1 = Math.min(world.height - 1, Math.floor((rect.y + rect.height) / TILE_SIZE));
  let count = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (isLand(terrainAt(world, x, y))) {
        count += 1;
      }
    }
  }
  return count;
}

/** The area that should be well visible at the start: all land plus a few tiles of water. */
function islandFocus(world: Parameters<typeof landBounds>[0]): Rect {
  const land = landBounds(world);
  const pad = CAMERA_CONFIG.startPaddingTiles;
  if (!land) {
    return { x: 0, y: 0, width: world.width * TILE_SIZE, height: world.height * TILE_SIZE };
  }
  return {
    x: (land.minX - pad) * TILE_SIZE,
    y: (land.minY - pad) * TILE_SIZE,
    width: (land.maxX - land.minX + 1 + 2 * pad) * TILE_SIZE,
    height: (land.maxY - land.minY + 1 + 2 * pad) * TILE_SIZE,
  };
}

/** Terrain as one letter per tile, row by row (for tests): w, s, g, f, r. */
function terrainLetters(world: Parameters<typeof landBounds>[0]): string {
  const letters = { water: 'w', sand: 's', grass: 'g', forest: 'f', rock: 'r' } as const;
  let text = '';
  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      text += letters[terrainAt(world, x, y)];
    }
  }
  return text;
}

/** What the preview says, in a few characters (for tests). */
function describePreview(preview: Preview): string {
  switch (preview.kind) {
    case 'none':
      return 'none';
    case 'place':
      return `place:${preview.result}`;
    case 'path': {
      const count = (status: string): number => preview.tiles.filter((tile) => tile.status === status).length;
      return `path:ok=${String(count('ok'))},blocked=${String(count('blocked'))},existing=${String(count('existing'))}`;
    }
    case 'move':
      return preview.target ? `move:${preview.target.result}` : 'move:chosen';
    case 'demolish':
      return `demolish:${String(preview.tiles.length)}`;
  }
}
