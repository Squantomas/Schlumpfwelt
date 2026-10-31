import type { Rect } from './cameraMath';
import type { InfoCardLayout } from './infoCardLayout';

/**
 * Layout of the card of a resident (M6) inside the place of the info card
 * ({@link InfoCardLayout}: the same rectangle, name row and ✕): a big picture
 * of the resident on the left, and on the right four lines – job, hat, home
 * and, with more room because it can wrap, what they are doing right now.
 * Pure maths in CSS pixels, tested on the screens of the smoke test.
 */

const PAD = 12;
const GAP = 8;
/** The picture is never bigger than this (CSS px). */
const MAX_PICTURE = 132;
/** One line of text is at most this high (CSS px). */
const MAX_LINE = 34;

export interface ResidentCardLayout {
  readonly picture: Rect;
  /** Job, hat, home (each one line) and the activity (the rest of the column, can take two lines). */
  readonly lines: readonly [Rect, Rect, Rect, Rect];
  /** Font size of the three short lines (CSS px). */
  readonly lineFont: number;
}

export function residentCardLayout(card: InfoCardLayout): ResidentCardLayout {
  const { rect } = card;
  const top = card.name.y + card.name.height + GAP;
  const bottom = rect.y + rect.height - PAD;
  const middleH = Math.max(0, bottom - top);
  const size = Math.max(0, Math.min(middleH, MAX_PICTURE, (rect.width - 2 * PAD) * 0.3));
  const picture: Rect = { x: rect.x + PAD, y: top + (middleH - size) / 2, width: size, height: size };
  const textX = picture.x + size + GAP + 4;
  const textW = Math.max(0, rect.x + rect.width - PAD - textX);
  const lineH = Math.min(MAX_LINE, middleH / 4.2);
  const line = (index: number): Rect => ({ x: textX, y: top + index * lineH, width: textW, height: lineH });
  const activityY = top + 3 * lineH;
  const activity: Rect = { x: textX, y: activityY, width: textW, height: Math.max(0, bottom - activityY) };
  return { picture, lines: [line(0), line(1), line(2), activity], lineFont: Math.max(12, Math.min(20, Math.floor(lineH * 0.7))) };
}
