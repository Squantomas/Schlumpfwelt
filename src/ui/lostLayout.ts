import type { Rect } from './cameraMath';

/**
 * Where the parts of the layer go that covers the game when another window has taken over the saving (pure maths in CSS
 * px, tested on every screen size): a panel in the middle with the sentence, one big round "play" button and its
 * word. The veil under it covers the whole screen, so nothing can be built that would not be saved.
 */

export const LOST_MARGIN = 12;
const PAD = 14;
const GAP = 8;
const MAX_PANEL_W = 520;
/** The button is big (at least 80 px, also on a low phone): a child finds it without reading. */
export const LOST_BUTTON_NORMAL = 96;
export const LOST_BUTTON_LOW = 80;
const CAPTION_H = 30;

export interface LostLayout {
  readonly veil: Rect;
  readonly panel: Rect;
  readonly text: Rect;
  /** The round button (a square around it). */
  readonly button: Rect;
  /** The word under the button. */
  readonly caption: Rect;
  readonly textFont: number;
  readonly captionFont: number;
}

export function lostLayout(width: number, height: number): LostLayout {
  const low = height < 400;
  const panelW = Math.min(MAX_PANEL_W, width - 2 * LOST_MARGIN);
  const textH = low ? 56 : 92;
  const diameter = low ? LOST_BUTTON_LOW : LOST_BUTTON_NORMAL;
  const panelH = PAD + textH + GAP + diameter + 4 + CAPTION_H + PAD;
  const panel: Rect = { x: (width - panelW) / 2, y: Math.max(LOST_MARGIN, (height - panelH) / 2), width: panelW, height: panelH };
  const text: Rect = { x: panel.x + PAD, y: panel.y + PAD, width: panelW - 2 * PAD, height: textH };
  const button: Rect = { x: panel.x + (panelW - diameter) / 2, y: text.y + textH + GAP, width: diameter, height: diameter };
  const caption: Rect = { x: panel.x + PAD, y: button.y + diameter + 4, width: panelW - 2 * PAD, height: CAPTION_H };
  return { veil: { x: 0, y: 0, width, height }, panel, text, button, caption, textFont: width < 420 || low ? 16 : 19, captionFont: low ? 18 : 22 };
}
