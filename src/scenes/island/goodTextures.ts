import type Phaser from 'phaser';
import { ITEM_IDS } from '../../data/goods';
import { COLORS, cssColor, cssRgba } from '../../ui/style';
import { MARKER_BUBBLE, MARKER_KEY, MARKER_SIZE } from './buildingTextures';
import { circle, ellipse, make, roundedBox } from './objectTextures';

/**
 * Placeholder pictures for coins and goods (store bar, cost labels, the "+1"
 * that floats over a building) and for the things a building needs nearby
 * (a tree, a rock), plus the round signs over buildings that have a problem.
 * Drawn with the canvas API at 2× resolution inside a 48×48 box.
 */

export const ICON_SIZE = 48;

export function goodTextureKey(id: string): string {
  return `good-${id}`;
}

/** `tree` or `rock`: what a lumberjack / quarry needs nearby. */
export function nearbyTextureKey(id: string): string {
  return `need-${id}`;
}

/** The round sign over a building: `path`, `tree`, `rock` or `good-<id>`. */
export function signTextureKey(kind: string): string {
  return kind === 'path' ? MARKER_KEY : `sign-${kind}`;
}

const css = cssColor;

/** Draws one icon centred on (cx, cy) in a box of `size` px. */
type IconDrawer = (ctx: CanvasRenderingContext2D) => void;

/** Icons are drawn in a 48×48 box around (0, 0)… (48, 48); this helper moves and scales that box. */
function placeIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, draw: IconDrawer): void {
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(size / ICON_SIZE, size / ICON_SIZE);
  draw(ctx);
  ctx.restore();
}

const GOOD_ICONS: Readonly<Record<string, IconDrawer>> = {
  coins: (ctx) => {
    ellipse(ctx, 25, 41, 17, 4.5, cssRgba(COLORS.black, 0.16));
    // Two coins, the back one a little higher.
    for (const [x, y] of [[19, 19], [27, 27]] as const) {
      circle(ctx, x, y, 15, css(COLORS.coinRim));
      circle(ctx, x, y, 12.8, css(COLORS.coin));
      circle(ctx, x, y, 9.2, css(COLORS.coinRim));
      circle(ctx, x, y, 8, css(COLORS.coin));
      ellipse(ctx, x - 4.5, y - 5, 3.2, 1.8, cssRgba(COLORS.coinShine, 0.9), -0.6);
    }
  },
  wood: (ctx) => {
    ellipse(ctx, 24, 42, 20, 4, cssRgba(COLORS.black, 0.16));
    const log = (x: number, y: number): void => {
      roundedBox(ctx, x, y - 8, 26, 16, 5, css(COLORS.woodDark));
      roundedBox(ctx, x, y - 8, 26, 6, 4, css(COLORS.wood));
      ellipse(ctx, x + 2, y, 7, 8.4, css(COLORS.woodLight));
      ellipse(ctx, x + 2, y, 4.6, 5.6, css(COLORS.wood));
      ellipse(ctx, x + 2, y, 2, 2.6, css(COLORS.woodDark));
    };
    log(6, 34);
    log(16, 34);
    log(11, 21);
  },
  stone: (ctx) => {
    ellipse(ctx, 24, 42, 19, 4, cssRgba(COLORS.black, 0.16));
    ctx.fillStyle = css(COLORS.rockShade);
    ctx.beginPath();
    ctx.moveTo(5, 38);
    ctx.lineTo(8, 21);
    ctx.lineTo(19, 11);
    ctx.lineTo(34, 13);
    ctx.lineTo(43, 26);
    ctx.lineTo(41, 38);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = css(COLORS.rock);
    ctx.beginPath();
    ctx.moveTo(8, 35);
    ctx.lineTo(10, 22);
    ctx.lineTo(19, 14);
    ctx.lineTo(32, 16);
    ctx.lineTo(38, 26);
    ctx.lineTo(36, 35);
    ctx.closePath();
    ctx.fill();
    ellipse(ctx, 20, 21, 7, 3.6, cssRgba(COLORS.rockLight, 0.9), -0.5);
    ctx.strokeStyle = css(COLORS.rockCrack);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(28, 20);
    ctx.lineTo(26, 28);
    ctx.lineTo(30, 33);
    ctx.stroke();
  },
  berries: (ctx) => {
    ellipse(ctx, 24, 42, 15, 3.6, cssRgba(COLORS.black, 0.16));
    ellipse(ctx, 29, 11, 9, 4.5, css(COLORS.stalk), -0.4);
    ctx.strokeStyle = css(COLORS.stalk);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(24, 20);
    ctx.lineTo(24, 11);
    ctx.stroke();
    for (const [x, y] of [[16, 29], [32, 29], [24, 22], [24, 35], [15, 38], [33, 38]] as const) {
      circle(ctx, x, y, 8.2, css(COLORS.berryDark));
      circle(ctx, x - 0.6, y - 0.8, 7.2, css(COLORS.berry));
      circle(ctx, x - 2.6, y - 3, 2, cssRgba(COLORS.white, 0.8));
    }
  },
  furniture: (ctx) => {
    ellipse(ctx, 24, 42, 16, 3.6, cssRgba(COLORS.black, 0.16));
    // A chair: tall back, seat, four legs.
    roundedBox(ctx, 11, 5, 5, 34, 2, css(COLORS.woodDark));
    roundedBox(ctx, 31, 22, 5, 17, 2, css(COLORS.woodDark));
    roundedBox(ctx, 11, 8, 20, 5, 2, css(COLORS.wood));
    roundedBox(ctx, 11, 17, 20, 5, 2, css(COLORS.wood));
    roundedBox(ctx, 9, 25, 29, 7, 3, css(COLORS.woodLight));
    roundedBox(ctx, 9, 29, 29, 3.4, 1.6, css(COLORS.wood));
    roundedBox(ctx, 12, 31, 4.4, 9, 2, css(COLORS.woodDark));
    roundedBox(ctx, 31, 31, 4.4, 9, 2, css(COLORS.woodDark));
  },
  cake: (ctx) => {
    ellipse(ctx, 24, 42, 19, 4, cssRgba(COLORS.black, 0.16));
    ellipse(ctx, 24, 37, 19, 6, css(COLORS.white));
    ellipse(ctx, 24, 36, 19, 5.4, css(COLORS.toolFaceShade));
    // Two tiers with icing and a berry on top.
    roundedBox(ctx, 8, 24, 32, 13, 4, css(COLORS.cakeSponge));
    roundedBox(ctx, 8, 31, 32, 3.4, 1.6, css(COLORS.breadShade));
    roundedBox(ctx, 13, 14, 22, 12, 4, css(COLORS.cakeSponge));
    ellipse(ctx, 24, 24, 17, 4, css(COLORS.cakeIcing));
    ellipse(ctx, 24, 14.4, 11.4, 3.4, css(COLORS.cakeIcing));
    for (const x of [14, 20, 27, 33]) {
      circle(ctx, x, 25, 2.2, css(COLORS.cakeIcing));
    }
    circle(ctx, 24, 10, 4.6, css(COLORS.berryDark));
    circle(ctx, 23.8, 9.6, 4, css(COLORS.berry));
    circle(ctx, 22.4, 8, 1.2, cssRgba(COLORS.white, 0.85));
  },
};

const NEARBY_ICONS: Readonly<Record<string, IconDrawer>> = {
  tree: (ctx) => {
    ellipse(ctx, 24, 43, 14, 3.4, cssRgba(COLORS.black, 0.16));
    roundedBox(ctx, 20.4, 28, 7.2, 15, 2, css(COLORS.treeTrunk));
    circle(ctx, 24, 19, 15, css(COLORS.crownDark));
    circle(ctx, 24, 18, 14, css(COLORS.treeCrown));
    circle(ctx, 19, 13, 6, css(COLORS.treeCrownLight));
    circle(ctx, 30, 22, 5, css(COLORS.crownDark));
  },
  rock: (ctx) => {
    GOOD_ICONS['stone']?.(ctx);
  },
};

/** Draws the picture of a good, coins or a "nearby" thing (`tree`, `rock`) into a canvas, centred. */
export function drawIcon(ctx: CanvasRenderingContext2D, id: string, cx: number, cy: number, size: number): void {
  const draw = GOOD_ICONS[id] ?? NEARBY_ICONS[id];
  if (draw) {
    placeIcon(ctx, cx, cy, size, draw);
  }
}

/** A friendly round sign (like the "needs a path" sign) with a picture inside. */
function drawSign(ctx: CanvasRenderingContext2D, width: number, height: number, symbol: IconDrawer | undefined, id: string): void {
  const cx = width / 2;
  const cy = MARKER_BUBBLE / 2 + 5;
  const r = MARKER_BUBBLE / 2;
  ellipse(ctx, cx, height - 3, 12, 3.2, cssRgba(COLORS.black, 0.18));
  ctx.fillStyle = css(COLORS.markerRim);
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy + r - 6);
  ctx.lineTo(cx, height - 4);
  ctx.lineTo(cx + 12, cy + r - 6);
  ctx.closePath();
  ctx.fill();
  circle(ctx, cx, cy, r, css(COLORS.markerRim));
  circle(ctx, cx, cy, r - 4.5, css(COLORS.markerFill));
  ctx.fillStyle = css(COLORS.markerFill);
  ctx.beginPath();
  ctx.moveTo(cx - 9, cy + r - 7);
  ctx.lineTo(cx, height - 11);
  ctx.lineTo(cx + 9, cy + r - 7);
  ctx.closePath();
  ctx.fill();
  if (symbol) {
    placeIcon(ctx, cx - 1, cy + 1, 40, symbol);
  } else {
    drawIcon(ctx, id, cx - 1, cy + 1, 40);
  }
  // The "!" badge at the top right, like the path sign.
  const bx = cx + r - 8;
  const by = cy - r + 8;
  circle(ctx, bx, by, 11.5, css(COLORS.white));
  circle(ctx, bx, by, 9.5, css(COLORS.markerMark));
  roundedBox(ctx, bx - 1.9, by - 6.5, 3.8, 8.5, 1.9, css(COLORS.white));
  circle(ctx, bx, by + 5.2, 2.1, css(COLORS.white));
}

/** Creates all icon and sign textures (once; later scenes reuse them). */
export function registerGoodTextures(scene: Phaser.Scene): void {
  for (const id of ITEM_IDS) {
    make(scene, goodTextureKey(id), ICON_SIZE, ICON_SIZE, (ctx) => {
      drawIcon(ctx, id, ICON_SIZE / 2, ICON_SIZE / 2, ICON_SIZE);
    });
  }
  for (const id of Object.keys(NEARBY_ICONS)) {
    make(scene, nearbyTextureKey(id), ICON_SIZE, ICON_SIZE, (ctx) => {
      drawIcon(ctx, id, ICON_SIZE / 2, ICON_SIZE / 2, ICON_SIZE);
    });
  }
  // A missing tree / rock / good: the sign shows what is needed.
  for (const id of Object.keys(NEARBY_ICONS)) {
    make(scene, signTextureKey(id), MARKER_SIZE.width, MARKER_SIZE.height, (ctx, w, h) => {
      drawSign(ctx, w, h, undefined, id);
    });
  }
  for (const id of ITEM_IDS) {
    make(scene, signTextureKey(`good-${id}`), MARKER_SIZE.width, MARKER_SIZE.height, (ctx, w, h) => {
      drawSign(ctx, w, h, undefined, id);
    });
  }
}
