import { describe, expect, it } from 'vitest';
import type { Rect } from '../../src/ui/cameraMath';
import { NIGHT_BUTTON_LOW, nightLayout } from '../../src/ui/nightLayout';

const SCREENS: readonly (readonly [number, number])[] = [
  [320, 568], [360, 640], [568, 320], [640, 360], [480, 320], [768, 1024], [1024, 768], [1280, 800], [1920, 1080], [400, 400],
];

function inside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x - 0.001 && inner.y >= outer.y - 0.001 && inner.x + inner.width <= outer.x + outer.width + 0.001 && inner.y + inner.height <= outer.y + outer.height + 0.001;
}

function apart(a: Rect, b: Rect): boolean {
  return a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
}

describe('Gute-Nacht-Ebene: Mond, Sterne, Satz und Eltern-Knopf (M8)', () => {
  for (const [width, height] of SCREENS) {
    it(`${String(width)}×${String(height)}`, () => {
      const layout = nightLayout(width, height);
      const screen: Rect = { x: 0, y: 0, width, height };
      expect(layout.veil).toEqual(screen);
      const moon: Rect = { x: layout.moon.x - layout.moon.radius, y: layout.moon.y - layout.moon.radius, width: 2 * layout.moon.radius, height: 2 * layout.moon.radius };
      for (const rect of [moon, layout.text, layout.button, layout.caption]) {
        expect(inside(rect, screen)).toBe(true);
      }
      expect(apart(moon, layout.text)).toBe(true);
      expect(apart(layout.text, layout.button)).toBe(true);
      expect(apart(layout.button, layout.caption)).toBe(true);
      expect(layout.button.width).toBeGreaterThanOrEqual(NIGHT_BUTTON_LOW);
      expect(layout.text.height).toBeGreaterThanOrEqual(60);
      expect(layout.stars.length).toBeGreaterThanOrEqual(6);
      for (const star of layout.stars) {
        expect(star.x >= layout.text.x && star.x <= layout.text.x + layout.text.width && star.y >= layout.text.y && star.y <= layout.text.y + layout.text.height).toBe(false);
      }
    });
  }

  it('ist immer gleich (kein Zufall)', () => {
    expect(nightLayout(1024, 768)).toEqual(nightLayout(1024, 768));
  });
});
