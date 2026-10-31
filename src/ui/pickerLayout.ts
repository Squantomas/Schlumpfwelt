import type { Rect } from './cameraMath';

/**
 * Layout of the variant picker above the toolbar. It uses as many rows as fit
 * into the free height; on screens that are too low (a phone held sideways) it
 * becomes one row with big arrows to turn the pages. Pure maths in CSS pixels.
 */

export const PICKER_CELL_W = 84;
export const PICKER_GAP = 8;
export const PICKER_PAD = 8;
export const PICKER_EDGE = 10;
/** Diameter of the page arrows (over 48 px tap minimum). */
export const PICKER_ARROW = 56;
const CELL_HEIGHTS = [104, 88] as const;
const MIN_CELL_H = 64;

export interface PickerLayout {
  readonly rect: Rect;
  /** Cells per row (per page when paged). */
  readonly cols: number;
  readonly rows: number;
  readonly cellH: number;
  /** With page arrows: only `perPage` cells show at a time. */
  readonly paged: boolean;
  readonly perPage: number;
  readonly pages: number;
  /** The panel fits into the free band (`top` … `bottom`); if not, the picker must not open at that moment. */
  readonly fits: boolean;
}

/**
 * `sideInset` keeps that much more free at both sides (the zoom column). `top` and `bottom` are the free band (CSS px from the top of the screen):
 * below the hint bar, above the toolbar (and the ✓/✕ row). The panel sits at
 * the bottom of the band.
 */
export function pickerLayout(viewWidth: number, count: number, top: number, bottom: number, sideInset = 0): PickerLayout {
  const availW = viewWidth - 2 * (PICKER_EDGE + sideInset);
  const availH = bottom - top;
  const maxCols = Math.max(1, Math.floor((availW - 2 * PICKER_PAD + PICKER_GAP) / (PICKER_CELL_W + PICKER_GAP)));
  const cols = Math.max(1, Math.min(count, maxCols));
  const rows = Math.max(1, Math.ceil(count / cols));
  const panel = (cellH: number, c: number, r: number, arrows: boolean): Rect => {
    const width = c * PICKER_CELL_W + (c - 1) * PICKER_GAP + 2 * PICKER_PAD + (arrows ? 2 * (PICKER_ARROW + PICKER_GAP) : 0);
    const height = Math.max(r * cellH + (r - 1) * PICKER_GAP, arrows ? PICKER_ARROW : 0) + 2 * PICKER_PAD;
    return { x: (viewWidth - width) / 2, y: bottom - height, width, height };
  };

  for (const cellH of CELL_HEIGHTS) {
    const rect = panel(cellH, cols, rows, false);
    if (rect.height <= availH) {
      return { rect, cols, rows, cellH, paged: false, perPage: count, pages: 1, fits: true };
    }
  }

  // Too low for the whole grid: one row, turn pages with the arrows.
  const cellH = Math.min(CELL_HEIGHTS[0], Math.max(MIN_CELL_H, availH - 2 * PICKER_PAD));
  const perPage = Math.max(1, Math.floor((availW - 2 * PICKER_PAD - 2 * (PICKER_ARROW + PICKER_GAP) + PICKER_GAP) / (PICKER_CELL_W + PICKER_GAP)));
  const pageCols = Math.min(perPage, count);
  const rect = panel(cellH, pageCols, 1, true);
  return {
    rect,
    fits: rect.y >= top - 0.001,
    cols: pageCols,
    rows: 1,
    cellH,
    paged: true,
    perPage: pageCols,
    pages: Math.max(1, Math.ceil(count / pageCols)),
  };
}
