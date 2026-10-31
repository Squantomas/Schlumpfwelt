import type { Rect } from './cameraMath';

/**
 * Where everything of the shop goes, as pure maths (CSS px): a panel under the
 * store bar with the four tabs and the big ✕ in a row on top and the grid of
 * item cards below. The cards are as big as the screen allows – bigger cards
 * are tried first; only if even the smallest do not fit, the grid turns pages
 * with big arrows. Tested on all screen sizes for overlaps and the screen edge.
 */

/** Diameter of the page arrows (over the 48 px tap minimum). */
export const SHOP_ARROW = 56;
export const SHOP_GAP = 8;
export const SHOP_PAD = 8;
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
  /** The area of the cards (and the arrows). */
  readonly grid: Rect;
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

export function shopLayout(input: ShopLayoutInput): ShopLayout {
  const { width, height, top, count, tabCount } = input;
  const edge = width < 400 ? 6 : 10;
  const panelW = Math.min(width - 2 * edge, MAX_PANEL_WIDTH);
  const panelX = (width - panelW) / 2;
  const bottom = height - edge;

  // Header row: the tabs and the ✕.
  const tabH = height < 400 ? 52 : width >= 700 ? 72 : 60;
  const closeSize = Math.max(tabH, 56);
  const innerW = panelW - 2 * SHOP_PAD;
  const tabW = Math.min(MAX_TAB_WIDTH, (innerW - closeSize - tabCount * SHOP_GAP) / tabCount);
  const headerY = top + SHOP_PAD;
  const tabs: Rect[] = Array.from({ length: tabCount }, (_, index) => ({
    x: panelX + SHOP_PAD + index * (tabW + SHOP_GAP),
    y: headerY,
    width: tabW,
    height: tabH,
  }));
  const close: Rect = { x: panelX + panelW - SHOP_PAD - closeSize, y: headerY + (tabH - closeSize) / 2, width: closeSize, height: closeSize };

  // The cards.
  const gridTop = headerY + Math.max(tabH, closeSize) + SHOP_GAP;
  const availW = panelW - 2 * SHOP_PAD;
  const availH = bottom - SHOP_PAD - gridTop;
  const need = (rows: number, cellH: number): number => rows * cellH + (rows - 1) * SHOP_GAP;

  let choice: { cellW: number; cellH: number; cols: number; rows: number; paged: boolean; perPage: number } | undefined;
  // The biggest cards for which all cards fit on one page; the wide ones before the narrow ones.
  for (const cellH of SHOP_CELL_HEIGHTS) {
    for (const cellW of SHOP_CELL_WIDTHS) {
      const cols = Math.max(1, Math.min(count, Math.floor((availW + SHOP_GAP) / (cellW + SHOP_GAP))));
      const rows = Math.max(1, Math.ceil(count / cols));
      if (!choice && need(rows, cellH) <= availH) {
        choice = { cellW, cellH, cols, rows, paged: false, perPage: count };
      }
    }
  }
  if (!choice) {
    // Even the smallest cards do not all fit: one row, turn pages with the arrows.
    const cellW = SHOP_CELL_WIDTHS[0];
    const cellH = Math.min(SHOP_CELL_HEIGHTS[0], Math.max(SHOP_CELL_HEIGHTS[SHOP_CELL_HEIGHTS.length - 1] ?? 72, availH));
    const perPage = Math.max(1, Math.floor((availW - 2 * (SHOP_ARROW + SHOP_GAP) + SHOP_GAP) / (cellW + SHOP_GAP)));
    choice = { cellW, cellH, cols: Math.min(perPage, count), rows: 1, paged: true, perPage: Math.min(perPage, count) };
  }

  const gridH = choice.paged ? Math.max(choice.cellH, SHOP_ARROW) : need(choice.rows, choice.cellH);
  const grid: Rect = { x: panelX + SHOP_PAD, y: gridTop, width: availW, height: gridH };
  const rect: Rect = { x: panelX, y: top, width: panelW, height: gridTop + gridH + SHOP_PAD - top };

  let prev: Rect | undefined;
  let next: Rect | undefined;
  if (choice.paged) {
    const y = grid.y + (grid.height - SHOP_ARROW) / 2;
    prev = { x: grid.x, y, width: SHOP_ARROW, height: SHOP_ARROW };
    next = { x: grid.x + grid.width - SHOP_ARROW, y, width: SHOP_ARROW, height: SHOP_ARROW };
  }

  return {
    rect,
    tabs,
    close,
    grid,
    ...choice,
    prev,
    next,
    fits: rect.y + rect.height <= bottom + 0.001 && choice.cellH <= availH + 0.001 && tabW >= 48,
  };
}

/** Number of pages for a tab with `items` cards. */
export function shopPages(layout: ShopLayout, items: number): number {
  return Math.max(1, Math.ceil(items / layout.perPage));
}

/**
 * The rectangles of the cards on a page. A row that is not full is centred
 * (so are the cards between the arrows); `onPage` is the number of cards on that page.
 */
export function shopCellRects(layout: ShopLayout, onPage: number): Rect[] {
  const { grid, cellW, cellH, cols } = layout;
  const rects: Rect[] = [];
  const left = layout.paged ? grid.x + SHOP_ARROW + SHOP_GAP : grid.x;
  const rowAreaW = layout.paged ? grid.width - 2 * (SHOP_ARROW + SHOP_GAP) : grid.width;
  const top = layout.paged ? grid.y + (grid.height - cellH) / 2 : grid.y;
  for (let index = 0; index < onPage; index += 1) {
    const row = Math.floor(index / cols);
    const inRow = Math.min(cols, onPage - row * cols);
    const rowW = inRow * cellW + (inRow - 1) * SHOP_GAP;
    const col = index - row * cols;
    rects.push({ x: left + (rowAreaW - rowW) / 2 + col * (cellW + SHOP_GAP), y: top + row * (cellH + SHOP_GAP), width: cellW, height: cellH });
  }
  return rects;
}
