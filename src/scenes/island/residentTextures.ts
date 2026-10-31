import type Phaser from 'phaser';
import { HAT_IDS } from '../../data/residents';
import { COLORS, HAT_COLORS, cssColor, cssRgba } from '../../ui/style';
import { circle, ellipse, make, roundedBox } from './objectTextures';

/**
 * Placeholder pictures of the residents (M6): a small, round gnome with warm
 * skin, a green tunic and a pointed hat with a pompom – one texture per hat
 * colour – and the little sailing boat that brings new residents. Drawn with
 * the canvas API like the other placeholders (real graphics come in M8). A
 * resident is about half a tile wide; the origin of the sprite is the point
 * between the feet.
 */

/** Logical size of a resident texture (world px). */
export const RESIDENT_SIZE = { width: 40, height: 62 } as const;
/** Where the feet touch the ground, as fraction of the texture (for `setOrigin`). */
export const RESIDENT_ORIGIN = { x: 0.5, y: 57 / 62 } as const;
/** How far above the feet the middle of the body is (world px): the centre of the hit area and of the ring. */
export const RESIDENT_BODY_Y = 22;
/** Above the head: where the carried good is drawn (world px above the feet). */
export const RESIDENT_CARRY_Y = 60;

export const BOAT_SIZE = { width: 84, height: 56 } as const;
/** The water line of the boat (fraction of the texture height): the origin of the boat sprite. */
export const BOAT_ORIGIN = { x: 0.5, y: 40 / 56 } as const;
/** Where the passenger stands in the boat: this many world px above the water line. */
export const BOAT_SEAT_Y = 6;

export function residentTextureKey(hat: number): string {
  return `resident-${HAT_IDS[hat] ?? HAT_IDS[0] ?? 'red'}`;
}

/** The boat in two parts, so the passenger stands between them: mast and sail behind, the hull in front. */
export const BOAT_BACK_KEY = 'resident-boat-back';
export const BOAT_FRONT_KEY = 'resident-boat-front';
export const RESIDENT_RING_KEY = 'resident-ring';

const css = cssColor;

/** Creates the textures (once; later scenes reuse them). */
export function registerResidentTextures(scene: Phaser.Scene): void {
  HAT_IDS.forEach((id, index) => {
    make(scene, residentTextureKey(index), RESIDENT_SIZE.width, RESIDENT_SIZE.height, (ctx) => {
      drawResident(ctx, HAT_COLORS[id] ?? { hat: COLORS.cancel, shade: COLORS.cancelShade }, true);
    });
  });
  make(scene, BOAT_BACK_KEY, BOAT_SIZE.width, BOAT_SIZE.height, (ctx) => {
    drawBoatBack(ctx, BOAT_SIZE.width / 2, 40);
  });
  make(scene, BOAT_FRONT_KEY, BOAT_SIZE.width, BOAT_SIZE.height, (ctx) => {
    drawBoatFront(ctx, BOAT_SIZE.width / 2, 40);
  });
  make(scene, RESIDENT_RING_KEY, 64, 32, (ctx) => {
    ctx.strokeStyle = cssRgba(COLORS.residentRing, 0.95);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(32, 16, 26, 11, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = cssRgba(COLORS.white, 0.8);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(32, 16, 21, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/**
 * One resident, feet at (20, 57) of a 40 × 62 picture. `shadow`: with the
 * soft shadow on the ground (not in the boat).
 */
export function drawResident(ctx: CanvasRenderingContext2D, hat: { readonly hat: number; readonly shade: number }, shadow: boolean, ox = 0, oy = 0): void {
  ctx.save();
  ctx.translate(ox, oy);
  const cx = 20;
  const foot = 57;
  if (shadow) {
    ellipse(ctx, cx, foot, 12, 4, cssRgba(COLORS.residentShadow, 0.32));
  }
  // Legs and shoes.
  roundedBox(ctx, cx - 8, foot - 12, 7, 9, 3, css(COLORS.trousers));
  roundedBox(ctx, cx + 1, foot - 12, 7, 9, 3, css(COLORS.trousers));
  ellipse(ctx, cx - 5, foot - 2, 5, 3, css(COLORS.shoe));
  ellipse(ctx, cx + 5, foot - 2, 5, 3, css(COLORS.shoe));
  // A round tunic with a darker side.
  ctx.fillStyle = css(COLORS.tunic);
  ctx.beginPath();
  ctx.moveTo(cx - 8, foot - 27);
  ctx.quadraticCurveTo(cx - 13, foot - 14, cx - 11, foot - 10);
  ctx.lineTo(cx + 11, foot - 10);
  ctx.quadraticCurveTo(cx + 13, foot - 14, cx + 8, foot - 27);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = css(COLORS.tunicShade);
  ctx.beginPath();
  ctx.moveTo(cx + 3, foot - 27);
  ctx.lineTo(cx + 8, foot - 27);
  ctx.quadraticCurveTo(cx + 13, foot - 14, cx + 11, foot - 10);
  ctx.lineTo(cx + 5, foot - 10);
  ctx.closePath();
  ctx.fill();
  roundedBox(ctx, cx - 11, foot - 13, 22, 3, 1.5, css(COLORS.trousers));
  // Hands.
  circle(ctx, cx - 12, foot - 15, 3.2, css(COLORS.skin));
  circle(ctx, cx + 12, foot - 15, 3.2, css(COLORS.skin));
  // Head with ears.
  const headY = foot - 35;
  circle(ctx, cx - 10, headY + 1, 2.6, css(COLORS.skinShade));
  circle(ctx, cx + 10, headY + 1, 2.6, css(COLORS.skinShade));
  circle(ctx, cx, headY, 10.5, css(COLORS.skin));
  // Face: eyes, cheeks, nose, smile.
  circle(ctx, cx - 4, headY + 1, 1.7, css(COLORS.eye));
  circle(ctx, cx + 4, headY + 1, 1.7, css(COLORS.eye));
  circle(ctx, cx - 3.4, headY + 0.4, 0.6, css(COLORS.white));
  circle(ctx, cx + 4.6, headY + 0.4, 0.6, css(COLORS.white));
  ellipse(ctx, cx - 6.5, headY + 4.5, 2.4, 1.5, cssRgba(COLORS.cheek, 0.7));
  ellipse(ctx, cx + 6.5, headY + 4.5, 2.4, 1.5, cssRgba(COLORS.cheek, 0.7));
  circle(ctx, cx, headY + 3.6, 1.9, css(COLORS.skinShade));
  ctx.strokeStyle = css(COLORS.eye);
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, headY + 5, 3, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  // The pointed hat: a cone over the head whose tip falls to the side, with a band and a pompom.
  const brim = headY - 3;
  ctx.fillStyle = css(hat.hat);
  ctx.beginPath();
  ctx.moveTo(cx - 11.5, brim + 1);
  ctx.quadraticCurveTo(cx - 9, brim - 14, cx + 3, brim - 20);
  ctx.quadraticCurveTo(cx + 11, brim - 23, cx + 15, brim - 14);
  ctx.quadraticCurveTo(cx + 10, brim - 15, cx + 8, brim - 11);
  ctx.quadraticCurveTo(cx + 11, brim - 5, cx + 11.5, brim + 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = css(hat.shade);
  ctx.beginPath();
  ctx.moveTo(cx + 3, brim - 11);
  ctx.quadraticCurveTo(cx + 9, brim - 6, cx + 11.5, brim + 1);
  ctx.lineTo(cx + 5, brim + 1);
  ctx.quadraticCurveTo(cx + 4, brim - 5, cx + 3, brim - 11);
  ctx.closePath();
  ctx.fill();
  roundedBox(ctx, cx - 12.5, brim - 1, 25, 5, 2.5, css(hat.shade));
  circle(ctx, cx + 15, brim - 13, 3.2, css(COLORS.pompom));
  ctx.restore();
}

/** The back of the little sailing boat (ripples, mast and sail), water line at (cx, waterY). */
export function drawBoatBack(ctx: CanvasRenderingContext2D, cx: number, waterY: number): void {
  // Ripples.
  ellipse(ctx, cx, waterY + 4, 38, 6, cssRgba(COLORS.wake, 0.35));
  // Mast and sail behind the passenger.
  roundedBox(ctx, cx + 9, waterY - 38, 3, 36, 1.5, css(COLORS.mast));
  ctx.fillStyle = css(COLORS.sail);
  ctx.beginPath();
  ctx.moveTo(cx + 13, waterY - 37);
  ctx.quadraticCurveTo(cx + 34, waterY - 22, cx + 30, waterY - 8);
  ctx.lineTo(cx + 13, waterY - 8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = css(COLORS.sailShade);
  ctx.beginPath();
  ctx.moveTo(cx + 13, waterY - 20);
  ctx.quadraticCurveTo(cx + 25, waterY - 14, cx + 30, waterY - 8);
  ctx.lineTo(cx + 13, waterY - 8);
  ctx.closePath();
  ctx.fill();
}

/** The hull of the boat (in front of the passenger), water line at (cx, waterY). */
export function drawBoatFront(ctx: CanvasRenderingContext2D, cx: number, waterY: number): void {
  // Hull: a wide bowl with a light rim.
  ctx.fillStyle = css(COLORS.boatHull);
  ctx.beginPath();
  ctx.moveTo(cx - 34, waterY - 12);
  ctx.lineTo(cx + 34, waterY - 12);
  ctx.quadraticCurveTo(cx + 30, waterY + 4, cx + 18, waterY + 5);
  ctx.lineTo(cx - 18, waterY + 5);
  ctx.quadraticCurveTo(cx - 30, waterY + 4, cx - 34, waterY - 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = css(COLORS.boatHullShade);
  ctx.beginPath();
  ctx.moveTo(cx - 30, waterY - 2);
  ctx.lineTo(cx + 30, waterY - 2);
  ctx.quadraticCurveTo(cx + 26, waterY + 4, cx + 18, waterY + 5);
  ctx.lineTo(cx - 18, waterY + 5);
  ctx.quadraticCurveTo(cx - 26, waterY + 4, cx - 30, waterY - 2);
  ctx.closePath();
  ctx.fill();
  roundedBox(ctx, cx - 36, waterY - 15, 72, 5, 2.5, css(COLORS.boatRim));
}

/** The picture of the shop card "invite": a resident in the boat that brings them. */
export function drawInvite(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const waterY = height - 14;
  ctx.save();
  ctx.translate(cx, waterY);
  ctx.scale(0.86, 0.86);
  ctx.translate(-cx, -waterY);
  // The passenger stands in the boat, between the sail and the hull.
  drawBoatBack(ctx, cx, waterY);
  drawResident(ctx, HAT_COLORS['red'] ?? { hat: COLORS.cancel, shade: COLORS.cancelShade }, false, cx - 26, waterY - 57 + 2);
  drawBoatFront(ctx, cx, waterY);
  ctx.restore();
}
