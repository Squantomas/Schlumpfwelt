import type Phaser from 'phaser';
import { BUILDING_TYPES, type BuildingType } from '../../data/buildings';
import { COLORS, HOUSE_PALETTES, FLOWER_PETALS, TILE_SIZE, cssColor, cssRgba } from '../../ui/style';
import { PAD, circle, ellipse, make, roundedBox, type Draw } from './objectTextures';
import { PRODUCTION_DRAWERS } from './productionTextures';

/**
 * Placeholder pictures for houses, decoration, paths and the little signs
 * above houses, drawn with the canvas API at 2× resolution (see
 * `objectTextures.ts`). Like trees they are in slight front view and reach up
 * over their footprint; the ground edge of the footprint is {@link PAD} below
 * the bottom of the texture.
 */


export const PUFF_KEY = 'puff';
export const MARKER_KEY = 'marker-path';
/** Logical size of the marker; its tip (bottom centre) points at the house. */
export const MARKER_SIZE = { width: 84, height: 98 } as const;
/** Bubble diameter inside the marker texture (logical px). */
export const MARKER_BUBBLE = 70;

export function buildingTextureKey(typeId: string): string {
  return `bld-${typeId}`;
}

/** Path tile pictures by neighbour mask: 1 = path to the north, 2 = east, 4 = south, 8 = west. */
export function pathTextureKey(mask: number): string {
  return `path-${String(mask)}`;
}

/** Logical size of the texture of a type. */
export function buildingTextureSize(type: BuildingType): { width: number; height: number } {
  return {
    width: type.footprint.w * TILE_SIZE + 2 * PAD,
    height: type.footprint.h * TILE_SIZE + type.look.rise + PAD,
  };
}

/** Where the footprint's front edge (bottom centre) lies in the texture, as fraction (for `setOrigin`). */
export function buildingOrigin(type: BuildingType): { x: number; y: number } {
  const { height } = buildingTextureSize(type);
  return { x: 0.5, y: (height - PAD) / height };
}

const DRAWERS: Readonly<Record<string, (type: BuildingType) => Draw>> = {
  ...Object.fromEntries(Object.entries(PRODUCTION_DRAWERS).map(([shape, draw]) => [shape, (): Draw => draw])),
  mushroomHouse: (type) => (ctx, w, h) => {
    drawMushroomHouse(ctx, w, h, type.look.palette ?? 'red');
  },
  flower: () => drawFlowers,
  bush: () => drawBush,
  fence: () => drawFence,
  bench: () => drawBench,
  lantern: () => drawLantern,
  fountain: () => drawFountain,
};

/** Creates all textures (once; later scenes reuse them). */
export function registerBuildingTextures(scene: Phaser.Scene): void {
  for (const type of BUILDING_TYPES) {
    const drawer = DRAWERS[type.look.shape];
    if (drawer) {
      const { width, height } = buildingTextureSize(type);
      make(scene, buildingTextureKey(type.id), width, height, drawer(type));
    }
  }
  for (let mask = 0; mask < 16; mask += 1) {
    make(scene, pathTextureKey(mask), TILE_SIZE, TILE_SIZE, (ctx) => {
      drawPathTile(ctx, mask);
    });
  }
  make(scene, MARKER_KEY, MARKER_SIZE.width, MARKER_SIZE.height, drawMarker);
  make(scene, PUFF_KEY, 64, 64, drawPuff);
}

const css = cssColor;

function softShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ellipse(ctx, x, y, rx, ry, cssRgba(COLORS.treeShadow, 0.3));
}

function drawMushroomHouse(ctx: CanvasRenderingContext2D, width: number, height: number, paletteName: string): void {
  const palette = HOUSE_PALETTES[paletteName] ?? HOUSE_PALETTES['red'];
  if (!palette) {
    return;
  }
  const cx = width / 2;
  const ground = height - PAD - 6;
  softShadow(ctx, cx, ground + 2, 58, 13);

  // Stem with a darker side and a little round belly.
  const stemW = 66;
  roundedBox(ctx, cx - stemW / 2, 96, stemW, ground - 96, 18, css(COLORS.stem));
  roundedBox(ctx, cx + stemW * 0.12, 98, stemW * 0.38, ground - 100, 14, css(COLORS.stemShade));
  roundedBox(ctx, cx - stemW / 2 - 3, ground - 14, stemW + 6, 14, 7, css(COLORS.stemShade));

  // Windows.
  for (const side of [-1, 1]) {
    circle(ctx, cx + side * 21, 132, 8.5, css(COLORS.windowFrame));
    circle(ctx, cx + side * 21, 132, 6, css(COLORS.window));
    ctx.fillStyle = cssRgba(COLORS.white, 0.7);
    ctx.fillRect(cx + side * 21 - 0.7, 126, 1.4, 12);
    ctx.fillRect(cx + side * 21 - 6, 131.3, 12, 1.4);
  }

  // Door in front.
  const doorW = 24;
  const doorH = 38;
  ctx.fillStyle = css(COLORS.doorDark);
  ctx.beginPath();
  ctx.moveTo(cx - doorW / 2 - 2.5, ground);
  ctx.lineTo(cx - doorW / 2 - 2.5, ground - doorH + doorW / 2);
  ctx.arc(cx, ground - doorH + doorW / 2, doorW / 2 + 2.5, Math.PI, 0);
  ctx.lineTo(cx + doorW / 2 + 2.5, ground);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = css(COLORS.door);
  ctx.beginPath();
  ctx.moveTo(cx - doorW / 2, ground);
  ctx.lineTo(cx - doorW / 2, ground - doorH + doorW / 2);
  ctx.arc(cx, ground - doorH + doorW / 2, doorW / 2, Math.PI, 0);
  ctx.lineTo(cx + doorW / 2, ground);
  ctx.closePath();
  ctx.fill();
  circle(ctx, cx + 6, ground - 15, 2.4, css(COLORS.doorKnob));

  // Cap: dark underside, big dome, light spot, dots.
  const capY = 86;
  ellipse(ctx, cx, capY + 8, 70, 15, css(palette.capShade));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, capY + 8);
  ctx.clip();
  ellipse(ctx, cx, capY + 4, 70, 66, css(palette.capShade));
  ellipse(ctx, cx - 2, capY + 1, 67, 62, css(palette.cap));
  ellipse(ctx, cx - 26, capY - 36, 20, 11, cssRgba(COLORS.white, 0.28), -0.5);
  const dots: readonly [number, number, number][] = [
    // [dx, y, radius]
    [-38, 70, 9],
    [-10, 38, 11],
    [22, 58, 10],
    [44, 78, 7],
    [-6, 72, 6],
    [-52, 86, 5],
    [36, 36, 6],
  ];
  for (const [dx, y, r] of dots) {
    ellipse(ctx, cx + dx, y, r, r * 0.86, css(palette.dot));
  }
  ctx.restore();
  // Front lip of the cap.
  ctx.strokeStyle = css(palette.capShade);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(cx, capY + 8, 70, 15, 0, 0.05 * Math.PI, 0.95 * Math.PI);
  ctx.stroke();
}

function baseY(height: number): number {
  return height - PAD - 12;
}

function drawFlowers(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const base = baseY(height);
  softShadow(ctx, cx, base + 3, 24, 7);
  const flowers: readonly [number, number, number, number][] = [
    // [dx, stem height, petal colour index, petal size]
    [-14, 22, 0, 6.5],
    [4, 32, 1, 7.5],
    [17, 18, 2, 6],
  ];
  for (const [dx, stem, colour, size] of flowers) {
    const x = cx + dx;
    ctx.strokeStyle = css(COLORS.stalk);
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, base + 2);
    ctx.lineTo(x, base - stem);
    ctx.stroke();
    ellipse(ctx, x + 4, base - stem * 0.45, 5, 2.4, css(COLORS.stalk), -0.5);
    const petal = css(FLOWER_PETALS[colour] ?? COLORS.flower);
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      circle(ctx, x + Math.cos(angle) * size, base - stem + Math.sin(angle) * size, size * 0.75, petal);
    }
    circle(ctx, x, base - stem, size * 0.62, css(COLORS.flowerCenter));
  }
}

function drawBush(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const base = baseY(height);
  softShadow(ctx, cx, base + 3, 29, 8);
  circle(ctx, cx - 14, base - 10, 14, css(COLORS.crownDark));
  circle(ctx, cx + 14, base - 10, 14, css(COLORS.crownDark));
  circle(ctx, cx, base - 17, 18, css(COLORS.crownDark));
  circle(ctx, cx - 14, base - 12, 13, css(COLORS.treeCrown));
  circle(ctx, cx + 14, base - 12, 13, css(COLORS.treeCrown));
  circle(ctx, cx, base - 20, 17, css(COLORS.treeCrown));
  circle(ctx, cx - 6, base - 25, 8, css(COLORS.treeCrownLight));
  for (const [dx, dy] of [[-16, -8], [9, -10], [-2, -28], [20, -17]] as const) {
    circle(ctx, cx + dx, base + dy, 3.4, css(COLORS.berry));
    circle(ctx, cx + dx - 1, base + dy - 1, 1, cssRgba(COLORS.white, 0.8));
  }
}

function drawFence(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const base = baseY(height);
  softShadow(ctx, cx, base + 3, 30, 6);
  // Two rails behind the pickets.
  roundedBox(ctx, cx - 31, base - 20, 62, 5, 2.5, css(COLORS.woodDark));
  roundedBox(ctx, cx - 31, base - 9, 62, 5, 2.5, css(COLORS.woodDark));
  for (const dx of [-24, -8, 8, 24]) {
    const x = cx + dx - 5;
    ctx.fillStyle = css(COLORS.wood);
    ctx.beginPath();
    ctx.moveTo(x, base + 1);
    ctx.lineTo(x, base - 28);
    ctx.lineTo(x + 5, base - 34);
    ctx.lineTo(x + 10, base - 28);
    ctx.lineTo(x + 10, base + 1);
    ctx.closePath();
    ctx.fill();
    roundedBox(ctx, x + 6, base - 27, 4, 28, 2, css(COLORS.woodDark));
    roundedBox(ctx, x + 1.5, base - 26, 2.5, 24, 1.2, css(COLORS.woodLight));
  }
}

function drawBench(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const base = baseY(height);
  softShadow(ctx, cx, base + 3, 30, 7);
  // Backrest, legs, seat.
  roundedBox(ctx, cx - 27, base - 31, 54, 5, 2.5, css(COLORS.woodDark));
  roundedBox(ctx, cx - 27, base - 23, 54, 5, 2.5, css(COLORS.wood));
  for (const dx of [-24, 20]) {
    roundedBox(ctx, cx + dx, base - 14, 5, 15, 2, css(COLORS.woodDark));
  }
  roundedBox(ctx, cx - 30, base - 17, 60, 8, 4, css(COLORS.woodLight));
  roundedBox(ctx, cx - 30, base - 11, 60, 4, 2, css(COLORS.wood));
}

function drawLantern(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const base = baseY(height);
  softShadow(ctx, cx, base + 3, 14, 5);
  circle(ctx, cx, base - 56, 26, cssRgba(COLORS.lampGlow, 0.28));
  circle(ctx, cx, base - 56, 17, cssRgba(COLORS.lampGlow, 0.3));
  roundedBox(ctx, cx - 7, base - 3, 14, 6, 3, css(COLORS.iron));
  roundedBox(ctx, cx - 2.5, base - 46, 5, 46, 2, css(COLORS.iron));
  roundedBox(ctx, cx - 10, base - 66, 20, 22, 5, css(COLORS.iron));
  roundedBox(ctx, cx - 7, base - 63, 14, 16, 4, css(COLORS.lampGlow));
  ctx.fillStyle = css(COLORS.iron);
  ctx.beginPath();
  ctx.moveTo(cx - 13, base - 65);
  ctx.lineTo(cx, base - 76);
  ctx.lineTo(cx + 13, base - 65);
  ctx.closePath();
  ctx.fill();
}

function drawFountain(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const ground = height - PAD - 10;
  softShadow(ctx, cx, ground + 2, 60, 14);
  // Basin: stone rim, water inside.
  ellipse(ctx, cx, ground - 20, 58, 30, css(COLORS.stoneDark));
  ellipse(ctx, cx, ground - 27, 58, 28, css(COLORS.stone));
  ellipse(ctx, cx, ground - 28, 47, 21, css(COLORS.stoneDark));
  ellipse(ctx, cx, ground - 26, 45, 19, css(COLORS.fountainWater));
  ellipse(ctx, cx - 14, ground - 24, 14, 5, cssRgba(COLORS.fountainWaterLight, 0.8), -0.15);
  // Column with an upper bowl.
  roundedBox(ctx, cx - 7, ground - 62, 14, 40, 5, css(COLORS.stone));
  roundedBox(ctx, cx + 1, ground - 62, 6, 40, 3, css(COLORS.stoneDark));
  ellipse(ctx, cx, ground - 64, 23, 9, css(COLORS.stoneDark));
  ellipse(ctx, cx, ground - 67, 23, 9, css(COLORS.stone));
  ellipse(ctx, cx, ground - 67, 17, 6, css(COLORS.fountainWater));
  // Jets falling into the basin.
  ctx.strokeStyle = css(COLORS.fountainWaterLight);
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx, ground - 74);
    ctx.quadraticCurveTo(cx + side * 22, ground - 84, cx + side * 32, ground - 40);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx, ground - 74);
  ctx.lineTo(cx, ground - 90);
  ctx.stroke();
  circle(ctx, cx, ground - 92, 3.4, css(COLORS.fountainWaterLight));
  for (const side of [-1, 1]) {
    ellipse(ctx, cx + side * 32, ground - 38, 7, 2.6, cssRgba(COLORS.white, 0.75));
  }
}

/**
 * One path tile that joins its neighbours: a rounded middle plus an arm to
 * every side that has a path (mask bits 1 north, 2 east, 4 south, 8 west).
 */
function drawPathTile(ctx: CanvasRenderingContext2D, mask: number): void {
  const c = TILE_SIZE / 2;
  const shape = (half: number, color: string, radius: number): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(c - half, c - half, half * 2, half * 2, radius);
    ctx.fill();
    if (mask & 1) ctx.fillRect(c - half, 0, half * 2, c);
    if (mask & 2) ctx.fillRect(c, c - half, c, half * 2);
    if (mask & 4) ctx.fillRect(c - half, c, half * 2, c);
    if (mask & 8) ctx.fillRect(0, c - half, c, half * 2);
  };
  shape(23, css(COLORS.pathRim), 13);
  shape(20, css(COLORS.pathFill), 11);
  // Pebbles: a fixed pattern, so neighbouring tiles look alike.
  const stones: readonly [number, number, number][] = [
    [-9, -8, 3.4],
    [8, -11, 2.6],
    [10, 7, 3.6],
    [-8, 9, 2.8],
    [1, 0, 3],
  ];
  for (const [dx, dy, r] of stones) {
    ellipse(ctx, c + dx, c + dy, r * 1.25, r, css(COLORS.pathStone));
    ellipse(ctx, c + dx + 0.8, c + dy + 1.2, r * 0.9, r * 0.5, cssRgba(COLORS.pathStoneDark, 0.7));
  }
  const arm = (bit: number, dx: number, dy: number): void => {
    if (mask & bit) {
      ellipse(ctx, c + dx * 24, c + dy * 24, 3.4, 2.7, css(COLORS.pathStone));
      ellipse(ctx, c + dx * 24 + 6 * dy, c + dy * 24 + 6 * dx, 2.4, 2, css(COLORS.pathStoneDark));
    }
  };
  arm(1, 0, -1);
  arm(2, 1, 0);
  arm(4, 0, 1);
  arm(8, -1, 0);
}

/** A friendly speech bubble with a crossed-out little road – not an alarm. */
function drawMarker(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const cy = MARKER_BUBBLE / 2 + 5;
  const r = MARKER_BUBBLE / 2;
  ellipse(ctx, cx, height - 3, 12, 3.2, cssRgba(COLORS.black, 0.18));
  // Tail.
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

  // A little road in perspective, wide at the bottom – crossed out: "no path here". Readable without reading.
  const k = MARKER_BUBBLE / 60;
  ctx.fillStyle = css(COLORS.markerIcon);
  ctx.beginPath();
  ctx.moveTo(cx - 5 * k, cy - 20 * k);
  ctx.lineTo(cx + 5 * k, cy - 20 * k);
  ctx.lineTo(cx + 19 * k, cy + 21 * k);
  ctx.lineTo(cx - 19 * k, cy + 21 * k);
  ctx.closePath();
  ctx.fill();
  for (const [y, w, h] of [[-12, 2, 5], [-2, 2.8, 6], [10, 3.6, 8]] as const) {
    roundedBox(ctx, cx - (w * k) / 2, cy + y * k, w * k, h * k, 1, css(COLORS.markerFill));
  }
  // The red slash over the road (with a light edge so it stands out on the brown).
  ctx.lineCap = 'round';
  ctx.strokeStyle = css(COLORS.white);
  ctx.lineWidth = 11 * k;
  ctx.beginPath();
  ctx.moveTo(cx - 20 * k, cy - 21 * k);
  ctx.lineTo(cx + 20 * k, cy + 21 * k);
  ctx.stroke();
  ctx.strokeStyle = css(COLORS.cancel);
  ctx.lineWidth = 7 * k;
  ctx.stroke();
}

function drawPuff(ctx: CanvasRenderingContext2D, width: number): void {
  const c = width / 2;
  const gradient = ctx.createRadialGradient(c, c, 2, c, c, c - 2);
  gradient.addColorStop(0, cssRgba(COLORS.puff, 0.95));
  gradient.addColorStop(0.6, cssRgba(COLORS.puff, 0.7));
  gradient.addColorStop(1, cssRgba(COLORS.puff, 0));
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.fill();
}
