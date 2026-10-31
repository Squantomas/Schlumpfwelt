import { COLORS, cssColor, cssRgba } from '../../ui/style';
import { PAD, circle, ellipse, roundedBox, type Draw } from './objectTextures';

/**
 * Placeholder pictures of the six production buildings, in the same slight
 * front view as the houses: the front edge of the footprint is {@link PAD}
 * above the bottom of the texture. Each one is easy to tell apart at a glance:
 * a wooden hut with an axe and logs, a berry bed, a pile of stone blocks, a
 * workshop with a saw, a bakery with an oven chimney, a market stall with a
 * striped awning.
 */

const css = cssColor;

function shadow(ctx: CanvasRenderingContext2D, cx: number, y: number, rx: number, ry: number): void {
  ellipse(ctx, cx, y, rx, ry, cssRgba(COLORS.treeShadow, 0.3));
}

/** A roof as a wide triangle with a lighter and a darker half. */
function roof(ctx: CanvasRenderingContext2D, cx: number, baseY: number, halfWidth: number, peakY: number, light: number, dark: number): void {
  ctx.fillStyle = css(dark);
  ctx.beginPath();
  ctx.moveTo(cx - halfWidth, baseY);
  ctx.lineTo(cx, peakY);
  ctx.lineTo(cx + halfWidth, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = css(light);
  ctx.beginPath();
  ctx.moveTo(cx - halfWidth, baseY);
  ctx.lineTo(cx, peakY);
  ctx.lineTo(cx + halfWidth * 0.16, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = css(dark);
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - halfWidth, baseY);
  ctx.lineTo(cx, peakY);
  ctx.lineTo(cx + halfWidth, baseY);
  ctx.stroke();
}

/** Horizontal planks on a wall. */
function planks(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: number, line: number): void {
  roundedBox(ctx, x, y, w, h, 5, css(base));
  ctx.strokeStyle = css(line);
  ctx.lineWidth = 2;
  for (let py = y + 14; py < y + h - 4; py += 14) {
    ctx.beginPath();
    ctx.moveTo(x + 2, py);
    ctx.lineTo(x + w - 2, py);
    ctx.stroke();
  }
}

function log(ctx: CanvasRenderingContext2D, x: number, y: number, length: number): void {
  roundedBox(ctx, x, y - 8, length, 16, 5, css(COLORS.woodDark));
  roundedBox(ctx, x, y - 8, length, 6, 4, css(COLORS.wood));
  ellipse(ctx, x + 2, y, 7, 8.4, css(COLORS.woodLight));
  ellipse(ctx, x + 2, y, 4.6, 5.6, css(COLORS.wood));
  ellipse(ctx, x + 2, y, 2, 2.6, css(COLORS.woodDark));
}

/** An axe stuck in a stump: the sign of the lumberjack. */
function axe(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.35);
  roundedBox(ctx, -2.6, -26, 5.2, 38, 2, css(COLORS.woodDark));
  ctx.fillStyle = css(COLORS.iron);
  ctx.beginPath();
  ctx.moveTo(2, -26);
  ctx.quadraticCurveTo(18, -28, 17, -12);
  ctx.quadraticCurveTo(10, -12, 2, -14);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = css(COLORS.ironLight);
  ctx.fillRect(4, -25, 10, 3);
  ctx.restore();
}

function drawLumberjackHut(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const ground = height - PAD - 8;
  shadow(ctx, cx, ground + 3, 66, 14);
  // A stack of logs to the right of the hut.
  log(ctx, cx + 24, ground - 8, 38);
  log(ctx, cx + 24, ground - 24, 38);
  log(ctx, cx + 36, ground - 40, 34);
  // The cabin: planks, a door with a round window, an axe on the wall.
  planks(ctx, cx - 56, ground - 78, 84, 78, COLORS.woodLight, COLORS.wood);
  roundedBox(ctx, cx - 56, ground - 12, 84, 12, 4, css(COLORS.woodDark));
  roundedBox(ctx, cx - 14, ground - 50, 28, 50, 8, css(COLORS.doorDark));
  roundedBox(ctx, cx - 11, ground - 47, 22, 47, 6, css(COLORS.door));
  circle(ctx, cx + 6, ground - 24, 2.4, css(COLORS.doorKnob));
  circle(ctx, cx - 38, ground - 50, 9, css(COLORS.windowFrame));
  circle(ctx, cx - 38, ground - 50, 6.4, css(COLORS.window));
  axe(ctx, cx + 14, ground - 60);
  // Roof with a little overhang.
  roof(ctx, cx - 14, ground - 74, 64, ground - 134, COLORS.roofTile, COLORS.roofTileShade);
}

function drawBerryGarden(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const ground = height - PAD - 6;
  shadow(ctx, cx, ground + 2, 62, 12);
  // A bed of soil in slight perspective, with a low fence around it.
  ctx.fillStyle = css(COLORS.soilDark);
  ctx.beginPath();
  ctx.roundRect(cx - 60, ground - 58, 120, 62, 14);
  ctx.fill();
  ctx.fillStyle = css(COLORS.soil);
  ctx.beginPath();
  ctx.roundRect(cx - 56, ground - 56, 112, 54, 12);
  ctx.fill();
  ctx.strokeStyle = css(COLORS.soilDark);
  ctx.lineWidth = 3;
  for (const y of [ground - 40, ground - 24, ground - 8]) {
    ctx.beginPath();
    ctx.moveTo(cx - 50, y);
    ctx.lineTo(cx + 50, y);
    ctx.stroke();
  }
  // Berry bushes: a back row of two, a front row of three.
  const bush = (x: number, y: number, size: number): void => {
    circle(ctx, x - size * 0.55, y - size * 0.2, size * 0.7, css(COLORS.crownDark));
    circle(ctx, x + size * 0.55, y - size * 0.2, size * 0.7, css(COLORS.crownDark));
    circle(ctx, x, y - size * 0.6, size * 0.85, css(COLORS.crownDark));
    circle(ctx, x - size * 0.55, y - size * 0.3, size * 0.64, css(COLORS.treeCrown));
    circle(ctx, x + size * 0.55, y - size * 0.3, size * 0.64, css(COLORS.treeCrown));
    circle(ctx, x, y - size * 0.7, size * 0.78, css(COLORS.treeCrown));
    for (const [dx, dy] of [[-0.7, -0.2], [0.6, -0.1], [-0.1, -0.95], [0.1, -0.25], [0.75, -0.7]] as const) {
      circle(ctx, x + dx * size, y + dy * size, size * 0.2, css(COLORS.berry));
      circle(ctx, x + dx * size - 1, y + dy * size - 1.2, size * 0.07, cssRgba(COLORS.white, 0.85));
    }
  };
  bush(cx - 28, ground - 36, 17);
  bush(cx + 28, ground - 36, 17);
  bush(cx - 36, ground - 12, 19);
  bush(cx, ground - 8, 19);
  bush(cx + 36, ground - 12, 19);
  // Fence pickets along the front.
  for (let x = cx - 56; x <= cx + 48; x += 14) {
    roundedBox(ctx, x, ground - 4, 8, 14, 3, css(COLORS.wood));
    roundedBox(ctx, x + 4.6, ground - 4, 3.4, 14, 1.6, css(COLORS.woodDark));
  }
  roundedBox(ctx, cx - 58, ground, 116, 4, 2, css(COLORS.woodDark));
}

function drawQuarry(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const ground = height - PAD - 6;
  shadow(ctx, cx, ground + 2, 64, 13);
  // A grey stone floor.
  ellipse(ctx, cx, ground - 20, 62, 28, css(COLORS.rockFloorDark));
  ellipse(ctx, cx, ground - 23, 58, 25, css(COLORS.rockFloor));
  // Stacked blocks.
  const block = (x: number, y: number, w: number, h: number): void => {
    roundedBox(ctx, x, y, w, h, 4, css(COLORS.stoneDark));
    roundedBox(ctx, x, y, w, h * 0.72, 4, css(COLORS.stone));
    roundedBox(ctx, x + 2, y + 2, w - 4, h * 0.22, 3, css(COLORS.stoneLight));
  };
  block(cx - 48, ground - 34, 38, 28);
  block(cx - 6, ground - 36, 42, 30);
  block(cx - 30, ground - 62, 40, 28);
  block(cx + 24, ground - 24, 30, 24);
  // Loose rocks in front.
  for (const [dx, dy, r] of [[-40, 0, 11], [-18, 5, 8], [34, 3, 10]] as const) {
    ellipse(ctx, cx + dx, ground + dy - 6, r * 1.2, r, css(COLORS.rockShade));
    ellipse(ctx, cx + dx - 1, ground + dy - 8, r, r * 0.8, css(COLORS.rock));
    ellipse(ctx, cx + dx - r * 0.3, ground + dy - 11, r * 0.5, r * 0.3, css(COLORS.rockLight));
  }
  // A pickaxe leaning on the blocks.
  ctx.save();
  ctx.translate(cx + 52, ground - 6);
  ctx.rotate(0.32);
  roundedBox(ctx, -2.6, -70, 5.2, 74, 2, css(COLORS.woodDark));
  ctx.strokeStyle = css(COLORS.iron);
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-20, -62);
  ctx.quadraticCurveTo(0, -78, 20, -62);
  ctx.stroke();
  ctx.restore();
}

function drawCarpenterShop(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const ground = height - PAD - 8;
  shadow(ctx, cx, ground + 3, 66, 14);
  // Walls of boards with a wide open front and a workbench inside.
  planks(ctx, cx - 56, ground - 74, 112, 74, COLORS.woodLight, COLORS.wood);
  roundedBox(ctx, cx - 38, ground - 52, 76, 52, 6, css(COLORS.doorDark));
  roundedBox(ctx, cx - 34, ground - 48, 68, 48, 5, css(COLORS.woodDark));
  // Bench with a board on it.
  roundedBox(ctx, cx - 30, ground - 22, 60, 8, 3, css(COLORS.woodLight));
  roundedBox(ctx, cx - 28, ground - 14, 5, 14, 2, css(COLORS.wood));
  roundedBox(ctx, cx + 23, ground - 14, 5, 14, 2, css(COLORS.wood));
  roundedBox(ctx, cx - 18, ground - 28, 34, 6, 2, css(COLORS.cakeSponge));
  // A saw on the wall: a blade with teeth and a handle.
  ctx.save();
  ctx.translate(cx + 46, ground - 60);
  ctx.rotate(-0.5);
  ctx.fillStyle = css(COLORS.ironLight);
  ctx.beginPath();
  ctx.moveTo(-26, 0);
  ctx.lineTo(10, -7);
  ctx.lineTo(10, 7);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = css(COLORS.iron);
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    ctx.moveTo(-24 + i * 5, 2 + i * 0.6);
    ctx.lineTo(-21 + i * 5, 7);
    ctx.lineTo(-18 + i * 5, 3 + i * 0.6);
    ctx.fill();
  }
  roundedBox(ctx, 8, -8, 16, 16, 5, css(COLORS.woodDark));
  ctx.restore();
  // Stacked boards at the side.
  for (let i = 0; i < 3; i += 1) {
    roundedBox(ctx, cx - 78, ground - 12 - i * 8, 36, 7, 2, css(i % 2 === 0 ? COLORS.woodLight : COLORS.wood));
  }
  roof(ctx, cx, ground - 70, 70, ground - 126, COLORS.roof, COLORS.roofShade);
}

function drawBakery(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const ground = height - PAD - 8;
  shadow(ctx, cx, ground + 3, 66, 14);
  // Smoke from the chimney.
  roundedBox(ctx, cx + 22, ground - 128, 20, 40, 3, css(COLORS.stoneDark));
  roundedBox(ctx, cx + 18, ground - 132, 28, 8, 3, css(COLORS.stone));
  for (const [dx, dy, r, a] of [[34, -146, 8, 0.8], [40, -160, 10, 0.6], [32, -176, 12, 0.4]] as const) {
    circle(ctx, cx + dx, ground + dy, r, cssRgba(COLORS.smoke, a));
  }
  // Cream-coloured walls, a round-topped door and a bread sign.
  roundedBox(ctx, cx - 54, ground - 76, 108, 76, 8, css(COLORS.stemShade));
  roundedBox(ctx, cx - 54, ground - 76, 100, 76, 8, css(COLORS.stem));
  ctx.fillStyle = css(COLORS.doorDark);
  ctx.beginPath();
  ctx.moveTo(cx - 15, ground);
  ctx.lineTo(cx - 15, ground - 36);
  ctx.arc(cx, ground - 36, 15, Math.PI, 0);
  ctx.lineTo(cx + 15, ground);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = css(COLORS.glow);
  ctx.beginPath();
  ctx.moveTo(cx - 11, ground);
  ctx.lineTo(cx - 11, ground - 36);
  ctx.arc(cx, ground - 36, 11, Math.PI, 0);
  ctx.lineTo(cx + 11, ground);
  ctx.closePath();
  ctx.fill();
  for (const side of [-1, 1]) {
    circle(ctx, cx + side * 36, ground - 40, 10, css(COLORS.windowFrame));
    circle(ctx, cx + side * 36, ground - 40, 7.4, css(COLORS.window));
  }
  // The loaf on a round sign above the door.
  circle(ctx, cx, ground - 66, 13, css(COLORS.woodDark));
  circle(ctx, cx, ground - 66, 10.6, css(COLORS.cakeCream));
  ellipse(ctx, cx, ground - 66, 8, 5, css(COLORS.bread));
  ellipse(ctx, cx, ground - 68, 6, 2.4, css(COLORS.breadShade));
  roof(ctx, cx, ground - 72, 68, ground - 124, COLORS.roofTile, COLORS.roofTileShade);
}

function drawMarket(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const ground = height - PAD - 8;
  shadow(ctx, cx, ground + 3, 92, 18);
  // Back wall boards and two posts.
  roundedBox(ctx, cx - 82, ground - 92, 164, 80, 6, css(COLORS.woodDark));
  roundedBox(ctx, cx - 90, ground - 118, 10, 118, 4, css(COLORS.wood));
  roundedBox(ctx, cx + 80, ground - 118, 10, 118, 4, css(COLORS.wood));
  // Crates and baskets of goods on the counter.
  roundedBox(ctx, cx - 86, ground - 42, 172, 16, 4, css(COLORS.woodLight));
  roundedBox(ctx, cx - 86, ground - 28, 172, 28, 4, css(COLORS.wood));
  for (let x = cx - 78; x < cx + 70; x += 38) {
    roundedBox(ctx, x, ground - 24, 30, 20, 3, css(COLORS.woodDark));
  }
  // A cake, a chair-like stool, a few coins and berries on the counter.
  ellipse(ctx, cx - 58, ground - 48, 17, 6, css(COLORS.white));
  roundedBox(ctx, cx - 72, ground - 66, 28, 18, 5, css(COLORS.cakeSponge));
  ellipse(ctx, cx - 58, ground - 66, 14, 4.4, css(COLORS.cakeIcing));
  circle(ctx, cx - 58, ground - 71, 4.6, css(COLORS.berry));
  for (const [dx, dy] of [[-16, 0], [-6, 3], [4, -1], [14, 2], [24, 0]] as const) {
    circle(ctx, cx + dx, ground - 52 + dy, 7, css(COLORS.berryDark));
    circle(ctx, cx + dx - 0.6, ground - 52 + dy - 0.8, 6, css(COLORS.berry));
  }
  ellipse(ctx, cx + 62, ground - 50, 16, 5, css(COLORS.coinRim));
  ellipse(ctx, cx + 62, ground - 53, 16, 5, css(COLORS.coin));
  ellipse(ctx, cx + 60, ground - 59, 14, 4.4, css(COLORS.coinRim));
  ellipse(ctx, cx + 60, ground - 62, 14, 4.4, css(COLORS.coin));
  // The striped awning with a scalloped edge.
  const awningTop = ground - 138;
  const awningBottom = ground - 100;
  const stripes = 8;
  const stripeW = 196 / stripes;
  for (let i = 0; i < stripes; i += 1) {
    const x = cx - 98 + i * stripeW;
    ctx.fillStyle = css(i % 2 === 0 ? COLORS.awningRed : COLORS.awningWhite);
    ctx.beginPath();
    ctx.moveTo(x + (i - stripes / 2) * 1.2, awningTop);
    ctx.lineTo(x + stripeW + (i + 1 - stripes / 2) * 1.2, awningTop);
    ctx.lineTo(x + stripeW + (i + 1 - stripes / 2) * 1.6, awningBottom);
    ctx.arc(x + stripeW / 2 + (i + 0.5 - stripes / 2) * 1.6, awningBottom, stripeW / 2, 0, Math.PI);
    ctx.lineTo(x + (i - stripes / 2) * 1.6, awningBottom);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = css(COLORS.mushroomCap);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 98 - 4.8, awningTop);
  ctx.lineTo(cx + 98 + 4.8, awningTop);
  ctx.stroke();
  // A little coin sign on top.
  circle(ctx, cx, awningTop - 10, 13, css(COLORS.coinRim));
  circle(ctx, cx, awningTop - 10, 10.6, css(COLORS.coin));
  circle(ctx, cx, awningTop - 10, 7, css(COLORS.coinRim));
  circle(ctx, cx, awningTop - 10, 6, css(COLORS.coin));
}

/** Drawers of the production buildings by `look.shape` (see `buildings.json`). */
export const PRODUCTION_DRAWERS: Readonly<Record<string, Draw>> = {
  lumberjackHut: drawLumberjackHut,
  berryGarden: drawBerryGarden,
  quarry: drawQuarry,
  carpenterShop: drawCarpenterShop,
  bakery: drawBakery,
  market: drawMarket,
};
