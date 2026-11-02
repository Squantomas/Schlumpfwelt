import { describe, expect, it } from 'vitest';
import type { Rect } from '../../src/ui/cameraMath';
import { topControls, toolbarPanel, zoomLayout } from '../../src/ui/buildLayout';
import { ITEM_IDS } from '../../src/data/goods';
import { stockLayout } from '../../src/ui/stockLayout';
import { TOOLS } from '../../src/ui/buildTool';
import {
  NIGHT_BUTTON_LOW,
  SLEEP_SIGN_LEAST_CSS,
  SLEEP_SIGN_MIN_CSS,
  SLEEP_SIGN_SHIFTS,
  moonGlow,
  nightHiding,
  nightKeepOut,
  nightLayout,
  nightLook,
  placeSleepSigns,
  sleepSignSize,
} from '../../src/ui/nightLayout';

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

  const boxOf = (sign: { x: number; y: number; size: number }, bob = 0): Rect => ({ x: sign.x - sign.size / 2, y: sign.y - sign.size / 2 - bob, width: sign.size, height: sign.size + 2 * bob });
  const centres = (signs: readonly { x: number; y: number }[]): { x: number; y: number }[] => signs.map((sign) => ({ x: sign.x, y: sign.y }));

  it('nahe beieinander nur eines (Nachbarhäuser, Schläfer im Freien), weit auseinander alle', () => {
    const size = 56;
    const anchors = [{ x: 100, y: 100 }, { x: 110, y: 104 }, { x: 300, y: 100 }, { x: 100 + size, y: 100 }];
    const kept = placeSleepSigns(anchors, size, [], { width: 800, height: 600 });
    expect(kept.map((sign) => sign.anchor)).toEqual([anchors[0], anchors[2], anchors[3]]);
    // Free room: each "z" stands right over its house, full size.
    expect(centres(kept)).toEqual([{ x: 100, y: 72 }, { x: 300, y: 72 }, { x: 156, y: 72 }]);
    expect(kept.every((sign) => sign.size === size)).toBe(true);
    for (const [index, a] of kept.entries()) {
      for (const b of kept.slice(index + 1)) {
        expect(Math.hypot(a.anchor.x - b.anchor.x, a.anchor.y - b.anchor.y)).toBeGreaterThanOrEqual(size * 0.7);
      }
    }
  });

  it('ein Haus unter einer Leiste oder außerhalb des Schirms hat kein „z“', () => {
    const toolbar: Rect = { x: 10, y: 500, width: 300, height: 60 };
    const anchors = [{ x: 150, y: 520 }, { x: 150, y: 300 }, { x: -40, y: 300 }, { x: 150, y: 700 }];
    const kept = placeSleepSigns(anchors, 56, [toolbar], { width: 320, height: 568 });
    expect(kept.map((sign) => sign.anchor)).toEqual([anchors[1]]);
  });

  it('wo sein Platz besetzt ist, rückt das „z“ zur Seite oder wird kleiner, bis 30 px (Korrekturrunde 3)', () => {
    const screen = { width: 400, height: 400 };
    // Something right above the house: the "z" moves aside, at full size.
    const above: Rect = { x: 170, y: 100, width: 60, height: 96 };
    const aside = placeSleepSigns([{ x: 200, y: 200 }], 64, [above], screen);
    expect(aside).toHaveLength(1);
    expect(aside[0]?.size).toBe(64);
    expect(aside[0]?.x).not.toBe(200);
    // A narrow gap between a bar on top and something to the sides: it gets smaller, never below 30 px.
    const bar: Rect = { x: 0, y: 0, width: 400, height: 150 };
    const left: Rect = { x: 0, y: 150, width: 180, height: 250 };
    const right: Rect = { x: 222, y: 150, width: 178, height: 250 };
    const small = placeSleepSigns([{ x: 200, y: 200 }], 64, [bar, left, right], screen);
    expect(small).toHaveLength(1);
    expect(small[0]?.size).toBeLessThan(64);
    expect(small[0]?.size).toBeGreaterThanOrEqual(SLEEP_SIGN_LEAST_CSS);
    for (const rect of [bar, left, right]) {
      expect(apart(boxOf(small[0] ?? { x: 0, y: 0, size: 0 }), rect)).toBe(true);
    }
    // No room even for 30 px: no "z".
    const tight: Rect = { x: 0, y: 150, width: 186, height: 250 };
    expect(placeSleepSigns([{ x: 200, y: 200 }], 64, [bar, tight, { x: 214, y: 150, width: 186, height: 250 }], screen)).toEqual([]);
  });

  it('beim Freihalten zählt das Wippen mit (Korrekturrunde 3)', () => {
    const bar: Rect = { x: 0, y: 0, width: 400, height: 100 };
    // Without the bob the "z" would just fit under the bar; with ±6 px it moves or gets smaller.
    const still = placeSleepSigns([{ x: 200, y: 164 }], 64, [bar], { width: 400, height: 400 });
    expect(still[0]?.y).toBe(132);
    const bobbing = placeSleepSigns([{ x: 200, y: 164 }], 64, [bar], { width: 400, height: 400 }, 6);
    expect(bobbing).toHaveLength(1);
    expect(apart(boxOf(bobbing[0] ?? { x: 0, y: 0, size: 0 }, 6), bar)).toBe(true);
  });

  for (const [width, height] of ALL_SCREENS) {
    for (const zoom of [0.5, 1, 1.5]) {
      it(`${String(width)}×${String(height)}, Zoom ${String(zoom)}: jedes „z“ frei von Satz, Mond, Eltern-Knopf und Leisten, auch beim Wippen; ein Schläfer im freien Teil hat eines ab 30 px (Korrekturrunden 2 und 3)`, () => {
        const toolbar = toolbarPanel(width, height, TOOLS.length).rect;
        const controls = [toolbar, ...topControls(width, height, ITEM_IDS.length)];
        const layout = nightLayout(width, height, toolbar, controls.slice(1));
        const keepOut = nightKeepOut(layout, layout.text, controls);
        const size = sleepSignSize(zoom);
        const bob = 3 * zoom;
        const screen = { width, height };
        const all = [moonGlow(layout.moon), layout.text, layout.button, layout.caption, ...controls];
        // A grid of sleepers over the whole screen: every "z" that is kept stays clear of all of them.
        const anchors = [];
        for (let y = 0; y <= height; y += 24) {
          for (let x = 0; x <= width; x += 24) {
            anchors.push({ x, y });
          }
        }
        const hiding = nightHiding(layout, controls);
        const kept = placeSleepSigns(anchors, size, keepOut, screen, bob, hiding);
        expect(kept.length).toBeGreaterThan(0);
        for (const sign of kept) {
          expect(sign.size).toBeGreaterThanOrEqual(SLEEP_SIGN_LEAST_CSS);
          for (const rect of all) {
            expect(apart(boxOf(sign, bob), rect)).toBe(true);
          }
        }
        // One sleeper alone: wherever its house can be seen (not under a bar or a button – under the moon or the
        // sentence it still can) and the smallest "z" has room next to it, it gets a "z" of at least 30 px.
        let lonely = 0;
        for (const anchor of anchors) {
          const free = hiding.every((rect) => apart({ x: anchor.x - 1, y: anchor.y - 1, width: 2, height: 2 }, rect));
          const room = free && SLEEP_SIGN_SHIFTS.some(([dx, dy]) => {
            const box = { x: anchor.x + dx * 30 - 15, y: anchor.y - 15 + dy * 30 - 15 - bob, width: 30, height: 30 + 2 * bob };
            return box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height && all.every((rect) => apart(box, rect));
          });
          if (room) {
            lonely += 1;
            const one = placeSleepSigns([anchor], size, keepOut, screen, bob, hiding);
            expect(one, `Schläfer bei ${String(anchor.x)},${String(anchor.y)}`).toHaveLength(1);
            expect(one[0]?.size).toBeGreaterThanOrEqual(SLEEP_SIGN_LEAST_CSS);
          }
        }
        expect(lonely).toBeGreaterThan(0);
      });
    }
  }

  it('320×568 wie beim Nachtest (Zoom 1,3, Haus links oben unter Lagerleiste und Mond): das „z“ ist da, kleiner, frei von allem', () => {
    const [width, height] = [320, 568];
    const toolbar = toolbarPanel(width, height, TOOLS.length).rect;
    const controls = [toolbar, ...topControls(width, height, ITEM_IDS.length)];
    const layout = nightLayout(width, height, toolbar, controls.slice(1));
    const keepOut = nightKeepOut(layout, layout.text, controls);
    const zoom = 1.3;
    const kept = placeSleepSigns([{ x: 100, y: 150 }], sleepSignSize(zoom), keepOut, { width, height }, 3 * zoom);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.size).toBeGreaterThanOrEqual(SLEEP_SIGN_LEAST_CSS);
    for (const rect of keepOut) {
      expect(apart(boxOf(kept[0] ?? { x: 0, y: 0, size: 0 }, 3 * zoom), rect)).toBe(true);
    }
  });

  it('320×568 wie im Smoke (Zoom 0,5, das Dach unter dem Satz): das „z“ steht über dem Satz, frei von allem (Korrekturrunde 3)', () => {
    const [width, height] = [320, 568];
    const toolbar = toolbarPanel(width, height, TOOLS.length).rect;
    const controls = [toolbar, ...topControls(width, height, ITEM_IDS.length)];
    const layout = nightLayout(width, height, toolbar, controls.slice(1));
    const words: Rect = { x: 33.5, y: 226.9, width: 253, height: 74 };
    const keepOut = nightKeepOut(layout, words, controls);
    const kept = placeSleepSigns([{ x: 73.8, y: 241.8 }], sleepSignSize(0.5), keepOut, { width, height }, 1.5, nightHiding(layout, controls));
    expect(kept).toHaveLength(1);
    const sign = kept[0] ?? { x: 0, y: 0, size: 0 };
    expect(sign.size).toBeGreaterThanOrEqual(SLEEP_SIGN_LEAST_CSS);
    expect(sign.y + sign.size / 2).toBeLessThanOrEqual(words.y);
    for (const rect of keepOut) {
      expect(apart(boxOf(sign, 1.5), rect)).toBe(true);
    }
  });

  it('auf 320×568 fällt ein „z“ am Anfang von „Gute Nacht!“ nicht weg, es rückt; die Anker sind die gegebenen Objekte', () => {
    const layout = nightLayout(320, 568);
    const words: Rect = { x: 40, y: layout.text.y + 40, width: 240, height: 60 };
    const touching = { x: words.x + 6, y: words.y - 2 };
    const free = { x: 160, y: layout.button.y - 60 };
    const kept = placeSleepSigns([touching, free], 64, nightKeepOut(layout, words, []), { width: 320, height: 568 });
    expect(kept.map((sign) => sign.anchor)).toEqual([touching, free]);
    expect(kept[1]?.anchor).toBe(free);
    expect(apart(boxOf(kept[0] ?? { x: 0, y: 0, size: 0 }), words)).toBe(true);
  });

  it('immer dasselbe Ergebnis (die Reihenfolge entscheidet, kein Zufall)', () => {
    const anchors = [{ x: 10, y: 60 }, { x: 20, y: 60 }, { x: 200, y: 60 }];
    expect(placeSleepSigns(anchors, 56, [], { width: 400, height: 400 })).toEqual(placeSleepSigns(anchors, 56, [], { width: 400, height: 400 }));
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
