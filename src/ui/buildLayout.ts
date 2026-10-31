import type { Rect } from './cameraMath';
import { CANCEL_DIAMETER, CONFIRM_DIAMETER, placeConfirmButtons } from './confirmLayout';
import { infoCardLayout, type InfoCardLayout } from './infoCardLayout';
import { shopLayout, type ShopLayout } from './shopLayout';
import { STOCK_GAP, stockLayout, type StockLayout } from './stockLayout';
import { TOOLBAR_EDGE, TOOLBAR_GAP, TOOLBAR_PAD, toolbarLayout, type ToolbarLayout } from './toolbarLayout';

/**
 * Where everything of the building controls goes, as pure maths (CSS px), so
 * a test can check that on every screen size nothing overlaps and nothing
 * leaves the screen: toolbar, hint bar, zoom buttons, the chip, and the
 * ✓ / ✕ pair – or, while the shop is open, the store bar and the shop panel
 * (the shop covers the rest: toolbar, zoom buttons, hint bar and ✓ / ✕ are hidden).
 */

/** Width kept free at the right (and, to stay centred, at the left) for the zoom buttons. */
export const ZOOM_COLUMN = 92;
/** Radius of the ✕ (back) button in the hint bar. */
export const EXIT_RADIUS = 32;
export const CHIP_W = 76;
export const CHIP_H = 90;
const GAP = 8;
/** Height the hint bar has at least while a tool is on (the big back button). */
export const HINT_MIN_HEIGHT = 2 * EXIT_RADIUS + 8;
/** On narrow screens (under 420 px) the hint bar is at most this tall: long sentences get smaller letters (see `BuildUI.measureHint`). */
export const HINT_MAX_HEIGHT_NARROW = 96;

export interface ZoomLayout {
  readonly radius: number;
  readonly zoomIn: { readonly x: number; readonly y: number };
  readonly zoomOut: { readonly x: number; readonly y: number };
  /** Centre of the gear (menu: save and load a file) under the zoom buttons, same size; shown only while looking (see `BuildLayout.menu`). */
  readonly menu: { readonly x: number; readonly y: number };
  /** The two zoom buttons. */
  readonly rect: Rect;
}

/** The two zoom buttons and the gear below them at the top right; smaller (still over 48 px) on low screens. */
export function zoomLayout(width: number, height: number): ZoomLayout {
  const low = height < 400;
  const radius = low ? 28 : 34;
  const margin = low ? 12 : 16;
  const gap = low ? 8 : 12;
  const x = width - margin - radius;
  const zoomIn = { x, y: margin + radius };
  const zoomOut = { x, y: zoomIn.y + 2 * radius + gap };
  const menu = { x, y: zoomOut.y + 2 * radius + gap };
  return { radius, zoomIn, zoomOut, menu, rect: { x: x - radius, y: margin, width: 2 * radius, height: 4 * radius + gap } };
}

/** Horizontal place of the hint bar: always the same width, clear of the zoom column. */
export function hintBarGeometry(width: number): { x: number; width: number } {
  const maxBar = Math.max(width - 2 * ZOOM_COLUMN, Math.min(width - ZOOM_COLUMN - 12, 420));
  const barW = Math.min(maxBar, 720);
  return { x: Math.min(Math.max((width - barW) / 2, 12), Math.max(12, width - ZOOM_COLUMN - barW)), width: barW };
}

export interface BuildLayoutInput {
  readonly width: number;
  readonly height: number;
  readonly toolCount: number;
  /** Is the shop open? Then it fills the screen below the store bar. */
  readonly shopOpen: boolean;
  /** Number of cards in the biggest tab of the shop (the panel has the same size for every tab). */
  readonly shopCount: number;
  /** Number of tabs of the shop. */
  readonly shopTabs: number;
  /** Is an item being placed (the chip "back to the shop" is shown)? */
  readonly hasChip: boolean;
  readonly hasPreview: boolean;
  /** Height of the hint bar (0: none). */
  readonly hintHeight: number;
  /** While a tool is on the hint bar is at the top (below the store bar), while looking it sits above the toolbar. */
  readonly hintAtTop: boolean;
  /** Number of items in the store bar (coins and goods). */
  readonly stockCount: number;
  /** Is the info card of a production building open? (Only while looking.) */
  readonly infoOpen: boolean;
  /** Does the gear belong on screen (only while looking: no tool, no card, no shop)? */
  readonly hasMenu?: boolean;
}

export interface BuildLayout {
  /** The store bar at the top left. */
  readonly stock: StockLayout;
  /** The info card, if open. */
  readonly card: InfoCardLayout | undefined;
  readonly toolbar: ToolbarLayout & { readonly rect: Rect };
  readonly hint: Rect | undefined;
  readonly zoom: ZoomLayout;
  /** The gear under the zoom buttons, if shown. */
  readonly menu: Rect | undefined;
  /** The shop, if open. Toolbar, zoom buttons, hint bar, chip and ✓ / ✕ are hidden then. */
  readonly shop: ShopLayout | undefined;
  /** The small button "back to the shop" (while an item is being placed). */
  readonly chip: Rect | undefined;
  /** Rects of the ✓ and ✕ buttons (only with a preview). */
  readonly confirm: Rect | undefined;
  readonly cancel: Rect | undefined;
}

export function layoutBuildUi(input: BuildLayoutInput): BuildLayout {
  const { width, height } = input;
  const zoom = zoomLayout(width, height);
  const tools = toolbarLayout(width, input.toolCount, height);
  const panelW = tools.cols * tools.size + (tools.cols - 1) * TOOLBAR_GAP + 2 * TOOLBAR_PAD;
  const panelH = tools.rows * tools.size + (tools.rows - 1) * TOOLBAR_GAP + 2 * TOOLBAR_PAD;
  const toolbar = { ...tools, rect: { x: (width - panelW) / 2, y: height - TOOLBAR_EDGE - panelH, width: panelW, height: panelH } };

  // The store bar sits at the top left, left of the zoom column; the hint bar goes below it while a tool is on.
  const stock = stockLayout(width, height, input.stockCount, zoom.rect.x - GAP);
  const hintTop = stock.rect.y + stock.rect.height + STOCK_GAP;

  const bar = hintBarGeometry(width);
  let hint: Rect | undefined;
  if (input.hintHeight > 0 && !input.shopOpen) {
    const y = input.hintAtTop ? hintTop : toolbar.rect.y - 12 - input.hintHeight;
    hint = { x: bar.x, y, width: bar.width, height: input.hintHeight };
  }

  const rowAbove = toolbar.rect.y - GAP;
  const chip = input.hasChip && !input.shopOpen ? { x: TOOLBAR_EDGE, y: rowAbove - CHIP_H, width: CHIP_W, height: CHIP_H } : undefined;
  const shop = input.shopOpen ? shopLayout({ width, height, top: hintTop, count: input.shopCount, tabCount: input.shopTabs }) : undefined;

  let confirm: Rect | undefined;
  let cancel: Rect | undefined;
  if (input.hasPreview && !input.shopOpen) {
    const placement = placeConfirmButtons(width, toolbar.rect.y);
    confirm = { x: placement.confirm.x - CONFIRM_DIAMETER / 2, y: placement.confirm.y - CONFIRM_DIAMETER / 2, width: CONFIRM_DIAMETER, height: CONFIRM_DIAMETER };
    cancel = { x: placement.cancel.x - CANCEL_DIAMETER / 2, y: placement.cancel.y - CANCEL_DIAMETER / 2, width: CANCEL_DIAMETER, height: CANCEL_DIAMETER };
  }

  const card = input.infoOpen && !input.shopOpen
    ? infoCardLayout({ top: stock.rect.y + stock.rect.height + GAP, bottom: toolbar.rect.y - GAP, width, zoom: zoom.rect })
    : undefined;

  const showMenu = input.hasMenu === true && !input.shopOpen && !input.infoOpen && !input.hasPreview && !input.hasChip;
  const menu: Rect | undefined = showMenu ? { x: zoom.menu.x - zoom.radius, y: zoom.menu.y - zoom.radius, width: 2 * zoom.radius, height: 2 * zoom.radius } : undefined;

  return { stock, card, toolbar, hint, zoom, menu, shop, chip, confirm, cancel };
}
