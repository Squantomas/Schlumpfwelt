import type { Rect } from './cameraMath';

/**
 * Where the parts of the good-night layer go (M8), pure maths in CSS px, tested on every screen size: the moon high up,
 * a few stars around it (never behind the sentence or the button), the sentence "Gute Nacht! Morgen geht es weiter." in
 * the middle, and the round button "Für Eltern" (with a lock, at least 64 px) quietly in the lower left corner (Spieltest,
 * Korrekturrunde 1: in the middle it drew the child's eye). The veil covers the whole screen and swallows every tap.
 */

export const NIGHT_MARGIN = 16;
export const NIGHT_BUTTON = 72;
export const NIGHT_BUTTON_LOW = 64;
const CAPTION_H = 26;
/** The word under the button is at most this wide (CSS px); the button stands in the middle above it. */
const CAPTION_W = 140;

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

function apart(a: Rect, b: Rect): boolean {
  return a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
}

function inside(x: number, y: number, rect: Rect, pad: number): boolean {
  return x >= rect.x - pad && x <= rect.x + rect.width + pad && y >= rect.y - pad && y <= rect.y + rect.height + pad;
}

/**
 * `toolbar`: the (dimmed) toolbar below the layer. On a narrow screen held upright it reaches into the lower left
 * corner – then the button stands above it, so that it does not lie over "Weg" and "Shop" (Korrekturrunde 2).
 */
export function nightLayout(width: number, height: number, toolbar?: Rect): NightLayout {
  const low = height < 420;
  const short = Math.min(width, height);
  const radius = Math.min(64, Math.max(26, short * 0.08));
  const moon = { x: width * 0.74, y: NIGHT_MARGIN + radius + (low ? 4 : short * 0.06), radius };
  const diameter = low ? NIGHT_BUTTON_LOW : NIGHT_BUTTON;
  const captionW = Math.max(diameter, Math.min(CAPTION_W, width - 2 * NIGHT_MARGIN));
  const corner: Rect = { x: NIGHT_MARGIN, y: height - NIGHT_MARGIN - CAPTION_H - 2 - diameter, width: captionW, height: diameter + 2 + CAPTION_H };
  const lift = height > width && toolbar !== undefined && !apart(corner, toolbar) ? corner.y + corner.height - (toolbar.y - 8) : 0;
  const button: Rect = { x: NIGHT_MARGIN + (captionW - diameter) / 2, y: corner.y - Math.max(0, lift), width: diameter, height: diameter };
  const caption: Rect = { x: NIGHT_MARGIN, y: button.y + diameter + 2, width: captionW, height: CAPTION_H };
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

/** How strong the evening and the night are drawn this frame (alpha of each part, 0 … 1). */
export interface NightLook {
  /** The warm orange glow of the evening. */
  readonly warm: number;
  /** The deep blue over the island. */
  readonly dark: number;
  /** Moon, stars, sentence and the parents' button. */
  readonly sky: number;
  /** Does the layer swallow taps (evening and night)? */
  readonly blocks: boolean;
}

export const NIGHT_LOOK = {
  /** Strongest warm glow (in the evening) and darkness in the evening and in the night. */
  warm: 0.3,
  duskDark: 0.42,
  nightDark: 0.86,
  /** The sky of the night fades in over this long (ms); after a reload in the night it is there at once. */
  skyInMs: 1500,
} as const;

/**
 * The look of a phase (M8): the evening gets slowly warmer and darker over `duskMs` (its shortest length), the night
 * turns deep blue with the moon and the stars (fading in over `skyInMs` since it began), and in the morning
 * everything fades away over `dawnMs`. Only two coloured layers and their alpha – cheap in every frame.
 */
export function nightLook(phase: 'day' | 'dusk' | 'night' | 'dawn', phaseMs: number, nightMs: number, duskMs: number, dawnMs: number): NightLook {
  const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
  switch (phase) {
    case 'day':
      return { warm: 0, dark: 0, sky: 0, blocks: false };
    case 'dusk': {
      const a = clamp01(phaseMs / duskMs);
      return { warm: NIGHT_LOOK.warm * a, dark: NIGHT_LOOK.duskDark * a, sky: 0, blocks: true };
    }
    case 'night': {
      const n = clamp01(nightMs / NIGHT_LOOK.skyInMs);
      return { warm: NIGHT_LOOK.warm * (1 - n), dark: NIGHT_LOOK.duskDark + (NIGHT_LOOK.nightDark - NIGHT_LOOK.duskDark) * n, sky: n, blocks: true };
    }
    case 'dawn': {
      const d = clamp01(phaseMs / dawnMs);
      return { warm: 0, dark: NIGHT_LOOK.nightDark * (1 - d), sky: clamp01(1 - 2 * d), blocks: false };
    }
  }
}
