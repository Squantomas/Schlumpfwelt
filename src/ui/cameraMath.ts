/**
 * Camera maths without Phaser, so it can be unit-tested.
 *
 * A view is described by the world point in the middle of the screen
 * (`centerX`, `centerY`) and the zoom (CSS pixels on screen per world pixel).
 * Screen coordinates are CSS pixels, starting top left of the visible area –
 * the render scale of the canvas (see `renderScale.ts`) is applied by whoever
 * hands the view to Phaser, not in here.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CameraView {
  readonly centerX: number;
  readonly centerY: number;
  /** CSS pixels per world pixel. */
  readonly zoom: number;
}

export interface ZoomLimits {
  readonly min: number;
  readonly max: number;
}

/**
 * Zoom limits for a screen and a camera area.
 *
 * Smallest zoom: the whole area just fits on the screen – the camera can never
 * move so far away that the island disappears. Largest zoom: one tile is
 * `maxTileCssPx` CSS pixels big (but never less than the smallest zoom).
 */
export function zoomLimits(viewSize: Size, bounds: Rect, tileSize: number, maxTileCssPx: number): ZoomLimits {
  const fit = Math.min(viewSize.width / bounds.width, viewSize.height / bounds.height);
  const min = Number.isFinite(fit) && fit > 0 ? fit : 1;
  return { min, max: Math.max(maxTileCssPx / tileSize, min) };
}

export function screenToWorld(view: CameraView, viewSize: Size, screen: Point): Point {
  return {
    x: view.centerX + (screen.x - viewSize.width / 2) / view.zoom,
    y: view.centerY + (screen.y - viewSize.height / 2) / view.zoom,
  };
}

export function worldToScreen(view: CameraView, viewSize: Size, world: Point): Point {
  return {
    x: (world.x - view.centerX) * view.zoom + viewSize.width / 2,
    y: (world.y - view.centerY) * view.zoom + viewSize.height / 2,
  };
}

/** The part of the world that is visible with this view. */
export function visibleRect(view: CameraView, viewSize: Size): Rect {
  const width = viewSize.width / view.zoom;
  const height = viewSize.height / view.zoom;
  return { x: view.centerX - width / 2, y: view.centerY - height / 2, width, height };
}

/** Adds `margin` on every side. */
export function growRect(rect: Rect, margin: number): Rect {
  return { x: rect.x - margin, y: rect.y - margin, width: rect.width + 2 * margin, height: rect.height + 2 * margin };
}

/** The view that shows `rect` as large as possible, centred, with `padding` CSS pixels free on every side. */
export function fitRect(viewSize: Size, rect: Rect, padding = 0): CameraView {
  const availableWidth = Math.max(1, viewSize.width - 2 * padding);
  const availableHeight = Math.max(1, viewSize.height - 2 * padding);
  return {
    centerX: rect.x + rect.width / 2,
    centerY: rect.y + rect.height / 2,
    zoom: Math.min(availableWidth / rect.width, availableHeight / rect.height),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Keeps the centre so that the screen shows nothing outside `[start, start + length]`; centres if the view is bigger. */
function clampAxis(center: number, start: number, length: number, visibleLength: number): number {
  if (length <= visibleLength) {
    return start + length / 2;
  }
  return clamp(center, start + visibleLength / 2, start + length - visibleLength / 2);
}

/**
 * Brings a view back into the allowed range: zoom within the limits, and the
 * screen never shows anything outside `bounds`. If the screen is bigger than
 * the bounds on an axis, the bounds are centred on that axis.
 */
export function clampView(view: CameraView, viewSize: Size, bounds: Rect, limits: ZoomLimits): CameraView {
  const zoom = clamp(Number.isFinite(view.zoom) ? view.zoom : limits.min, limits.min, limits.max);
  return {
    zoom,
    centerX: clampAxis(view.centerX, bounds.x, bounds.width, viewSize.width / zoom),
    centerY: clampAxis(view.centerY, bounds.y, bounds.height, viewSize.height / zoom),
  };
}

/** Moves the picture by (dx, dy) screen pixels, as if dragging it with a finger. */
export function panView(
  view: CameraView,
  viewSize: Size,
  bounds: Rect,
  limits: ZoomLimits,
  dx: number,
  dy: number,
): CameraView {
  return clampView(
    { ...view, centerX: view.centerX - dx / view.zoom, centerY: view.centerY - dy / view.zoom },
    viewSize,
    bounds,
    limits,
  );
}

/**
 * The general gesture: the world point that was under screen point `from`
 * moves to screen point `to`, while the zoom changes by `scale`.
 *
 * - Pinch: `from` and `to` are the middle between the fingers before and after.
 * - Mouse wheel or button: `from` equals `to` (zoom around that point).
 * - Drag: `scale` is 1 (see also {@link panView}).
 *
 * Zoom and position are clamped; if the zoom hits its limit, the point still
 * stays under `to` as far as the bounds allow.
 */
export function transformView(
  view: CameraView,
  viewSize: Size,
  bounds: Rect,
  limits: ZoomLimits,
  from: Point,
  to: Point,
  scale: number,
): CameraView {
  const anchor = screenToWorld(view, viewSize, from);
  const zoom = clamp(view.zoom * (Number.isFinite(scale) && scale > 0 ? scale : 1), limits.min, limits.max);
  return clampView(
    {
      zoom,
      centerX: anchor.x - (to.x - viewSize.width / 2) / zoom,
      centerY: anchor.y - (to.y - viewSize.height / 2) / zoom,
    },
    viewSize,
    bounds,
    limits,
  );
}

/** Zooms to `zoom` around the screen point `anchor` (it stays where it is). */
export function zoomAt(
  view: CameraView,
  viewSize: Size,
  bounds: Rect,
  limits: ZoomLimits,
  anchor: Point,
  zoom: number,
): CameraView {
  return transformView(view, viewSize, bounds, limits, anchor, anchor, zoom / view.zoom);
}

/** The tile under a world point, or `undefined` outside the map. */
export function tileAtWorld(point: Point, tileSize: number, mapSize: Size): { x: number; y: number } | undefined {
  const x = Math.floor(point.x / tileSize);
  const y = Math.floor(point.y / tileSize);
  if (!(x >= 0 && y >= 0 && x < mapSize.width && y < mapSize.height)) {
    return undefined;
  }
  return { x, y };
}

/**
 * Moves `current` towards `target` like a spring that eases out: after
 * `timeConstantMs` about 63 % of the way are done. Independent of the frame rate.
 */
export function approach(current: number, target: number, deltaMs: number, timeConstantMs: number): number {
  if (timeConstantMs <= 0) {
    return target;
  }
  return target + (current - target) * Math.exp(-Math.max(0, deltaMs) / timeConstantMs);
}
