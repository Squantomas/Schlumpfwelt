import type { Rect } from './cameraMath';

/**
 * Where the parts of the good-night layer go (M8), pure maths in CSS px, tested on every screen size: the moon high up,
 * a few stars around it (never behind the sentence or the button), the sentence "Gute Nacht! Morgen geht es weiter." in
 * the middle, and the round button "Für Eltern" (with a lock, at least 64 px) at the bottom. The veil covers the whole
 * screen and swallows every tap.
 */

export const NIGHT_MARGIN = 16;
export const NIGHT_BUTTON = 72;
export const NIGHT_BUTTON_LOW = 64;
const CAPTION_H = 26;

export interface NightLayout {
  readonly veil: Rect;
  readonly moon: { readonly x: number; readonly y: number; readonly radius: number };
  readonly stars: readonly { readonly x: number; readonly y: number; readonly radius: number }[];
  readonly text: Rect;
  readonly textFont: number;
  /** The round button for the parents (a square around it) and its word below. */
  readonly button: Rect;
  readonly caption: Rect;
}

/** A fixed little sky: the same stars every time (no randomness, the layer is drawn once per size). */
const SKY: readonly (readonly [number, number, number])[] = [
  [0.08, 0.1, 1.2], [0.2, 0.22, 0.8], [0.33, 0.07, 1], [0.45, 0.18, 0.7], [0.58, 0.06, 1.3], [0.9, 0.12, 0.9],
  [0.93, 0.32, 0.7], [0.06, 0.36, 0.9], [0.27, 0.36, 0.6], [0.52, 0.32, 0.8], [0.14, 0.62, 0.7], [0.86, 0.6, 1],
  [0.05, 0.84, 1.1], [0.3, 0.9, 0.7], [0.7, 0.88, 0.9], [0.95, 0.8, 0.8], [0.4, 0.72, 0.6], [0.64, 0.72, 0.7],
];

function inside(x: number, y: number, rect: Rect, pad: number): boolean {
  return x >= rect.x - pad && x <= rect.x + rect.width + pad && y >= rect.y - pad && y <= rect.y + rect.height + pad;
}

export function nightLayout(width: number, height: number): NightLayout {
  const low = height < 420;
  const short = Math.min(width, height);
  const radius = Math.min(64, Math.max(26, short * 0.08));
  const moon = { x: width * 0.74, y: NIGHT_MARGIN + radius + (low ? 4 : short * 0.06), radius };
  const diameter = low ? NIGHT_BUTTON_LOW : NIGHT_BUTTON;
  const button: Rect = { x: (width - diameter) / 2, y: height - NIGHT_MARGIN - CAPTION_H - 2 - diameter, width: diameter, height: diameter };
  const caption: Rect = { x: NIGHT_MARGIN, y: button.y + diameter + 2, width: width - 2 * NIGHT_MARGIN, height: CAPTION_H };
  const textFont = width < 420 || low ? 24 : 32;
  const textTop = moon.y + radius + 12;
  const textH = Math.min(140, button.y - 12 - textTop);
  const textW = Math.min(620, width - 2 * NIGHT_MARGIN);
  const text: Rect = { x: (width - textW) / 2, y: textTop + Math.max(0, (button.y - 12 - textTop - textH) / 2), width: textW, height: textH };
  const stars = SKY.map(([fx, fy, size]) => ({ x: fx * width, y: fy * height, radius: size * (low ? 2 : 2.6) })).filter(
    (star) =>
      !inside(star.x, star.y, text, 6) &&
      !inside(star.x, star.y, button, 10) &&
      !inside(star.x, star.y, caption, 4) &&
      Math.hypot(star.x - moon.x, star.y - moon.y) > radius + 10,
  );
  return { veil: { x: 0, y: 0, width, height }, moon, stars, text, textFont, button, caption };
}
