import type { Rect } from './cameraMath';

/**
 * Where everything of the shop goes, as pure maths (CSS px): a panel under the
 * store bar with the four tabs and the big ✕ in a row on top, the grid of item
 * cards below and a fixed line at the bottom for the sentence of a locked
 * card (it stays until something else is tapped). The cards are as big as the
 * screen allows – bigger cards are tried first; only if even the smallest do
 * not all fit, the grid turns pages (the same grid with several rows, narrow
 * and low cards allowed), with the two big arrows left and right of the line.
 * Tested on all screen sizes for overlaps and the screen edge.
 */

/** Diameter of the page arrows (over the 48 px tap minimum). */
export const SHOP_ARROW = 56;
export const SHOP_GAP = 8;
export const SHOP_PAD = 8;
/** The gap between the grid and the bottom line. */
const BAR_GAP = 4;
/** Widths of a card: the wide one on tablets, the narrow one before the grid starts paging. */
export const SHOP_CELL_WIDTHS = [104, 88] as const;
/** Heights of a card, biggest first. 72 px is the least in which picture, name and price stay readable (`costRowLayout`). */
export const SHOP_CELL_HEIGHTS = [120, 100, 88, 72] as const;
/** The tabs get at most this much width each (on a tablet they would become huge). */
const MAX_TAB_WIDTH = 150;
const MAX_PANEL_WIDTH = 760;

export interface ShopLayoutInput {
  readonly width: number;
  readonly height: number;
  /** Top of the free area (CSS px): below the store bar. */
  readonly top: number;
  /** The most cards any tab has (the geometry is the same for all tabs, so the panel does not jump when the tab changes). */
  readonly count: number;
  /** Number of tabs. */
  readonly tabCount: number;
}

export interface ShopLayout {
  /** The whole panel. */
  readonly rect: Rect;
  readonly tabs: readonly Rect[];
  /** The big ✕ that closes the shop. */
  readonly close: Rect;
  /** The area of the cards. */
  readonly grid: Rect;
  /** The fixed line at the bottom of the panel: the sentence of a locked card. */
  readonly line: Rect;
  readonly cellW: number;
  readonly cellH: number;
  /** Columns and rows of the cards on one page. */
  readonly cols: number;
  readonly rows: number;
  /** Cards on one page. */
  readonly perPage: number;
  /** With page arrows (only when even the smallest cards do not all fit). */
  readonly paged: boolean;
  readonly prev: Rect | undefined;
  readonly next: Rect | undefined;
  /** Does the panel fit between the store bar and the bottom of the screen? */
  readonly fits: boolean;
}

interface Choice {
  readonly cellW: number;
  readonly cellH: number;
  readonly cols: number;
  readonly rows: number;
  readonly paged: boolean;
  readonly perPage: number;
}

export function shopLayout(input: ShopLayoutInput): ShopLayout {
  const { width, height, top, count, tabCount } = input;
  const low = height < 400;
  const edge = width < 400 ? 6 : 10;
  const panelW = Math.min(width - 2 * edge, MAX_PANEL_WIDTH);
  const panelX = (width - panelW) / 2;
  const bottom = height - edge;

  // Header row: the tabs and the ✕ (at least 48 px; a bit bigger where there is room).
  const tabH = low ? 48 : width >= 700 ? 72 : 60;
  const closeSize = low ? 48 : Math.max(tabH, 56);
  const headerH = Math.max(tabH, closeSize);
  const innerW = panelW - 2 * SHOP_PAD;
  const tabW = Math.min(MAX_TAB_WIDTH, (innerW - closeSize - tabCount * SHOP_GAP) / tabCount);
  const headerY = top + SHOP_PAD;
  const tabs: Rect[] = Array.from({ length: tabCount }, (_, index) => ({
    x: panelX + SHOP_PAD + index * (tabW + SHOP_GAP),
    y: headerY + (headerH - tabH) / 2,
    width: tabW,
    height: tabH,
  }));
  const close: Rect = { x: panelX + panelW - SHOP_PAD - closeSize, y: headerY + (headerH - closeSize) / 2, width: closeSize, height: closeSize };

  // The bottom line: one line on low screens (a phone held sideways), two lines on narrow ones.
  const lineH = low ? 26 : width < 400 ? 46 : 44;
  const gridTop = headerY + headerH + SHOP_GAP;
  const availW = panelW - 2 * SHOP_PAD;
  const availH = bottom - SHOP_PAD - gridTop;
  const need = (rows: number, cellH: number): number => rows * cellH + (rows - 1) * SHOP_GAP;
  const colsFor = (cellW: number): number => Math.max(1, Math.min(count, Math.floor((availW + SHOP_GAP) / (cellW + SHOP_GAP))));

  let choice: Choice | undefined;
  // The biggest cards for which all cards fit on one page; the wide ones before the narrow ones.
  for (const cellH of SHOP_CELL_HEIGHTS) {
    for (const cellW of SHOP_CELL_WIDTHS) {
      const cols = colsFor(cellW);
      const rows = Math.max(1, Math.ceil(count / cols));
      if (!choice && need(rows, cellH) <= availH - lineH - BAR_GAP) {
        choice = { cellW, cellH, cols, rows, paged: false, perPage: count };
      }
    }
  }
  const barH = Math.max(lineH, SHOP_ARROW);
  if (!choice) {
    // Not all cards fit: the same grid with as many cards per page as possible (several rows, narrow and low cards allowed).
    let best: Choice | undefined;
    for (const cellH of SHOP_CELL_HEIGHTS) {
      for (const cellW of SHOP_CELL_WIDTHS) {
        const cols = colsFor(cellW);
        const rows = Math.floor((availH - barH - BAR_GAP + SHOP_GAP) / (cellH + SHOP_GAP));
        if (rows < 1) {
          continue;
        }
        const perPage = Math.min(count, cols * rows);
        // Most cards per page; then the bigger cards.
        if (!best || perPage > best.perPage) {
          best = { cellW, cellH, cols, rows: Math.min(rows, Math.ceil(count / cols)), paged: true, perPage };
        }
      }
    }
    // A screen too low even for one row of the smallest cards: one row anyway (the panel will not fit; `fits` says so).
    const smallest = SHOP_CELL_HEIGHTS[SHOP_CELL_HEIGHTS.length - 1] ?? 72;
    const cols = colsFor(SHOP_CELL_WIDTHS[SHOP_CELL_WIDTHS.length - 1] ?? 88);
    choice = best ?? { cellW: SHOP_CELL_WIDTHS[SHOP_CELL_WIDTHS.length - 1] ?? 88, cellH: smallest, cols, rows: 1, paged: true, perPage: cols };
  }

  const gridH = need(choice.rows, choice.cellH);
  const grid: Rect = { x: panelX + SHOP_PAD, y: gridTop, width: availW, height: gridH };
  const bar = choice.paged ? barH : lineH;
  const barY = gridTop + gridH + BAR_GAP;
  const rect: Rect = { x: panelX, y: top, width: panelW, height: barY + bar + SHOP_PAD - top };

  let prev: Rect | undefined;
  let next: Rect | undefined;
  let line: Rect = { x: grid.x, y: barY + (bar - lineH) / 2, width: grid.width, height: lineH };
  if (choice.paged) {
    const y = barY + (bar - SHOP_ARROW) / 2;
    prev = { x: grid.x, y, width: SHOP_ARROW, height: SHOP_ARROW };
    next = { x: grid.x + grid.width - SHOP_ARROW, y, width: SHOP_ARROW, height: SHOP_ARROW };
    line = { x: grid.x + SHOP_ARROW + SHOP_GAP, y: barY + (bar - lineH) / 2, width: grid.width - 2 * (SHOP_ARROW + SHOP_GAP), height: lineH };
  }

  return {
    rect,
    tabs,
    close,
    grid,
    line,
    ...choice,
    prev,
    next,
    fits: rect.y + rect.height <= bottom + 0.001 && tabW >= 48 && choice.rows * choice.cellH + (choice.rows - 1) * SHOP_GAP <= availH - bar - BAR_GAP + 0.001,
  };
}

/** Number of pages for a tab with `items` cards. */
export function shopPages(layout: ShopLayout, items: number): number {
  return Math.max(1, Math.ceil(items / layout.perPage));
}

/**
 * The rectangles of the cards on a page. A row that is not full is centred;
 * `onPage` is the number of cards on that page.
 */
export function shopCellRects(layout: ShopLayout, onPage: number): Rect[] {
  const { grid, cellW, cellH, cols } = layout;
  const rects: Rect[] = [];
  for (let index = 0; index < onPage; index += 1) {
    const row = Math.floor(index / cols);
    const inRow = Math.min(cols, onPage - row * cols);
    const rowW = inRow * cellW + (inRow - 1) * SHOP_GAP;
    const col = index - row * cols;
    rects.push({ x: grid.x + (grid.width - rowW) / 2 + col * (cellW + SHOP_GAP), y: grid.y + row * (cellH + SHOP_GAP), width: cellW, height: cellH });
  }
  return rects;
}
