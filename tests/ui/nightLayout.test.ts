import { describe, expect, it } from 'vitest';
import type { Rect } from '../../src/ui/cameraMath';
import { toolbarPanel } from '../../src/ui/buildLayout';
import { TOOLS } from '../../src/ui/buildTool';
import { NIGHT_BUTTON_LOW, nightLayout, nightLook } from '../../src/ui/nightLayout';

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
      // Quietly in the lower left corner, not in the middle (Korrekturrunde 1).
      expect(layout.button.x + layout.button.width / 2).toBeLessThan(width / 3);
      expect(layout.button.y + layout.button.height).toBeGreaterThan(height * 0.7);
      expect(layout.text.height).toBeGreaterThanOrEqual(60);
      expect(layout.stars.length).toBeGreaterThanOrEqual(6);
      for (const star of layout.stars) {
        expect(star.x >= layout.text.x && star.x <= layout.text.x + layout.text.width && star.y >= layout.text.y && star.y <= layout.text.y + layout.text.height).toBe(false);
      }
    });
  }

  for (const [width, height] of SCREENS.filter(([w, h]) => h > w)) {
    it(`${String(width)}×${String(height)} hochkant: der Knopf liegt nicht über der Werkzeugleiste (Korrekturrunde 2)`, () => {
      const toolbar = toolbarPanel(width, height, TOOLS.length).rect;
      const layout = nightLayout(width, height, toolbar);
      expect(apart(layout.button, toolbar)).toBe(true);
      expect(apart(layout.caption, toolbar)).toBe(true);
      expect(apart(layout.text, layout.button)).toBe(true);
      expect(layout.text.height).toBeGreaterThanOrEqual(60);
      expect(layout.button.width).toBeGreaterThanOrEqual(NIGHT_BUTTON_LOW);
      expect(layout.button.x + layout.button.width / 2).toBeLessThan(width / 3);
      expect(layout.button.y + layout.button.height).toBeGreaterThan(height * 0.6);
    });
  }

  it('quer bleibt der Knopf unten links in der Ecke (dort ist genug Platz neben der Leiste)', () => {
    expect(nightLayout(568, 320, toolbarPanel(568, 320, TOOLS.length).rect)).toEqual(nightLayout(568, 320));
    expect(nightLayout(1024, 768, toolbarPanel(1024, 768, TOOLS.length).rect)).toEqual(nightLayout(1024, 768));
  });

  it('ist immer gleich (kein Zufall)', () => {
    expect(nightLayout(1024, 768)).toEqual(nightLayout(1024, 768));
  });
});

describe('Abend, Nacht, Morgen: wie dunkel es ist (M8)', () => {
  it('am Tag nichts, am Abend langsam wärmer und dunkler, nachts tiefblau mit Himmel, morgens wieder hell', () => {
    expect(nightLook('day', 0, 0, 6000, 3000)).toEqual({ warm: 0, dark: 0, sky: 0, blocks: false });
    const early = nightLook('dusk', 1000, 0, 6000, 3000);
    const late = nightLook('dusk', 6000, 0, 6000, 3000);
    expect(early.warm).toBeLessThan(late.warm);
    expect(early.dark).toBeLessThan(late.dark);
    expect(late.blocks).toBe(true);
    expect(nightLook('dusk', 60_000, 0, 6000, 3000)).toEqual(late);
    const night = nightLook('night', 0, 5000, 6000, 3000);
    expect(night.dark).toBeGreaterThan(late.dark);
    expect(night.sky).toBe(1);
    expect(night.warm).toBe(0);
    expect(night.blocks).toBe(true);
    // Fading in: right at the start of the night it is the evening's look.
    expect(nightLook('night', 0, 0, 6000, 3000).dark).toBeCloseTo(late.dark);
    const dawn = nightLook('dawn', 1500, 0, 6000, 3000);
    expect(dawn.dark).toBeLessThan(night.dark);
    expect(dawn.blocks).toBe(false);
    expect(nightLook('dawn', 3000, 0, 6000, 3000).dark).toBe(0);
  });
});
