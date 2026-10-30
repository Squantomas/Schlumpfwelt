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
}): void {
  const data = document.documentElement.dataset;
  const next = {
    cameraZoom: info.zoom.toFixed(4),
    cameraX: info.centerX.toFixed(1),
    cameraY: info.centerY.toFixed(1),
    cameraMinZoom: info.minZoom.toFixed(4),
    cameraMaxZoom: info.maxZoom.toFixed(4),
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
