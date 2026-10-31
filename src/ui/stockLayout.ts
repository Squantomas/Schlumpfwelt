import type { Rect } from './cameraMath';

/**
 * Where the store bar (coins, wood, stone, berries, furniture, cake) goes: a
 * panel at the top left with one chip (picture + number) per item. As many
 * chips as fit go into one row; on narrow screens it wraps into more rows,
 * but it never reaches into the column of the zoom buttons. Pure maths in CSS
 * pixels, tested for all screen sizes.
 */

export const STOCK_EDGE = 10;
export const STOCK_GAP = 6;
/** The number field of a chip is this many digit widths wide (longer numbers shrink to fit). */
const DIGIT_WIDTH = 0.58;

export interface StockSize {
  readonly iconSize: number;
  readonly fontSize: number;
  readonly chipH: number;
  /** Padding inside a chip, left and right. */
  readonly chipPad: number;
  /** Gap between chips and between the chips and the panel's edge. */
  readonly gap: number;
  /** Width of the number field in characters. */
  readonly digits: number;
}

export interface StockLayout extends StockSize {
  readonly rect: Rect;
  readonly chipW: number;
  readonly cols: number;
  readonly rows: number;
  /** Top left corner of each chip (CSS px), row by row. */
  readonly chips: readonly { readonly x: number; readonly y: number }[];
}

/** Big on tablets, smaller on phones, smallest on low or narrow phones (still readable). */
export function stockSize(width: number, height: number): StockSize {
  const smaller = Math.min(width, height);
  if (smaller >= 700) {
    return { iconSize: 40, fontSize: 26, chipH: 52, chipPad: 8, gap: 6, digits: 4.4 };
  }
  if (smaller >= 480) {
    return { iconSize: 32, fontSize: 21, chipH: 42, chipPad: 6, gap: 5, digits: 4 };
  }
  return { iconSize: 22, fontSize: 16, chipH: 32, chipPad: 4, gap: 3, digits: 3.3 };
}

/** Distance from the top of the screen (smaller on low screens, where every pixel counts). */
export function stockTop(height: number): number {
  return height < 400 ? 8 : 12;
}

/**
 * `availableWidth` is the width the panel may use at most (from the left
 * edge of the screen up to the zoom column, in CSS px).
 */
export function stockLayout(width: number, height: number, itemCount: number, availableWidth: number): StockLayout {
  const size = stockSize(width, height);
  const { gap } = size;
  const chipW = Math.ceil(2 * size.chipPad + size.iconSize + 4 + size.digits * DIGIT_WIDTH * size.fontSize);
  const panelWidth = (cols: number): number => cols * chipW + (cols - 1) * gap + 2 * gap + 2;
  let maxCols = Math.max(1, itemCount);
  while (maxCols > 1 && STOCK_EDGE + panelWidth(maxCols) > availableWidth) {
    maxCols -= 1;
  }
  // As few rows as needed, then spread the chips evenly over them (6 chips in two rows are 3 + 3, not 4 + 2).
  const rows = Math.ceil(itemCount / maxCols);
  const cols = Math.max(1, Math.ceil(itemCount / rows));
  const rect: Rect = {
    x: STOCK_EDGE,
    y: stockTop(height),
    width: panelWidth(Math.min(cols, itemCount)),
    height: rows * size.chipH + (rows - 1) * gap + 2 * gap + 2,
  };
  const chips = Array.from({ length: itemCount }, (_, index) => ({
    x: rect.x + gap + 1 + (index % cols) * (chipW + gap),
    y: rect.y + gap + 1 + Math.floor(index / cols) * (size.chipH + gap),
  }));
  return { ...size, rect, chipW, cols, rows, chips };
}
