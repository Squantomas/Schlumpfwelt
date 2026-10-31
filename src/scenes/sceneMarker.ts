import type { SceneKey } from './keys';

/**
 * Marks the active scene as `<html data-scene="…">`. Lets Playwright tests
 * wait for a scene without reaching into Phaser internals.
 */
export function markActiveScene(key: SceneKey): void {
  document.documentElement.dataset.scene = key;
}

/**
 * Publishes the camera as `<html data-camera-zoom data-camera-x data-camera-y …>`
 * (only when a rounded value changes), so Playwright tests can check dragging,
 * zooming and the limits without reaching into Phaser.
 */
export function markCamera(info: {
  readonly zoom: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  /** Number of land tiles that are at least partly in view. */
  readonly landInView: number;
}): void {
  const data = document.documentElement.dataset;
  const next = {
    cameraZoom: info.zoom.toFixed(4),
    cameraX: info.centerX.toFixed(1),
    cameraY: info.centerY.toFixed(1),
    cameraMinZoom: info.minZoom.toFixed(4),
    cameraMaxZoom: info.maxZoom.toFixed(4),
    cameraLand: String(info.landInView),
  };
  for (const [key, value] of Object.entries(next)) {
    if (data[key] !== value) {
      data[key] = value;
    }
  }
}

/** Publishes the last tapped tile as `<html data-last-tap="x,y">` (for tests). */
export function markTap(tile: { readonly x: number; readonly y: number }): void {
  document.documentElement.dataset.lastTap = `${String(tile.x)},${String(tile.y)}`;
}

/** Publishes the building state for tests (`<html data-tool data-preview data-buildings …>`, only on change). */
export function markVillage(info: {
  readonly tool: string;
  readonly variant: string;
  /** `none`, or `place:ok`, `path:2/1`, … – what the preview says. */
  readonly preview: string;
  readonly hint: string;
  readonly markers: number;
  /** `[id, type, x, y, connected]` per building. */
  readonly buildings: string;
  /** Path tiles as `x,y;x,y;…`. */
  readonly paths: string;
  /** Terrain letters per tile, row by row (`w` water, `s` sand, `g` grass, `f` forest, `r` rock). */
  readonly terrain: string;
  /** Controls on screen: `{ name: { x, y, enabled } }` in CSS px. */
  readonly ui: string;
  /** The numbers in the store bar as `{ coins: 60, wood: 14, … }`. */
  readonly stock: string;
  /** `[building id, status, times delivered]` per production building. */
  readonly producers: string;
  /** Id of the building whose info card is open, or an empty text. */
  readonly card: string;
}): void {
  const data = document.documentElement.dataset;
  const next = {
    tool: info.tool,
    variant: info.variant,
    preview: info.preview,
    hint: info.hint,
    markers: String(info.markers),
    buildings: info.buildings,
    paths: info.paths,
    terrain: info.terrain,
    ui: info.ui,
    stock: info.stock,
    producers: info.producers,
    card: info.card,
  };
  for (const [key, value] of Object.entries(next)) {
    if (data[key] !== value) {
      data[key] = value;
    }
  }
}
