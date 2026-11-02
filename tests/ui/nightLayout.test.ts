import { describe, expect, it } from 'vitest';
import type { Rect } from '../../src/ui/cameraMath';
import { topControls, toolbarPanel, zoomLayout } from '../../src/ui/buildLayout';
import { ITEM_IDS } from '../../src/data/goods';
import { stockLayout } from '../../src/ui/stockLayout';
import { TOOLS } from '../../src/ui/buildTool';
import { NIGHT_BUTTON_LOW, SLEEP_SIGN_MIN_CSS, moonGlow, nightLayout, nightLook, sleepSignSize, spreadSleepSigns } from '../../src/ui/nightLayout';

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

/** The screens of the shop test (`tests/ui/shopLayout.test.ts`) and a few more (small, square, low). */
const ALL_SCREENS: readonly (readonly [number, number])[] = [
  [320, 568], [568, 320], [640, 360], [360, 640], [667, 375], [768, 1024], [1024, 768], [1280, 800], [360, 780], [412, 915],
  [600, 960], [1920, 1080], [812, 375], [740, 360], [320, 480], [480, 320], [400, 400], [1366, 1024],
];

describe('Der Mond liegt über keiner Leiste und keinem Knopf (M9, Korrekturrunde 1)', () => {
  it('die Hindernisse sind Lagerleiste, Zoom-Knöpfe und Zahnrad, wie am Tag', () => {
    const zoom = zoomLayout(320, 568);
    const controls = topControls(320, 568, ITEM_IDS.length);
    expect(controls).toContainEqual(stockLayout(320, 568, ITEM_IDS.length, zoom.rect.x - 8).rect);
    expect(controls).toContainEqual(zoom.rect);
    expect(controls).toContainEqual({ x: zoom.menu.x - zoom.radius, y: zoom.menu.y - zoom.radius, width: 2 * zoom.radius, height: 2 * zoom.radius });
  });

  for (const [width, height] of ALL_SCREENS) {
    it(`${String(width)}×${String(height)}`, () => {
      const toolbar = toolbarPanel(width, height, TOOLS.length).rect;
      const controls = topControls(width, height, ITEM_IDS.length);
      const layout = nightLayout(width, height, toolbar, controls);
      const glow = moonGlow(layout.moon);
      for (const rect of controls) {
        expect(apart(glow, rect)).toBe(true);
      }
      expect(apart(glow, toolbar)).toBe(true);
      const disc: Rect = { x: layout.moon.x - layout.moon.radius, y: layout.moon.y - layout.moon.radius, width: 2 * layout.moon.radius, height: 2 * layout.moon.radius };
      expect(inside(disc, { x: 0, y: 0, width, height })).toBe(true);
      expect(apart(disc, layout.text)).toBe(true);
      expect(apart(layout.text, layout.button)).toBe(true);
      expect(layout.text.height).toBeGreaterThanOrEqual(60);
      expect(layout.moon.radius).toBeGreaterThanOrEqual(24);
      // Still high up in the sky.
      expect(layout.moon.y).toBeLessThan(height * 0.55);
    });
  }

  it('wo nichts im Weg ist, bleibt der Mond, wo er war', () => {
    expect(nightLayout(1280, 800, undefined, topControls(1280, 800, ITEM_IDS.length)).moon).toEqual(nightLayout(1280, 800).moon);
    expect(nightLayout(768, 1024, undefined, topControls(768, 1024, ITEM_IDS.length)).moon).toEqual(nightLayout(768, 1024).moon);
  });
});

describe('Das „z“ der Schlafenden über der Nacht (M9, Korrekturrunde 1)', () => {
  it('ist auf dem Schirm immer mindestens so groß, weit draußen wie ganz nah', () => {
    for (const zoom of [0.1, 0.25, 0.5, 1, 1.5, 2, 4]) {
      const size = sleepSignSize(zoom);
      expect(size).toBeGreaterThanOrEqual(SLEEP_SIGN_MIN_CSS);
      expect(size).toBeLessThanOrEqual(112);
    }
    expect(SLEEP_SIGN_MIN_CSS).toBeGreaterThanOrEqual(64);
    expect(sleepSignSize(2)).toBeGreaterThan(sleepSignSize(0.5));
  });

  it('nahe beieinander nur eines (Nachbarhäuser, Schläfer im Freien), weit auseinander alle', () => {
    const size = 56;
    const kept = spreadSleepSigns([{ x: 100, y: 100 }, { x: 110, y: 104 }, { x: 300, y: 100 }, { x: 100 + size, y: 100 }], size, [], { width: 800, height: 600 });
    expect(kept).toEqual([{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 100 + size, y: 100 }]);
    for (const [index, a] of kept.entries()) {
      for (const b of kept.slice(index + 1)) {
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(size * 0.7);
      }
    }
  });

  it('nicht über den Leisten und Knöpfen, nicht außerhalb des Schirms', () => {
    const toolbar: Rect = { x: 10, y: 500, width: 300, height: 60 };
    const kept = spreadSleepSigns([{ x: 150, y: 520 }, { x: 150, y: 300 }, { x: -40, y: 300 }, { x: 150, y: 700 }], 56, [toolbar], { width: 320, height: 568 });
    expect(kept).toEqual([{ x: 150, y: 300 }]);
  });

  it('immer dasselbe Ergebnis (die Reihenfolge entscheidet, kein Zufall)', () => {
    const points = [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 200, y: 10 }];
    expect(spreadSleepSigns(points, 56, [], { width: 400, height: 400 })).toEqual(spreadSleepSigns(points, 56, [], { width: 400, height: 400 }));
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
