import type Phaser from 'phaser';
import { COLORS, cssColor, cssRgba } from '../../ui/style';

/**
 * Placeholder textures for the things that stand on the ground, drawn with
 * the canvas API at {@link TEXTURE_SCALE}× resolution (sprites show them at
 * half size, so they stay sharp when zoomed in). Objects use a slight front
 * view and reach up over their tile; the origin of every sprite is the point
 * where it touches the ground.
 */

/** Texture pixels per world pixel. */
export const TEXTURE_SCALE = 2;

export const TREE_KEYS = ['tree-round', 'tree-pine', 'tree-blossom'] as const;
export const ROCK_KEYS = ['rock-big', 'rock-pair', 'rock-small'] as const;
export const GLINT_KEY = 'water-glint';
export const RING_KEY = 'tap-ring';
/** Logical size of the ring texture and the share of it that the ring's outer edge covers. */
export const RING_SIZE = 128;
export const RING_OUTER_FRACTION = 0.89;

/** Where the object touches the ground, as fraction of the texture (for `setOrigin`). */
export const OBJECT_ORIGIN = { tree: { x: 0.5, y: 0.92 }, rock: { x: 0.5, y: 0.86 } } as const;

/** Free space around the footprint in the texture of a building (logical px): room for the shadow. */
export const PAD = 8;

export type Draw = (ctx: CanvasRenderingContext2D, width: number, height: number) => void;

/** Creates all object textures (once; later scenes reuse them). */
export function registerIslandTextures(scene: Phaser.Scene): void {
  make(scene, TREE_KEYS[0], 84, 108, drawRoundTree);
  make(scene, TREE_KEYS[1], 72, 120, drawPineTree);
  make(scene, TREE_KEYS[2], 84, 104, drawBlossomTree);
  make(scene, ROCK_KEYS[0], 96, 78, drawBigRock);
  make(scene, ROCK_KEYS[1], 100, 66, drawRockPair);
  make(scene, ROCK_KEYS[2], 72, 58, drawSmallRock);
  make(scene, GLINT_KEY, 28, 12, drawGlint);
  make(scene, RING_KEY, RING_SIZE, RING_SIZE, drawRing);
}

export function make(scene: Phaser.Scene, key: string, width: number, height: number, draw: Draw): void {
  if (scene.textures.exists(key)) {
    return;
  }
  const texture = scene.textures.createCanvas(key, width * TEXTURE_SCALE, height * TEXTURE_SCALE);
  if (!texture) {
    return;
  }
  const ctx = texture.getContext();
  ctx.scale(TEXTURE_SCALE, TEXTURE_SCALE);
  draw(ctx, width, height);
  texture.refresh();
}

export function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

export function ellipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
  rotation = 0,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
  ctx.fill();
}

export function roundedBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

const SHADOW = cssRgba(COLORS.treeShadow, 0.3);
const ROCK_SHADOW = cssRgba(COLORS.rockShadow, 0.35);
const CROWN = cssColor(COLORS.treeCrown);
const CROWN_LIGHT = cssColor(COLORS.treeCrownLight);
const CROWN_DARK = cssColor(COLORS.crownDark);
const TRUNK = cssColor(COLORS.treeTrunk);
const TRUNK_DARK = cssColor(COLORS.trunkDark);

/** Trunk standing at the bottom centre; the texture's ground point is 92 % down. */
function trunk(ctx: CanvasRenderingContext2D, cx: number, groundY: number, width: number, height: number): void {
  roundedBox(ctx, cx - width / 2, groundY - height, width, height, width * 0.3, TRUNK);
  roundedBox(ctx, cx + width * 0.1, groundY - height + 2, width * 0.4, height - 2, width * 0.2, TRUNK_DARK);
}

function drawRoundTree(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const ground = height * 0.92;
  ellipse(ctx, cx, ground - 1, 27, 8, SHADOW);
  trunk(ctx, cx, ground, 12, 38);
  // Dark base blobs, then lighter blobs a little higher: gives the crown volume.
  circle(ctx, cx - 17, 56, 21, CROWN_DARK);
  circle(ctx, cx + 17, 56, 21, CROWN_DARK);
  circle(ctx, cx, 43, 29, CROWN_DARK);
  circle(ctx, cx - 17, 53, 20, CROWN);
  circle(ctx, cx + 17, 53, 20, CROWN);
  circle(ctx, cx, 39, 28, CROWN);
  circle(ctx, cx - 9, 28, 13, CROWN_LIGHT);
  circle(ctx, cx - 20, 48, 7, CROWN_LIGHT);
}

function drawPineTree(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const ground = height * 0.92;
  ellipse(ctx, cx, ground - 1, 22, 7, SHADOW);
  trunk(ctx, cx, ground, 10, 26);
  const tiers: readonly [number, number, number][] = [
    // [center y, half width, height]
    [80, 30, 36],
    [58, 25, 34],
    [37, 19, 32],
    [17, 12, 26],
  ];
  for (const [y, half, h] of tiers) {
    for (const [color, shift] of [
      [CROWN_DARK, 2],
      [CROWN, 0],
    ] as const) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx, y - h / 2 - shift);
      ctx.quadraticCurveTo(cx + half * 0.7, y + h * 0.1, cx + half, y + h / 2 + shift);
      ctx.quadraticCurveTo(cx, y + h / 2 + 6 + shift, cx - half, y + h / 2 + shift);
      ctx.quadraticCurveTo(cx - half * 0.7, y + h * 0.1, cx, y - h / 2 - shift);
      ctx.closePath();
      ctx.fill();
    }
    ellipse(ctx, cx - half * 0.3, y - h * 0.1, half * 0.22, h * 0.2, CROWN_LIGHT, -0.5);
  }
}

function drawBlossomTree(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const ground = height * 0.92;
  ellipse(ctx, cx, ground - 1, 25, 7.5, SHADOW);
  trunk(ctx, cx, ground, 11, 34);
  circle(ctx, cx - 16, 54, 19, CROWN_DARK);
  circle(ctx, cx + 16, 54, 19, CROWN_DARK);
  circle(ctx, cx, 40, 26, CROWN_DARK);
  circle(ctx, cx - 16, 51, 18, CROWN_LIGHT);
  circle(ctx, cx + 16, 51, 18, CROWN_LIGHT);
  circle(ctx, cx, 37, 25, CROWN_LIGHT);
  const blossoms: readonly [number, number][] = [
    [-14, 30],
    [4, 22],
    [18, 38],
    [-22, 50],
    [10, 54],
    [-4, 44],
    [24, 54],
    [-10, 62],
  ];
  for (const [dx, dy] of blossoms) {
    circle(ctx, cx + dx, dy, 4.2, cssColor(COLORS.blossom));
    circle(ctx, cx + dx, dy, 1.8, cssColor(COLORS.blossomCenter));
  }
}

/** One big boulder with a smaller one beside it. */
function drawBigRock(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const ground = height * 0.86;
  ellipse(ctx, cx + 2, ground - 1, 40, 11, ROCK_SHADOW);
  boulder(ctx, cx - 8, ground - 20, 33, 27);
  boulder(ctx, cx + 22, ground - 10, 19, 15);
}

/** Two similar boulders next to each other. */
function drawRockPair(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const ground = height * 0.86;
  ellipse(ctx, cx, ground - 1, 44, 10, ROCK_SHADOW);
  boulder(ctx, cx - 16, ground - 15, 25, 20);
  boulder(ctx, cx + 20, ground - 12, 22, 17);
  boulder(ctx, cx + 2, ground - 5, 11, 8);
}

function drawSmallRock(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const ground = height * 0.86;
  ellipse(ctx, cx, ground - 1, 30, 8, ROCK_SHADOW);
  boulder(ctx, cx - 4, ground - 14, 24, 19);
  boulder(ctx, cx + 18, ground - 6, 11, 8);
}

/** A rounded boulder centred at (x, y) with half sizes rx/ry: shadowed underside, lit top. */
function boulder(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number): void {
  ellipse(ctx, x, y + ry * 0.12, rx, ry, cssColor(COLORS.rockShade));
  ellipse(ctx, x, y - ry * 0.04, rx * 0.97, ry * 0.9, cssColor(COLORS.rock));
  ellipse(ctx, x - rx * 0.3, y - ry * 0.42, rx * 0.42, ry * 0.3, cssColor(COLORS.rockLight), -0.4);
  ctx.strokeStyle = cssRgba(COLORS.rockCrack, 0.6);
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + rx * 0.1, y - ry * 0.1);
  ctx.lineTo(x + rx * 0.35, y + ry * 0.3);
  ctx.lineTo(x + rx * 0.2, y + ry * 0.55);
  ctx.stroke();
}

function drawGlint(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ellipse(ctx, width / 2, height / 2, width * 0.42, height * 0.18, cssRgba(COLORS.foam, 0.9));
  ellipse(ctx, width / 2, height / 2, width * 0.5 - 1, height * 0.3, cssRgba(COLORS.foam, 0.25));
}

/** Soft but clearly visible ring: a dark halo for contrast on light ground, then thick white lines. */
function drawRing(ctx: CanvasRenderingContext2D, width: number): void {
  const c = width / 2;
  const radius = c - 18;
  const lines: readonly [number, number, number, number][] = [
    // [color, line width, alpha, y shift]
    [COLORS.ringShadow, 22, 0.28, 2],
    [COLORS.ringGlow, 20, 0.35, 0],
    [COLORS.ringGlow, 12, 0.7, 0],
    [COLORS.ringGlow, 7, 1, 0],
  ];
  for (const [color, lineWidth, alpha, shift] of lines) {
    ctx.strokeStyle = cssRgba(color, alpha);
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(c, c + shift, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}
