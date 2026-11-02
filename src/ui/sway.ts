/**
 * The calm sway of trees, flowers and bushes (M9, `docs/STIL_LEITFADEN.md`): only the picture, never the simulation.
 * One rule for everything that sways – at most {@link SWAY_DEG} degrees, only from zoom {@link SWAY_MIN_ZOOM} on (further
 * out nobody sees it) and only what is in the picture (plus a margin), so a large village costs nothing off screen.
 */

/** The largest tilt (degrees). */
export const SWAY_DEG = 1.3;
/** Below this zoom nothing sways. */
export const SWAY_MIN_ZOOM = 0.4;

export interface SwayView {
  readonly x: number;
  readonly y: number;
  readonly right: number;
  readonly bottom: number;
}

/** Does anything sway at this zoom? */
export function swayOn(zoom: number): boolean {
  return zoom >= SWAY_MIN_ZOOM;
}

/**
 * Is a thing whose foot is at (x, y) in the picture? A margin of `tile` on the sides and the top, two below (a tall thing
 * whose foot is under the picture still reaches into it).
 */
export function inSwayView(x: number, y: number, view: SwayView, tile: number): boolean {
  return x >= view.x - tile && x <= view.right + tile && y >= view.y - tile && y <= view.bottom + tile * 2;
}

/** The tilt at `seconds` (degrees, within ±{@link SWAY_DEG}); `speed` in radians per second, `phase` offsets each thing. */
export function swayAngle(seconds: number, phase: number, speed: number): number {
  return Math.sin(seconds * speed + phase) * SWAY_DEG;
}
