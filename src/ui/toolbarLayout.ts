/**
 * Size and rows of the toolbar buttons so that every width from 320 CSS px up
 * shows all tools: one row with big buttons (up to 96 px) if they stay at
 * least 64 px, a single row of 56–64 px buttons if that fits, and otherwise
 * two or more rows. Never smaller than 56 px (above the 48 px tap minimum).
 */

export interface ToolbarLayout {
  /** Edge length of one button in CSS px. */
  readonly size: number;
  readonly cols: number;
  readonly rows: number;
}

export const TOOLBAR_GAP = 8;
export const TOOLBAR_EDGE = 10;
export const TOOLBAR_PAD = 8;
const PREFERRED_MIN = 64;
const ABSOLUTE_MIN = 56;
const MAX_SIZE = 96;
const MAX_SIZE_WRAPPED = 72;

export function toolbarLayout(viewWidth: number, count: number): ToolbarLayout {
  const available = viewWidth - 2 * TOOLBAR_EDGE - 2 * TOOLBAR_PAD;
  const fit = (cols: number): number => (available - (cols - 1) * TOOLBAR_GAP) / cols;

  const single = fit(count);
  if (single >= ABSOLUTE_MIN) {
    return { size: Math.min(MAX_SIZE, single), cols: count, rows: 1 };
  }
  for (let rows = 2; rows <= count; rows += 1) {
    const cols = Math.ceil(count / rows);
    const size = fit(cols);
    if (size >= ABSOLUTE_MIN) {
      return { size: Math.min(MAX_SIZE_WRAPPED, size), cols, rows };
    }
  }
  return { size: ABSOLUTE_MIN, cols: 1, rows: count };
}

/** Is the single-row size still the comfortable one (64 px and more)? For tests and tuning. */
export function isComfortable(layout: ToolbarLayout): boolean {
  return layout.size >= PREFERRED_MIN;
}
