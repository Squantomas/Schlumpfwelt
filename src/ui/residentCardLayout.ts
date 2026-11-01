import type { Rect } from './cameraMath';
import type { InfoCardLayout } from './infoCardLayout';
import { MIN_TAP_SIZE } from './style';

/**
 * Layout of the card of a resident (M6) at the place of the info card
 * ({@link InfoCardLayout}): the name and a big ✕ at the top, a picture of the
 * resident on the left, and four rows – job, hat, home and what they are doing
 * right now. Pure maths in CSS pixels, tested on the screens of the smoke test.
 *
 * - On tall screens the card takes the whole place of the info card (name row
 *   and ✕ as there, the picture left of the rows).
 * - On flat screens (a phone held sideways) it is a compact card: narrower and
 *   only as high as it needs, the picture to the left of the name and the
 *   rows, the ✕ the size of a finger ({@link MIN_TAP_SIZE}).
 * - All four rows have **the same font size**: they start at `maxFont` and
 *   shrink together until they fit ({@link fitRows}), never under
 *   {@link CARD_MIN_FONT}; a long row wraps instead of getting smaller.
 */

/** No row of the card is ever smaller than this (CSS px). */
export const CARD_MIN_FONT = 12;

const PAD = 12;
const GAP = 8;
/** The picture is never bigger than this (CSS px). */
const MAX_PICTURE = 132;
/** Below this height (the place of the info card) the card is compact. */
const FLAT_BELOW = 240;
/** The compact card is at most this wide and – with its rows at {@link COMPACT_FONT} – this high (CSS px). */
const COMPACT_MAX_WIDTH = 360;
const COMPACT_PAD = 8;
const COMPACT_NAME_ROW = 40;
const COMPACT_PICTURE = 72;
const COMPACT_FONT = 15;
/** Room between two rows (CSS px). */
export const CARD_ROW_GAP = 2;

export interface ResidentCardLayout {
  /** The card itself: the whole place of the info card, or – compact – a part of it at its bottom. */
  readonly rect: Rect;
  readonly compact: boolean;
  readonly close: Rect;
  readonly name: Rect;
  /** Font size of the name (CSS px; it shrinks if the name is too long). */
  readonly nameFont: number;
  readonly picture: Rect;
  /** Where the four rows stand, one below the other (each may wrap to the width). */
  readonly column: Rect;
  /** The rows start at this font size (CSS px). */
  readonly maxFont: number;
}

/** A line height of the card for a font size: what a row of one line needs at least (with outline and shadow). */
export function oneLineHeight(font: number): number {
  return Math.ceil(font * 1.3) + 4;
}

export function residentCardLayout(card: InfoCardLayout): ResidentCardLayout {
  return card.rect.height < FLAT_BELOW ? compactLayout(card) : tallLayout(card);
}

function tallLayout(card: InfoCardLayout): ResidentCardLayout {
  const { rect } = card;
  const top = card.name.y + card.name.height + GAP;
  const bottom = rect.y + rect.height - PAD;
  const middleH = Math.max(0, bottom - top);
  const size = Math.max(0, Math.min(middleH, MAX_PICTURE, (rect.width - 2 * PAD) * 0.26));
  const picture: Rect = { x: rect.x + PAD, y: top + (middleH - size) / 2, width: size, height: size };
  const textX = picture.x + size + GAP + 4;
  const column: Rect = { x: textX, y: top, width: Math.max(0, rect.x + rect.width - PAD - textX), height: middleH };
  return { rect, compact: false, close: card.close, name: card.name, nameFont: 30, picture, column, maxFont: 20 };
}

function compactLayout(card: InfoCardLayout): ResidentCardLayout {
  const place = card.rect;
  const width = Math.min(place.width, COMPACT_MAX_WIDTH);
  // A narrower card (a small phone held upright) leaves room for two rows to wrap.
  const wraps = width < COMPACT_MAX_WIDTH ? 2 : 0;
  const rowsH = 4 * oneLineHeight(COMPACT_FONT) + wraps * Math.ceil(COMPACT_FONT * 1.3) + 3 * CARD_ROW_GAP;
  const height = Math.min(place.height, COMPACT_PAD + COMPACT_NAME_ROW + GAP / 2 + rowsH + COMPACT_PAD);
  // At the bottom of the place (just above the toolbar), around the same middle.
  const rect: Rect = { x: place.x + (place.width - width) / 2, y: place.y + place.height - height, width, height };
  const innerTop = rect.y + COMPACT_PAD;
  const innerBottom = rect.y + rect.height - COMPACT_PAD;
  const size = Math.max(0, Math.min(COMPACT_PICTURE, innerBottom - innerTop, width * 0.22));
  const picture: Rect = { x: rect.x + COMPACT_PAD, y: innerTop + (innerBottom - innerTop - size) / 2, width: size, height: size };
  const closeSize = MIN_TAP_SIZE;
  const close: Rect = { x: rect.x + rect.width - COMPACT_PAD - closeSize, y: rect.y + 4, width: closeSize, height: closeSize };
  const textX = picture.x + size + GAP;
  const name: Rect = { x: textX, y: innerTop, width: Math.max(0, close.x - GAP - textX), height: COMPACT_NAME_ROW };
  const columnTop = Math.max(name.y + name.height + GAP / 2, close.y + close.height);
  const column: Rect = { x: textX, y: columnTop, width: Math.max(0, rect.x + rect.width - COMPACT_PAD - textX), height: Math.max(0, innerBottom - columnTop) };
  return { rect, compact: true, close, name, nameFont: 22, picture, column, maxFont: COMPACT_FONT };
}

/** How high row `row` is at `font` CSS px, wrapped to the width of the column. */
export type RowMeasure = (row: number, font: number) => number;

/**
 * The one font size for all `count` rows: the biggest from `maxFont` down to
 * {@link CARD_MIN_FONT} at which they fit into `height` one below the other
 * (with {@link CARD_ROW_GAP} between them) – at the smallest size they may be
 * too high, the caller then shows them anyway. Measures a few sizes only: a
 * guess from how much is too much, then one pixel at a time.
 */
export function fitRows(count: number, height: number, maxFont: number, measure: RowMeasure): { readonly font: number; readonly heights: readonly number[] } {
  const top = Math.max(CARD_MIN_FONT, Math.floor(maxFont));
  const heightsAt = (font: number): number[] => Array.from({ length: count }, (_, row) => measure(row, font));
  const total = (heights: readonly number[]): number => heights.reduce((sum, h) => sum + h, 0) + CARD_ROW_GAP * Math.max(0, count - 1);
  let font = top;
  let heights = heightsAt(font);
  if (total(heights) <= height || font === CARD_MIN_FONT) {
    return { font, heights };
  }
  font = Math.max(CARD_MIN_FONT, Math.min(top - 1, Math.floor((top * height) / total(heights))));
  heights = heightsAt(font);
  while (font < top - 1) {
    const bigger = heightsAt(font + 1);
    if (total(bigger) > height) {
      break;
    }
    font += 1;
    heights = bigger;
  }
  while (total(heights) > height && font > CARD_MIN_FONT) {
    font -= 1;
    heights = heightsAt(font);
  }
  return { font, heights };
}
