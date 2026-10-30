import Phaser from 'phaser';
import { CAMERA_CONFIG } from '../data/camera';
import { t } from '../data/texts';
import { hash2 } from '../sim/random';
import type { Simulation } from '../sim/simulation';
import { isLand, landBounds, terrainAt } from '../sim/world';
import { growRect, tileAtWorld, type Point, type Rect } from '../ui/cameraMath';
import { createLabel, setLabelSize } from '../ui/label';
import { RoundButton } from '../ui/RoundButton';
import { COLORS, MIN_TAP_SIZE, TILE_SIZE, clamp, rgb } from '../ui/style';
import { onViewportChange, type ViewSize } from '../ui/viewport';
import { groundSize, paintGround } from './island/groundTexture';
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
import { WorldCameraController } from './island/WorldCameraController';
import { ISLAND_EVENTS, SCENES, type TileTapEvent } from './keys';
import { markActiveScene, markCamera, markTap } from './sceneMarker';

/** How long the greeting stays fully visible, then it fades away (ms). */
const GREETING_SHOW_MS = 3500;
const GREETING_FADE_MS = 900;
/** Tap ring: how long it takes to grow and fade (ms). */
const RING_MS = 600;
/** Zoom buttons: size and distance to the screen corner, in CSS px. */
const ZOOM_BUTTON_RADIUS = 34;
const ZOOM_BUTTON_MARGIN = 16;
const ZOOM_BUTTON_GAP = 12;
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
  private ring!: Phaser.GameObjects.Image;
  private ringTween: Phaser.Tweens.Tween | undefined;
  private groundKey = '';

  constructor(simulation: Simulation) {
    super(SCENES.island);
    this.simulation = simulation;
  }

  create(): void {
    markActiveScene(SCENES.island);

    const { seed, world } = this.simulation.state;
    registerIslandTextures(this);

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
    this.ring = this.add.image(0, 0, RING_KEY).setDepth(TOP_DEPTH).setVisible(false);
    this.worldLayer.add(this.ring);

    const bounds = growRect(
      { x: 0, y: 0, width: world.width * TILE_SIZE, height: world.height * TILE_SIZE },
      CAMERA_CONFIG.marginTiles * TILE_SIZE,
    );
    this.controller = new WorldCameraController(this, this.worldCamera, {
      bounds,
      focus: islandFocus(world),
      focusPadding: 12,
      tileSize: TILE_SIZE,
      maxTileCssPx: CAMERA_CONFIG.maxTileCssPx,
      tapMaxMovePx: CAMERA_CONFIG.tapMaxMovePx,
      wheelZoomPerPixel: CAMERA_CONFIG.wheelZoomPerPixel,
      onTap: (point) => this.handleTap(point),
    });

    const greeting = createLabel(this, t('island.greeting'), 64);
    this.uiLayer.add(greeting);
    this.tweens.add({ targets: greeting, alpha: 0, delay: GREETING_SHOW_MS, duration: GREETING_FADE_MS });

    const zoomIn = new RoundButton(this, 0, 0, {
      radius: ZOOM_BUTTON_RADIUS,
      icon: 'plus',
      onTap: () => this.controller.zoomBy(CAMERA_CONFIG.buttonZoomFactor),
    });
    const zoomOut = new RoundButton(this, 0, 0, {
      radius: ZOOM_BUTTON_RADIUS,
      icon: 'minus',
      onTap: () => this.controller.zoomBy(1 / CAMERA_CONFIG.buttonZoomFactor),
    });
    this.uiLayer.add([zoomIn, zoomOut]);

    onViewportChange(this, ({ width, height }: ViewSize) => {
      this.controller.layout({ width, height });

      const m = Math.min(width, height);
      setLabelSize(greeting, clamp(m * 0.07, 26, 64), width * 0.9);
      greeting.setPosition(width / 2, Math.max(14, height * 0.04) + greeting.height / 2);

      const radius = Math.max(ZOOM_BUTTON_RADIUS, MIN_TAP_SIZE / 2);
      zoomOut.setRadius(radius).setPosition(width - ZOOM_BUTTON_MARGIN - radius, height - ZOOM_BUTTON_MARGIN - radius);
      zoomIn.setRadius(radius).setPosition(zoomOut.x, zoomOut.y - 2 * radius - ZOOM_BUTTON_GAP);
    });

    const fade = rgb(COLORS.waterDeep);
    this.cameras.main.fadeIn(300, ...fade);
    this.worldCamera.fadeIn(300, ...fade);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.textures.remove(this.groundKey);
    });
  }

  override update(_time: number, delta: number): void {
    const alpha = this.simulation.update(delta);
    const seconds = ((this.simulation.state.tick + alpha) * this.simulation.tickMs) / 1000;

    this.controller.update(delta);
    const { zoom, centerX, centerY } = this.controller.view;
    markCamera({ zoom, centerX, centerY, minZoom: this.controller.limits.min, maxZoom: this.controller.limits.max });

    for (const { sprite, phase } of this.glints) {
      const wave = 0.5 + 0.5 * Math.sin(seconds * 1.6 + phase);
      sprite.setAlpha(0.15 + 0.45 * wave).setScale((0.8 + 0.3 * wave) / TEXTURE_SCALE);
    }
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
    paintGround(texture.getContext(), world, seed);
    texture.refresh();
    this.worldLayer.add(this.add.image(0, 0, this.groundKey).setOrigin(0, 0).setDepth(0));
  }

  /** One tree per forest tile, one rock per rock tile; the sprite's depth is its ground y. */
  private buildObjects(seed: number): void {
    const { world } = this.simulation.state;
    for (let y = 0; y < world.height; y += 1) {
      for (let x = 0; x < world.width; x += 1) {
        const terrain = terrainAt(world, x, y);
        if (terrain !== 'forest' && terrain !== 'rock') {
          continue;
        }
        const r = (n: number): number => hash2(seed + n * 977, x, y);
        const groundX = (x + 0.5 + (r(1) - 0.5) * 0.3) * TILE_SIZE;
        const groundY = (y + 0.84 + (r(2) - 0.5) * 0.2) * TILE_SIZE;
        const isTree = terrain === 'forest';
        const keys = isTree ? TREE_KEYS : ROCK_KEYS;
        const key = keys[Math.floor(r(3) * keys.length)] ?? keys[0];
        const origin = isTree ? OBJECT_ORIGIN.tree : OBJECT_ORIGIN.rock;
        const size = (isTree ? 0.9 + r(4) * 0.25 : 0.85 + r(4) * 0.3) / TEXTURE_SCALE;
        const sprite = this.add
          .image(groundX, groundY, key)
          .setOrigin(origin.x, origin.y)
          .setScale(r(5) < 0.5 ? size : -size, size)
          .setDepth(groundY);
        this.worldLayer.add(sprite);
      }
    }
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
  private handleTap(world: Point): void {
    const map = this.simulation.state.world;
    const tile = tileAtWorld(world, TILE_SIZE, map);
    if (!tile) {
      return;
    }
    const event: TileTapEvent = tile;
    markTap(tile);
    this.events.emit(ISLAND_EVENTS.tileTap, event);
    this.showRing(tile);
  }

  private showRing(tile: TileTapEvent): void {
    this.ringTween?.stop();
    // At small zoom a tile is tiny on screen; the ring keeps a minimum size of about 44 CSS px.
    const zoom = this.controller.view.zoom;
    const diameter = Math.max(TILE_SIZE * 1.15, 44 / zoom);
    const base = diameter / (RING_SIZE * TEXTURE_SCALE * RING_OUTER_FRACTION);
    this.ring
      .setPosition((tile.x + 0.5) * TILE_SIZE, (tile.y + 0.5) * TILE_SIZE)
      .setVisible(true)
      .setAlpha(0.95)
      .setScale(base * 0.6);
    this.ringTween = this.tweens.add({
      targets: this.ring,
      scale: base * 1.1,
      alpha: 0,
      duration: RING_MS,
      ease: 'Cubic.easeOut',
      onComplete: () => this.ring.setVisible(false),
    });
  }
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
