import type { Rect } from './cameraMath';
import { CANCEL_DIAMETER, CONFIRM_DIAMETER } from './confirmLayout';

/**
 * Where the parts of the menu behind the gear go, as pure maths in CSS px: a
 * panel in the middle of the screen over a dark veil, with the title and a
 * big ✕ on top, a sentence, and then either the two big buttons ("Als Datei
 * sichern", "Aus Datei laden" – side by side on a low screen, else one under
 * the other) or, after a file was chosen, ✓ and ✕. M8: a third button, "Für Eltern" (the parents' menu with the PIN),
 * under the two (beside them on a low screen). Tested on every screen size:
 * nothing overlaps, nothing leaves the screen, every target is at least 48 px.
 */

export const MENU_MARGIN = 12;
const PAD = 14;
const GAP = 10;
const HEADER_H = 64;
/** The close button is a circle of this diameter. */
export const MENU_CLOSE = 64;
export const MENU_BUTTON_H = 68;
const MAX_PANEL_W = 560;

export type MenuLayoutMode = 'menu' | 'confirm';

export interface MenuLayout {
  /** The veil over the whole screen (it also keeps taps away from the island). */
  readonly veil: Rect;
  readonly panel: Rect;
  /** The title, left of the close button. */
  readonly title: Rect;
  /** The big ✕ at the top right (leaves the menu); not while ✓ / ✕ ask a question, so there is only one ✕ to pick. */
  readonly close: Rect | undefined;
  /** The sentence (standing info, error, or the question). */
  readonly text: Rect;
  /** Menu mode: the two buttons. */
  readonly save: Rect | undefined;
  readonly load: Rect | undefined;
  /** Menu mode: "Für Eltern" (M8). */
  readonly parent: Rect | undefined;
  /** Confirm mode: ✓ and ✕ (left of ✓). */
  readonly confirm: Rect | undefined;
  readonly cancel: Rect | undefined;
  /** Letter size of the title and of the sentence (CSS px). */
  readonly titleFont: number;
  readonly textFont: number;
}

/** Is the screen so low (a phone held sideways) that the buttons go side by side? (Three under each other need about 450 px.) */
export function menuIsLow(height: number): boolean {
  return height < 450;
}

export function menuLayout(width: number, height: number, mode: MenuLayoutMode): MenuLayout {
  const low = menuIsLow(height);
  const panelW = Math.min(MAX_PANEL_W, width - 2 * MENU_MARGIN);
  const textH = low ? 52 : 84;
  const textFont = width < 420 || low ? 16 : 19;
  const titleFont = low ? 24 : 30;

  const bodyH =
    mode === 'confirm' ? CONFIRM_DIAMETER : low ? MENU_BUTTON_H : 3 * MENU_BUTTON_H + 2 * GAP;
  const panelH = PAD + HEADER_H + GAP + textH + GAP + bodyH + PAD;
  const panel: Rect = { x: (width - panelW) / 2, y: Math.max(MENU_MARGIN, (height - panelH) / 2), width: panelW, height: panelH };

  const innerX = panel.x + PAD;
  const innerW = panelW - 2 * PAD;
  const closeRect: Rect = { x: panel.x + panelW - PAD - MENU_CLOSE, y: panel.y + PAD, width: MENU_CLOSE, height: MENU_CLOSE };
  const close = mode === 'confirm' ? undefined : closeRect;
  const title: Rect = { x: innerX, y: panel.y + PAD, width: (close ? close.x - GAP : innerX + innerW) - innerX, height: HEADER_H };
  const text: Rect = { x: innerX, y: panel.y + PAD + HEADER_H + GAP, width: innerW, height: textH };
  const bodyY = text.y + textH + GAP;

  let save: Rect | undefined;
  let load: Rect | undefined;
  let parent: Rect | undefined;
  let confirm: Rect | undefined;
  let cancel: Rect | undefined;
  if (mode === 'confirm') {
    const pairW = CANCEL_DIAMETER + GAP * 2 + CONFIRM_DIAMETER;
    const left = panel.x + (panelW - pairW) / 2;
    cancel = { x: left, y: bodyY + (CONFIRM_DIAMETER - CANCEL_DIAMETER) / 2, width: CANCEL_DIAMETER, height: CANCEL_DIAMETER };
    confirm = { x: left + CANCEL_DIAMETER + GAP * 2, y: bodyY, width: CONFIRM_DIAMETER, height: CONFIRM_DIAMETER };
  } else if (low) {
    const each = (innerW - 2 * GAP) / 3;
    save = { x: innerX, y: bodyY, width: each, height: MENU_BUTTON_H };
    load = { x: innerX + each + GAP, y: bodyY, width: each, height: MENU_BUTTON_H };
    parent = { x: innerX + 2 * (each + GAP), y: bodyY, width: each, height: MENU_BUTTON_H };
  } else {
    save = { x: innerX, y: bodyY, width: innerW, height: MENU_BUTTON_H };
    load = { x: innerX, y: bodyY + MENU_BUTTON_H + GAP, width: innerW, height: MENU_BUTTON_H };
    parent = { x: innerX, y: bodyY + 2 * (MENU_BUTTON_H + GAP), width: innerW, height: MENU_BUTTON_H };
  }
  return { veil: { x: 0, y: 0, width, height }, panel, title, close, text, save, load, parent, confirm, cancel, titleFont, textFont };
}

/**
 * The middle of the title: the middle of the panel where the (centred) title stays clear of the ✕, otherwise – on a
 * narrow screen – the middle of the room left of the ✕ (a title slightly left of the middle looks better than one
 * under the button).
 */
export function menuTitleCenterX(layout: MenuLayout, textWidth: number): number {
  const panelCenter = layout.panel.x + layout.panel.width / 2;
  const room = layout.close ? layout.close.x - GAP : layout.panel.x + layout.panel.width - PAD;
  return panelCenter + textWidth / 2 <= room ? panelCenter : layout.title.x + layout.title.width / 2;
}
