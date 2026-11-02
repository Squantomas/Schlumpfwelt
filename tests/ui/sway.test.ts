import { describe, expect, it } from 'vitest';
import { inSwayView, SWAY_DEG, SWAY_MIN_ZOOM, swayAngle, swayOn } from '../../src/ui/sway';

describe('Wiegen von Bäumen und Deko (M9)', () => {
  it('höchstens etwa 1,3° wie im Stil-Leitfaden', () => {
    expect(SWAY_DEG).toBeLessThanOrEqual(1.3);
    let largest = 0;
    for (let t = 0; t < 30; t += 0.05) {
      largest = Math.max(largest, Math.abs(swayAngle(t, 2.1, 1.4)));
    }
    expect(largest).toBeLessThanOrEqual(SWAY_DEG);
    expect(largest).toBeGreaterThan(SWAY_DEG * 0.95);
  });

  it('erst ab Zoom 0,4', () => {
    expect(SWAY_MIN_ZOOM).toBe(0.4);
    expect(swayOn(0.39)).toBe(false);
    expect(swayOn(0.4)).toBe(true);
    expect(swayOn(2)).toBe(true);
  });

  it('nur im Bild, mit einer Kachel Rand (unten zwei)', () => {
    const view = { x: 0, y: 0, right: 640, bottom: 480 };
    expect(inSwayView(320, 240, view, 64)).toBe(true);
    expect(inSwayView(-64, 240, view, 64)).toBe(true);
    expect(inSwayView(-65, 240, view, 64)).toBe(false);
    expect(inSwayView(705, 240, view, 64)).toBe(false);
    expect(inSwayView(320, -65, view, 64)).toBe(false);
    expect(inSwayView(320, 480 + 128, view, 64)).toBe(true);
    expect(inSwayView(320, 480 + 129, view, 64)).toBe(false);
  });

  it('jedes Ding wiegt versetzt', () => {
    expect(swayAngle(3, 0, 1.4)).not.toBeCloseTo(swayAngle(3, 1.7, 1.4));
  });
});
