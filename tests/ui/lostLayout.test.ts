import { describe, expect, it } from 'vitest';
import type { Rect } from '../../src/ui/cameraMath';
import { LOST_BUTTON_LOW, LOST_MARGIN, lostLayout } from '../../src/ui/lostLayout';
import { MIN_TAP_SIZE } from '../../src/ui/style';

const SCREENS: readonly (readonly [number, number])[] = [
  [320, 568], [360, 640], [375, 667], [414, 896], [568, 320], [640, 360], [667, 375], [480, 320], [768, 1024], [1024, 768], [1280, 800], [1920, 1080], [400, 400], [700, 399],
];

const inside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x - 0.001 && inner.y >= outer.y - 0.001 && inner.x + inner.width <= outer.x + outer.width + 0.001 && inner.y + inner.height <= outer.y + outer.height + 0.001;
const intersects = (a: Rect, b: Rect): boolean => a.x < b.x + b.width - 0.001 && b.x < a.x + a.width - 0.001 && a.y < b.y + b.height - 0.001 && b.y < a.y + a.height - 0.001;

describe('lostLayout: die Ebene „anderes Fenster“ passt auf jeden Schirm', () => {
  it.each(SCREENS)('%i×%i: alles im Feld, im Bild, nichts überlappt, der Knopf ist groß', (width, height) => {
    const layout = lostLayout(width, height);
    const screen: Rect = { x: 0, y: 0, width, height };
    expect(layout.veil).toEqual(screen);
    expect(inside(layout.panel, screen)).toBe(true);
    expect(layout.panel.x).toBeGreaterThanOrEqual(LOST_MARGIN - 0.001);
    expect(layout.panel.y + layout.panel.height).toBeLessThanOrEqual(height - LOST_MARGIN + 0.001);
    for (const part of [layout.text, layout.button, layout.caption]) {
      expect(inside(part, layout.panel)).toBe(true);
    }
    expect(intersects(layout.text, layout.button)).toBe(false);
    expect(intersects(layout.button, layout.caption)).toBe(false);
    expect(intersects(layout.text, layout.caption)).toBe(false);
    expect(layout.button.width).toBe(layout.button.height);
    expect(layout.button.width).toBeGreaterThanOrEqual(LOST_BUTTON_LOW);
    expect(layout.button.width).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
    expect(layout.text.width).toBeGreaterThan(200);
    expect(layout.textFont).toBeGreaterThanOrEqual(14);
  });

  it('der Knopf sitzt in der Mitte des Felds', () => {
    const layout = lostLayout(800, 600);
    expect(layout.button.x + layout.button.width / 2).toBeCloseTo(layout.panel.x + layout.panel.width / 2);
  });
});
