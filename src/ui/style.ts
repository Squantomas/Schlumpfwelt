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
  forestFloor: 0x5aa844,
  forestFloorDark: 0x468f36,
  forestMoss: 0x86c45a,
  forestNeedle: 0x3a7a30,
  mushroomCap: 0xe65a5a,
  mushroomStem: 0xfff1d6,
  rockFloor: 0xbeb29c,
  rockFloorLight: 0xd3c9b5,
  rockFloorDark: 0x9b8f7a,
  rock: 0xa9a195,
  rockLight: 0xd3ccc0,
  rockShade: 0x827a6f,
  rockCrack: 0x6b645a,
  rockShadow: 0x3c3a30,
  white: 0xffffff,
  black: 0x000000,
  ringGlow: 0xffffff,
  ringShadow: 0x1f5a2e,
  treeShadow: 0x286419,
  crownDark: 0x3b8c30,
  trunkDark: 0x7c5230,
  blossom: 0xffb3d9,
  blossomCenter: 0xff86bd,
  sandSpeck: 0xbe9646,
  shell: 0xfff6e4,
  patchLight: 0xffffff,
  patchDark: 0x286e1e,
  treeTrunk: 0x9a6a3c,
  treeCrown: 0x4fa83d,
  treeCrownLight: 0x72c95a,
  flower: 0xff86bd,
  flowerCenter: 0xffe066,
  button: 0xffc93c,
  buttonShade: 0xe9a91f,
  buttonRim: 0xffffff,
  buttonIcon: 0x8a4f12,
  pathFill: 0xe4cf9c,
  pathRim: 0xb8975a,
  pathStone: 0xf3e6c0,
  pathStoneDark: 0xcfb57f,
  stem: 0xfff1d6,
  stemShade: 0xe6cfa3,
  door: 0x9a5f2e,
  doorDark: 0x6e4220,
  doorKnob: 0xffe066,
  window: 0xbfe6ff,
  windowFrame: 0x9a5f2e,
  wood: 0xb5833f,
  woodDark: 0x8a5f2b,
  woodLight: 0xd9a95d,
  roof: 0xc4653a,
  roofShade: 0x9c4a28,
  roofTile: 0xd8723f,
  roofTileShade: 0xb55a2e,
  coin: 0xffc93c,
  coinRim: 0xd9941a,
  coinShine: 0xfff3b0,
  berryDark: 0xb02a45,
  cakeSponge: 0xe8b46a,
  cakeIcing: 0xff9ec4,
  cakeCream: 0xfff6e4,
  bread: 0xe0a050,
  breadShade: 0xb87a30,
  soil: 0x8a6a45,
  soilDark: 0x6e5436,
  smoke: 0xeeeeee,
  awningRed: 0xe65a5a,
  awningWhite: 0xfff6e4,
  glow: 0xffb04a,
  statusBad: 0xffd9a8,
  stockChip: 0xfff6dc,
  stockChipShade: 0xd9c9a0,
  stockNumber: 0x6a4a1c,
  costMissing: 0xff6b5a,
  costEnough: 0x6a4a1c,
  progressTrack: 0xd9c9a0,
  progressFill: 0x4fc65a,
  cardFace: 0xfff6dc,
  cardRim: 0xffffff,
  radiusFill: 0xffe066,
  iron: 0x4a4f5c,
  ironLight: 0x7a8090,
  lampGlow: 0xfff2a0,
  berry: 0xe84a5f,
  stone: 0xd2d6db,
  stoneDark: 0xa4a9b0,
  stoneLight: 0xeef0f2,
  fountainWater: 0x7fd3f5,
  fountainWaterLight: 0xcdeefc,
  stalk: 0x4a9a3a,
  ghostOk: 0x5ee06a,
  ghostBad: 0xff5a5a,
  selected: 0xffe066,
  ghostOkTint: 0xc9ffc9,
  ghostBadTint: 0xffa5a5,
  demolishTint: 0xff9d9d,
  puff: 0xffffff,
  markerFill: 0xfff3c4,
  markerRim: 0xffa63c,
  markerIcon: 0x9a6a2e,
  markerMark: 0xff8a1e,
  panel: 0x2a6f97,
  toolFace: 0xfff6dc,
  toolFaceShade: 0xd9c9a0,
  toolActive: 0xffc93c,
  toolActiveRim: 0xffffff,
  confirm: 0x4fc65a,
  confirmShade: 0x2f9a3c,
  done: 0x4a9de8,
  doneShade: 0x2f78c0,
  cancel: 0xff7a6b,
  cancelShade: 0xd9503f,
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

/** Colours of the placeholder mushroom houses (`look.palette` in `buildings.json`). */
export const HOUSE_PALETTES: Readonly<Record<string, { readonly cap: number; readonly capShade: number; readonly dot: number }>> = {
  red: { cap: 0xe65a5a, capShade: 0xc23f3f, dot: 0xffffff },
  blue: { cap: 0x4f8fe0, capShade: 0x3a6cb8, dot: 0xffffff },
  yellow: { cap: 0xf6c63a, capShade: 0xd9a21a, dot: 0xffffff },
};

/** Petal colours of the meadow flowers. */
export const FLOWER_PETALS: readonly number[] = [0xff86bd, 0xffffff, 0xffe066, 0xffb3d9];

/** `0x2a6f97, 0.5` → `"rgba(42,111,151,0.5)"` (canvas fill and stroke styles). */
export function cssRgba(color: number, alpha: number): string {
  const [r, g, b] = rgb(color);
  return `rgba(${String(r)},${String(g)},${String(b)},${String(alpha)})`;
}

/** Splits `0xrrggbb` into channels, e.g. for camera fades. */
export function rgb(color: number): [red: number, green: number, blue: number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
