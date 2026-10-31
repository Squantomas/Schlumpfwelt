import type { Point } from './cameraMath';

/**
 * Where the ✓ and ✕ buttons go: always at the same place, bottom right right
 * above the toolbar, so they never cover the world where the child tapped
 * (door, path connection, the next target). Pure maths in CSS pixels.
 */

/** Diameters of the buttons in CSS px (both over 64). */
export const CONFIRM_DIAMETER = 80;
export const CANCEL_DIAMETER = 72;
const GAP = 12;
const EDGE = 10;

export interface ConfirmPlacement {
  /** Centre of the ✓ button. */
  readonly confirm: Point;
  /** Centre of the ✕ button (left of ✓). */
  readonly cancel: Point;
  /** Left edge of the pair, so other things (the chip) can stay clear of it. */
  readonly left: number;
}

/**
 * `toolsTop` is the top edge of the toolbar (CSS px, from the top of the screen).
 * The pair sits at the right edge, ✕ left of ✓, with a small gap above the toolbar.
 */
export function placeConfirmButtons(viewWidth: number, toolsTop: number): ConfirmPlacement {
  const y = toolsTop - GAP - CONFIRM_DIAMETER / 2;
  const confirmX = viewWidth - EDGE - CONFIRM_DIAMETER / 2;
  const cancelX = confirmX - CONFIRM_DIAMETER / 2 - GAP - CANCEL_DIAMETER / 2;
  return {
    confirm: { x: confirmX, y },
    cancel: { x: cancelX, y },
    left: cancelX - CANCEL_DIAMETER / 2,
  };
}
