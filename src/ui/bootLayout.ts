import { clamp } from './style';
import type { ViewSize } from './viewport';

/**
 * Where things stand on the start screen (M9), in CSS px, without Phaser. While the pictures are painted (`loading`):
 * the name of the game, a calm sentence and a row of {@link BOOT_DOTS} dots that fill up. Then (`ready`): upright the
 * name on top, the island in the middle and the button below; wide the island on the left, name and button on the right.
 */

/** Dots of the loading row. */
export const BOOT_DOTS = 5;

export interface BootText {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly width: number;
}

export interface BootLayout {
  readonly loading: {
    readonly title: BootText;
    readonly hint: BootText;
    readonly dots: { readonly x: number; readonly y: number; readonly gap: number; readonly radius: number };
  };
  readonly ready: {
    readonly wide: boolean;
    readonly picture: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
    readonly title: BootText;
    readonly button: { readonly x: number; readonly y: number; readonly radius: number };
    /** The sentence under the button: its size (its place follows the button and its own height). */
    readonly hint: { readonly x: number; readonly size: number; readonly width: number };
  };
}

export function bootLayout({ width, height }: ViewSize): BootLayout {
  const m = Math.min(width, height);
  const wide = width > height * 1.25;
  const titleSize = clamp(m * (wide ? 0.11 : 0.12), 34, 120);

  const loadTitle = clamp(m * 0.12, 34, 110);
  const loadHint = clamp(m * 0.045, 16, 36);
  const radius = clamp(m * 0.012, 5, 10);
  const titleY = height * 0.4;
  const hintY = titleY + loadTitle * 0.5 + loadHint * 1.3;
  const dotsY = hintY + loadHint * 0.5 + radius * 3;

  const picture = wide ? { x: 0, y: height * 0.08, w: width * 0.58, h: height * 0.88 } : { x: 0, y: height * 0.2, w: width, h: height * 0.46 };
  const column = wide ? { x: width * 0.79, w: width * 0.4 } : { x: width / 2, w: width * 0.9 };
  return {
    loading: {
      title: { x: width / 2, y: titleY, size: loadTitle, width: width * 0.9 },
      hint: { x: width / 2, y: hintY, size: loadHint, width: width * 0.9 },
      dots: { x: width / 2, y: dotsY, gap: radius * 3.6, radius },
    },
    ready: {
      wide,
      picture,
      title: { x: column.x, y: wide ? height * 0.24 : height * 0.11, size: titleSize, width: column.w },
      button: { x: column.x, y: wide ? height * 0.56 : height * 0.77, radius: clamp(m * (wide ? 0.14 : 0.13), 52, 110) },
      hint: { x: column.x, size: clamp(m * 0.055, 22, 52), width: column.w },
    },
  };
}

/** How many dots are filled when `done` of `total` pictures are painted. */
export function litDots(done: number, total: number): number {
  if (total <= 0) {
    return BOOT_DOTS;
  }
  return Math.min(BOOT_DOTS, Math.floor((Math.max(0, done) / total) * BOOT_DOTS));
}
