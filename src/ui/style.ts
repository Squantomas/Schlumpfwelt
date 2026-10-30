/**
 * Shared look of the placeholder graphics (until the style guide in M9).
 * Sizes are CSS pixels; scenes lay out in CSS pixels (see `viewport.ts`).
 */

/** Smallest tap target in CSS pixels – nothing tappable may be smaller. */
export const MIN_TAP_SIZE = 48;

/**
 * Edge length of one map tile in world pixels. Final for all later graphics
 * (houses, decoration): top-down view of a square grid, objects in a slight
 * front view that may reach up over their tile.
 */
export const TILE_SIZE = 64;

export const COLORS = {
  water: 0x8ed8f8,
  waterShallow: 0xb5e8fb,
  waterMid: 0xa1dff8,
  waterDeep: 0x7ccdf2,
  foam: 0xffffff,
  sand: 0xf7e4a9,
  sandShade: 0xe6cb83,
  grass: 0x8ad463,
  grassShade: 0x69b946,
  forestFloor: 0x7fcc5e,
  rock: 0xb4b9c4,
  rockLight: 0xd6dae2,
  rockShade: 0x8a90a0,
  ringGlow: 0xffffff,
  treeTrunk: 0x9a6a3c,
  treeCrown: 0x4fa83d,
  treeCrownLight: 0x72c95a,
  flower: 0xff86bd,
  flowerCenter: 0xffe066,
  button: 0xffc93c,
  buttonShade: 0xe9a91f,
  buttonRim: 0xffffff,
  buttonIcon: 0x8a4f12,
  textFill: 0xffffff,
  textOutline: 0x2a6f97,
  textShadow: 0x1b4a66,
} as const;

/** Local system fonts only – no web fonts from external servers. Rounded fonts first. */
export const FONT_FAMILY =
  '"Arial Rounded MT Bold", "Arial Rounded MT", "Nunito", "Varela Round", "Trebuchet MS", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** `0x2a6f97` → `"#2a6f97"` (Phaser text styles want CSS colors). */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Splits `0xrrggbb` into channels, e.g. for camera fades. */
export function rgb(color: number): [red: number, green: number, blue: number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
