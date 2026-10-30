import { describe, expect, it } from 'vitest';
import type { Rect } from '../../src/ui/cameraMath';
import { placeConfirmButtons } from '../../src/ui/confirmLayout';

const SIZE = 72;
const GAP = 12;
const safe: Rect = { x: 8, y: 60, width: 1008, height: 540 };

/** The two button squares (✕ and ✓) as rectangles. */
function squares(result: ReturnType<typeof placeConfirmButtons>): Rect[] {
  return [result.confirm, result.cancel].map((p) => ({ x: p.x - SIZE / 2, y: p.y - SIZE / 2, width: SIZE, height: SIZE }));
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('placeConfirmButtons', () => {
  it('setzt die Knöpfe unter die Vorschau, ✕ links und ✓ rechts', () => {
    const target: Rect = { x: 400, y: 200, width: 128, height: 128 };
    const result = placeConfirmButtons(target, safe, [], SIZE, GAP);
    expect(result.clear).toBe(true);
    expect(result.cancel.y).toBe(result.confirm.y);
    expect(result.cancel.x).toBeLessThan(result.confirm.x);
    expect(result.confirm.y - SIZE / 2).toBeGreaterThanOrEqual(target.y + target.height);
    expect((result.cancel.x + result.confirm.x) / 2).toBeCloseTo(464);
  });

  it('weicht nach oben aus, wenn unten kein Platz ist', () => {
    const target: Rect = { x: 400, y: 440, width: 128, height: 128 };
    const result = placeConfirmButtons(target, safe, [], SIZE, GAP);
    expect(result.clear).toBe(true);
    expect(result.confirm.y + SIZE / 2).toBeLessThanOrEqual(target.y);
  });

  it('weicht zur Seite aus (✓ über ✕), wenn weder oben noch unten Platz ist', () => {
    const tall: Rect = { x: 300, y: 70, width: 128, height: 520 };
    const result = placeConfirmButtons(tall, safe, [], SIZE, GAP);
    expect(result.clear).toBe(true);
    expect(result.confirm.x).toBe(result.cancel.x);
    expect(result.confirm.y).toBeLessThan(result.cancel.y);
    expect(result.confirm.x - SIZE / 2).toBeGreaterThanOrEqual(tall.x + tall.width);
  });

  it('nimmt die linke Seite, wenn rechts kein Platz ist', () => {
    const tall: Rect = { x: 880, y: 70, width: 128, height: 520 };
    const result = placeConfirmButtons(tall, safe, [], SIZE, GAP);
    expect(result.clear).toBe(true);
    expect(result.confirm.x + SIZE / 2).toBeLessThanOrEqual(tall.x);
  });

  it('bleibt immer im sichtbaren Bereich', () => {
    for (const x of [-200, 0, 100, 500, 900, 1100]) {
      for (const y of [-100, 60, 300, 520, 700]) {
        const result = placeConfirmButtons({ x, y, width: 64, height: 64 }, safe, [], SIZE, GAP);
        for (const square of squares(result)) {
          expect(square.x).toBeGreaterThanOrEqual(safe.x - 0.001);
          expect(square.y).toBeGreaterThanOrEqual(safe.y - 0.001);
          expect(square.x + square.width).toBeLessThanOrEqual(safe.x + safe.width + 0.001);
          expect(square.y + square.height).toBeLessThanOrEqual(safe.y + safe.height + 0.001);
        }
      }
    }
  });

  it('verdeckt die Vorschau nicht, solange es einen freien Platz gibt', () => {
    for (const x of [20, 300, 700, 900]) {
      for (const y of [80, 250, 400]) {
        const target: Rect = { x, y, width: 128, height: 128 };
        const result = placeConfirmButtons(target, safe, [], SIZE, GAP);
        expect(result.clear).toBe(true);
        for (const square of squares(result)) {
          expect(intersects(square, target)).toBe(false);
        }
      }
    }
  });

  it('meidet gesperrte Bereiche wie die Zoom-Knöpfe', () => {
    const target: Rect = { x: 800, y: 20, width: 128, height: 128 };
    const zoom: Rect = { x: 930, y: 8, width: 88, height: 200 };
    const result = placeConfirmButtons(target, safe, [zoom], SIZE, GAP);
    for (const square of squares(result)) {
      expect(intersects(square, zoom)).toBe(false);
    }
  });

  it('bleibt bei riesiger Vorschau sichtbar, auch wenn sie sie verdecken muss', () => {
    const huge: Rect = { x: -300, y: -300, width: 2000, height: 1600 };
    const result = placeConfirmButtons(huge, safe, [], SIZE, GAP);
    expect(result.clear).toBe(false);
    for (const square of squares(result)) {
      expect(square.x).toBeGreaterThanOrEqual(safe.x - 0.001);
      expect(square.x + square.width).toBeLessThanOrEqual(safe.x + safe.width + 0.001);
      expect(square.y).toBeGreaterThanOrEqual(safe.y - 0.001);
      expect(square.y + square.height).toBeLessThanOrEqual(safe.y + safe.height + 0.001);
    }
  });

  it('macht die Knöpfe nie kleiner als verlangt', () => {
    const result = placeConfirmButtons({ x: 100, y: 100, width: 64, height: 64 }, safe, [], SIZE, GAP);
    const [a, b] = squares(result);
    expect(a && b && Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(SIZE);
  });
});
