import type { CameraView, Point, Size } from './cameraMath';

/**
 * Where the camera glides when a boat sets off with a new resident (M6),
 * without Phaser: a child who invited someone should see them arrive. If the
 * landing place is already well inside the free part of the screen (between
 * the bars above and below, a little away from the edges), nothing moves.
 * Otherwise the camera glides so that the way of the boat – from where it
 * comes into sight to the shore – lies in the middle of the free part.
 */

/** The free part of the screen: from `top` to `bottom` (CSS px), the whole width. */
export interface FreeBand {
  readonly top: number;
  readonly bottom: number;
}

/** How far inside the free part the landing place must be to count as "in the picture" (CSS px). */
export const LANDING_MARGIN = 56;

/** The screen point (CSS px) of a world point. */
function toScreen(view: CameraView, size: Size, point: Point): Point {
  return { x: (point.x - view.centerX) * view.zoom + size.width / 2, y: (point.y - view.centerY) * view.zoom + size.height / 2 };
}

/**
 * The new middle of the camera (world px), or `undefined` when the shore is
 * already in the picture. `shore` is where the resident steps onto land,
 * `start` where the boat comes into sight (both world px).
 */
export function landingGlide(view: CameraView, size: Size, band: FreeBand, shore: Point, start: Point): Point | undefined {
  if (!(view.zoom > 0) || size.width <= 0 || size.height <= 0) {
    return undefined;
  }
  const top = Math.max(0, Math.min(band.top, size.height));
  const bottom = Math.max(top, Math.min(band.bottom, size.height));
  const margin = Math.min(LANDING_MARGIN, size.width / 4, (bottom - top) / 4);
  const at = toScreen(view, size, shore);
  if (at.x >= margin && at.x <= size.width - margin && at.y >= top + margin && at.y <= bottom - margin) {
    return undefined;
  }
  // The middle of the boat's way goes to the middle of the free band.
  const middle = { x: (shore.x + start.x) / 2, y: (shore.y + start.y) / 2 };
  const bandMiddle = (top + bottom) / 2;
  return { x: middle.x, y: middle.y - (bandMiddle - size.height / 2) / view.zoom };
}
