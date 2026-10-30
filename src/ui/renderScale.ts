/**
 * How many canvas pixels are rendered per CSS pixel.
 *
 * Follows `devicePixelRatio` so the game is sharp on Retina/HiDPI screens, but
 * is capped to keep the fill rate affordable on tablets: at most 2× and at most
 * {@link MAX_RENDER_PIXELS} canvas pixels in total.
 *
 * Pure function without Phaser or DOM access, so it can be unit-tested.
 */

/** Upper bound for the render scale (3× screens are rendered at 2×). */
export const MAX_RENDER_SCALE = 2;

/** Lower bound for the render scale (zoomed-out desktop browsers). */
export const MIN_RENDER_SCALE = 0.5;

/** Pixel budget for the whole canvas (4K UHD). */
export const MAX_RENDER_PIXELS = 3840 * 2160;

export function computeRenderScale(devicePixelRatio: number, cssWidth: number, cssHeight: number): number {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  let scale = Math.min(Math.max(ratio, MIN_RENDER_SCALE), MAX_RENDER_SCALE);

  const cssPixels = cssWidth * cssHeight;
  if (Number.isFinite(cssPixels) && cssPixels > 0) {
    scale = Math.min(scale, Math.sqrt(MAX_RENDER_PIXELS / cssPixels));
  }

  // Two decimals are plenty and avoid re-scaling on tiny size changes.
  const rounded = Math.floor(scale * 100) / 100;
  return Math.max(rounded, MIN_RENDER_SCALE);
}
