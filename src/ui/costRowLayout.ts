/**
 * Layout of a row of cost items (a picture and a number each, e.g. coin 30,
 * log 8, stone 2) inside a picker card. The numbers are never smaller than
 * {@link COST_MIN_FONT} CSS px: if the row is too narrow, the pictures and
 * the gaps shrink first. Pure maths, tested for every building and card size.
 */

export const COST_MIN_FONT = 13;
const MAX_FONT = 17;
const MIN_ICON = 10;
/** Width of a digit relative to the font size (bold, a little generous). */
const CHAR_WIDTH = 0.64;
/** Gap between a picture and its number. */
const ICON_GAP = 2;

export interface CostItemLayout {
  readonly id: string;
  readonly text: string;
  /** Left edge of the picture, from the left edge of the row. */
  readonly iconX: number;
  /** Left edge of the number. */
  readonly textX: number;
  readonly textWidth: number;
}

export interface CostRowLayout {
  readonly fontSize: number;
  readonly iconSize: number;
  readonly items: readonly CostItemLayout[];
  /** Total width used. */
  readonly used: number;
  /** Does everything fit into `width` with the minimum sizes? */
  readonly fits: boolean;
}

export function costRowLayout(width: number, height: number, entries: readonly { readonly id: string; readonly text: string }[]): CostRowLayout {
  const count = entries.length;
  const preferred = Math.min(MAX_FONT, Math.max(COST_MIN_FONT, height * 0.8));
  // Too wide: first the gaps and the pictures get smaller, then (down to the minimum) the numbers.
  let fontSize = Math.floor(preferred);
  for (;;) {
    const textWidths = entries.map((entry) => Math.ceil(entry.text.length * CHAR_WIDTH * fontSize));
    const totalText = textWidths.reduce((sum, w) => sum + w, 0);
    let gap = 6;
    let iconSize = Math.max(MIN_ICON, Math.min(height * 0.95, fontSize * 1.5));
    const total = (): number => count * (iconSize + ICON_GAP) + totalText + Math.max(0, count - 1) * gap;
    while (total() > width && gap > 2) {
      gap -= 1;
    }
    while (total() > width && iconSize > MIN_ICON) {
      iconSize = Math.max(MIN_ICON, iconSize - 1);
    }
    if (total() <= width || fontSize <= COST_MIN_FONT) {
      const used = total();
      let x = Math.max(0, (width - used) / 2);
      const items = entries.map((entry, index) => {
        const textWidth = textWidths[index] ?? 0;
        const item: CostItemLayout = { id: entry.id, text: entry.text, iconX: x, textX: x + iconSize + ICON_GAP, textWidth };
        x += iconSize + ICON_GAP + textWidth + gap;
        return item;
      });
      return { fontSize, iconSize, items, used, fits: used <= width + 0.001 };
    }
    fontSize -= 1;
  }
}
