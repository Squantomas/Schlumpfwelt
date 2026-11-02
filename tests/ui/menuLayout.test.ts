import { describe, expect, it } from 'vitest';
import type { Rect } from '../../src/ui/cameraMath';
import { MENU_MARGIN, menuIsLow, menuLayout, menuTitleCenterX, type MenuLayout, type MenuLayoutMode } from '../../src/ui/menuLayout';
import { MIN_TAP_SIZE } from '../../src/ui/style';

const SCREENS: readonly (readonly [number, number])[] = [
  [320, 568],
  [360, 640],
  [375, 667],
  [414, 896],
  [568, 320],
  [640, 360],
  [667, 375],
  [480, 320],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1920, 1080],
  [400, 400],
  [700, 399],
  [800, 500],
];

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width - 0.001 && b.x < a.x + a.width - 0.001 && a.y < b.y + b.height - 0.001 && b.y < a.y + a.height - 0.001;
}

function inside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x - 0.001 && inner.y >= outer.y - 0.001 && inner.x + inner.width <= outer.x + outer.width + 0.001 && inner.y + inner.height <= outer.y + outer.height + 0.001;
}

function children(layout: MenuLayout): [string, Rect][] {
  const list: [string, Rect | undefined][] = [
    ['Titel', layout.title],
    ['✕ oben', layout.close],
    ['Satz', layout.text],
    ['Sichern', layout.save],
    ['Laden', layout.load],
    ['Für Eltern', layout.parent],
    ['Ton', layout.sound],
    ['✓', layout.confirm],
    ['✕ Frage', layout.cancel],
  ];
  return list.filter((entry): entry is [string, Rect] => entry[1] !== undefined);
}

describe('menuLayout: nichts überlappt, nichts ragt über den Rand, alles groß genug', () => {
  for (const [width, height] of SCREENS) {
    for (const mode of ['menu', 'confirm'] as const satisfies readonly MenuLayoutMode[]) {
      it(`${String(width)}×${String(height)}, ${mode}`, () => {
        const layout = menuLayout(width, height, mode);
        const screen: Rect = { x: 0, y: 0, width, height };
        expect(inside(layout.panel, screen)).toBe(true);
        expect(layout.panel.x).toBeGreaterThanOrEqual(MENU_MARGIN - 0.001);
        expect(layout.panel.y).toBeGreaterThanOrEqual(MENU_MARGIN - 0.001);
        expect(layout.panel.y + layout.panel.height).toBeLessThanOrEqual(height - MENU_MARGIN + 0.001);
        expect(layout.veil).toEqual(screen);
        const all = children(layout);
        for (const [name, rect] of all) {
          expect(inside(rect, layout.panel), `${name} im Feld`).toBe(true);
        }
        for (let i = 0; i < all.length; i += 1) {
          for (let j = i + 1; j < all.length; j += 1) {
            const a = all[i];
            const b = all[j];
            if (a && b) {
              expect(intersects(a[1], b[1]), `${a[0]} überdeckt ${b[0]}`).toBe(false);
            }
          }
        }
        // Every target is at least 48 px in both directions.
        for (const [name, rect] of all.filter(([name]) => name !== 'Titel' && name !== 'Satz')) {
          expect(rect.width, `${name} breit`).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
          expect(rect.height, `${name} hoch`).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
        }
        expect(layout.text.width).toBeGreaterThan(200);
        expect(layout.title.width).toBeGreaterThan(80);
        expect(layout.textFont).toBeGreaterThanOrEqual(14);
      });
    }
  }

  it('zeigt im Menü beide Knöpfe, in der Frage ✓ und ✕ – nie beides', () => {
    const menu = menuLayout(800, 600, 'menu');
    expect(menu.save && menu.load).toBeTruthy();
    expect(menu.confirm ?? menu.cancel).toBeUndefined();
    const ask = menuLayout(800, 600, 'confirm');
    expect(ask.confirm && ask.cancel).toBeTruthy();
    expect(ask.save ?? ask.load).toBeUndefined();
  });

  it('M8/M9: „Ton an/aus“ und „Für Eltern“ unter den beiden Knöpfen (auf niedrigen Schirmen als zweite Reihe), nicht bei der Frage', () => {
    const tall = menuLayout(360, 640, 'menu');
    expect(tall.sound?.x).toBe(tall.load?.x);
    expect(tall.parent?.x).toBe(tall.load?.x);
    expect((tall.sound?.y ?? 0) > (tall.load?.y ?? 0)).toBe(true);
    expect((tall.parent?.y ?? 0) > (tall.sound?.y ?? 0)).toBe(true);
    const low = menuLayout(568, 320, 'menu');
    expect(low.sound?.x).toBe(low.save?.x);
    expect(low.parent?.x).toBe(low.load?.x);
    expect(low.parent?.y).toBe(low.sound?.y);
    expect((low.sound?.y ?? 0) > (low.save?.y ?? 0)).toBe(true);
    expect(menuLayout(800, 600, 'confirm').parent).toBeUndefined();
    expect(menuLayout(800, 600, 'confirm').sound).toBeUndefined();
  });

  it('M9: jeder Knopf des Menüs ist auf niedrigen Schirmen breit genug für sein Wort (mindestens 120 px)', () => {
    for (const [width, height] of SCREENS) {
      const layout = menuLayout(width, height, 'menu');
      for (const rect of [layout.save, layout.load, layout.sound, layout.parent]) {
        expect(rect?.width ?? 0).toBeGreaterThanOrEqual(120);
      }
    }
  });

  it('stellt die Knöpfe auf niedrigen Schirmen nebeneinander, sonst untereinander', () => {
    const low = menuLayout(568, 320, 'menu');
    expect(menuIsLow(320)).toBe(true);
    expect(low.save?.y).toBe(low.load?.y);
    const tall = menuLayout(360, 640, 'menu');
    expect(tall.save?.x).toBe(tall.load?.x);
    expect((tall.load?.y ?? 0) > (tall.save?.y ?? 0)).toBe(true);
  });

  it('zeigt das große ✕ oben nur im Menü, nicht bei der Frage (dort gibt es nur ein ✕)', () => {
    expect(menuLayout(800, 600, 'menu').close).toBeDefined();
    expect(menuLayout(800, 600, 'confirm').close).toBeUndefined();
  });

  it('✓ ist größer als ✕ und liegt rechts davon', () => {
    const ask = menuLayout(800, 600, 'confirm');
    expect(ask.confirm?.width).toBeGreaterThan(ask.cancel?.width ?? 0);
    expect((ask.confirm?.x ?? 0) > (ask.cancel?.x ?? 0)).toBe(true);
  });

  it('K5: der Titel sitzt in der Mitte des Felds, wo er neben dem ✕ Platz hat, sonst in der Mitte links vom ✕', () => {
    const wide = menuLayout(1024, 768, 'menu');
    expect(menuTitleCenterX(wide, 280)).toBe(wide.panel.x + wide.panel.width / 2);
    const narrow = menuLayout(320, 568, 'menu');
    const x = menuTitleCenterX(narrow, 200);
    expect(x).toBe(narrow.title.x + narrow.title.width / 2);
    expect(x + 100).toBeLessThanOrEqual((narrow.close?.x ?? 0) + 0.001);
    // Without the ✕ (the question) the title is always in the middle.
    const ask = menuLayout(320, 568, 'confirm');
    expect(menuTitleCenterX(ask, 200)).toBe(ask.panel.x + ask.panel.width / 2);
  });
});
