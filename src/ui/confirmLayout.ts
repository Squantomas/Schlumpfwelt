import type { Point, Rect } from './cameraMath';

/**
 * Where the ✓ and ✕ buttons go: right next to the preview, but not on top of
 * it, and always inside the visible area (not under the toolbar or the zoom
 * buttons). Pure maths in CSS pixels, so it can be unit-tested.
 */

export interface ConfirmPlacement {
  /** Centre of the ✓ button. */
  readonly confirm: Point;
  /** Centre of the ✕ button. */
  readonly cancel: Point;
  /** `true` if the buttons could be placed without covering the preview. */
  readonly clear: boolean;
}

function overlaps(a: Rect, b: Rect, margin = 0): boolean {
  return a.x < b.x + b.width + margin && b.x < a.x + a.width + margin && a.y < b.y + b.height + margin && b.y < a.y + a.height + margin;
}

function clampInto(rect: Rect, safe: Rect): Rect {
  const x = Math.min(Math.max(rect.x, safe.x), Math.max(safe.x, safe.x + safe.width - rect.width));
  const y = Math.min(Math.max(rect.y, safe.y), Math.max(safe.y, safe.y + safe.height - rect.height));
  return { x, y, width: rect.width, height: rect.height };
}

/**
 * `target` is the preview on screen, `safe` the area the buttons may use,
 * `avoid` areas they should stay out of (zoom buttons …), `size` the
 * diameter of one button. Tries below, above, right and left of the preview;
 * the pair sits side by side (✕ left, ✓ right) below and above, stacked
 * (✓ on top) at the sides.
 */
export function placeConfirmButtons(target: Rect, safe: Rect, avoid: readonly Rect[], size: number, gap: number): ConfirmPlacement {
  const pairW = 2 * size + gap;
  const centreX = target.x + target.width / 2;
  const centreY = target.y + target.height / 2;
  const candidates: { rect: Rect; vertical: boolean }[] = [
    { rect: { x: centreX - pairW / 2, y: target.y + target.height + gap, width: pairW, height: size }, vertical: false },
    { rect: { x: centreX - pairW / 2, y: target.y - gap - size, width: pairW, height: size }, vertical: false },
    { rect: { x: target.x + target.width + gap, y: centreY - pairW / 2, width: size, height: pairW }, vertical: true },
    { rect: { x: target.x - gap - size, y: centreY - pairW / 2, width: size, height: pairW }, vertical: true },
  ];

  const placed = candidates.map(({ rect, vertical }) => ({ rect: clampInto(rect, safe), vertical }));
  const free = placed.find(({ rect }) => !overlaps(rect, target) && !avoid.some((area) => overlaps(rect, area)));
  const clearOfTarget = placed.find(({ rect }) => !overlaps(rect, target));
  const choice = free ?? clearOfTarget;
  const chosen = choice ?? placed[0];
  if (!chosen) {
    return { confirm: { x: safe.x, y: safe.y }, cancel: { x: safe.x, y: safe.y }, clear: false };
  }
  const { rect, vertical } = chosen;
  const half = size / 2;
  return vertical
    ? {
        confirm: { x: rect.x + half, y: rect.y + half },
        cancel: { x: rect.x + half, y: rect.y + size + gap + half },
        clear: choice !== undefined,
      }
    : {
        cancel: { x: rect.x + half, y: rect.y + half },
        confirm: { x: rect.x + size + gap + half, y: rect.y + half },
        clear: choice !== undefined,
      };
}
