import { describe, expect, it } from 'vitest';
import type { Rect } from '../../src/ui/cameraMath';
import { HINT_MAX_HEIGHT_NARROW, HINT_MIN_HEIGHT, hintBarGeometry, layoutBuildUi, zoomLayout, type BuildLayout, type BuildLayoutInput } from '../../src/ui/buildLayout';
import { MIN_TAP_SIZE } from '../../src/ui/style';

const SCREENS: readonly (readonly [number, number])[] = [
  [320, 568],
  [568, 320],
  [640, 360],
  [360, 640],
  [667, 375],
  [768, 1024],
  [1024, 768],
  [1280, 800],
];

/** Eine Eingabe für die Bauleisten; was nicht genannt ist, ist aus (kein Shop, keine Vorschau, kein Chip, keine Karte). */
function input(width: number, height: number, overrides: Partial<BuildLayoutInput> = {}): BuildLayoutInput {
  return {
    width,
    height,
    toolCount: 4,
    shopOpen: false,
    shopCount: 8,
    shopTabs: 4,
    hasChip: false,
    hasPreview: false,
    hintHeight: 0,
    hintAtTop: false,
    stockCount: 6,
    infoOpen: false,
    ...overrides,
  };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width - 0.001 && b.x < a.x + a.width - 0.001 && a.y < b.y + b.height - 0.001 && b.y < a.y + a.height - 0.001;
}

function parts(layout: BuildLayout): [string, Rect][] {
  const list: [string, Rect | undefined][] = [
    ['Lagerleiste', layout.stock.rect],
    ['Infokarte', layout.card?.rect],
    ['Werkzeugleiste', layout.toolbar.rect],
    ['Hinweisleiste', layout.hint],
    ['Zoom-Knöpfe', layout.zoom.rect],
    ['Zahnrad', layout.menu],
    ['Shop', layout.shop?.rect],
    ['Chip', layout.chip],
    ['✓', layout.confirm],
    ['✕', layout.cancel],
  ];
  return list.filter((entry): entry is [string, Rect] => entry[1] !== undefined);
}

describe('layoutBuildUi: nichts überlappt, nichts ragt über den Rand', () => {
  for (const [width, height] of SCREENS) {
    for (const hasChip of [true, false]) {
      for (const hasPreview of [true, false]) {
        // Zweizeiliger und fünfzeiliger Hinweis (schmale Schirme brechen um).
        // Auf niedrigen Schirmen schrumpft die Schrift, bis der Hinweis höchstens HINT_MIN_HEIGHT hoch ist (BuildUI.measureHint).
        // Auf schmalen (hochkant gehaltenes Handy) höchstens HINT_MAX_HEIGHT_NARROW.
        for (const hintHeight of height < 400 ? [HINT_MIN_HEIGHT] : width < 420 ? [HINT_MIN_HEIGHT, HINT_MAX_HEIGHT_NARROW] : [HINT_MIN_HEIGHT, 120]) {
          const label = `${String(width)}×${String(height)}, ${hasChip ? 'mit' : 'ohne'} Chip, ${hasPreview ? 'mit' : 'ohne'} Vorschau, Hinweis ${String(hintHeight)} px`;
          it(label, () => {
            const layout = layoutBuildUi(input(width, height, { hasChip, hasPreview, hintHeight, hintAtTop: true }));
            expect(layout.shop).toBeUndefined();
            expect(layout.chip !== undefined).toBe(hasChip);
            const all = parts(layout);
            for (const [name, rect] of all) {
              expect(rect.x, `${name} links`).toBeGreaterThanOrEqual(-0.001);
              expect(rect.y, `${name} oben`).toBeGreaterThanOrEqual(-0.001);
              expect(rect.x + rect.width, `${name} rechts`).toBeLessThanOrEqual(width + 0.001);
              expect(rect.y + rect.height, `${name} unten`).toBeLessThanOrEqual(height + 0.001);
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
          });
        }
      }
    }
  }

  it.each(SCREENS)('lässt bei %i×%i im Anschauen die Notiz über der Werkzeugleiste frei von den Zoom-Knöpfen', (width, height) => {
    const layout = layoutBuildUi(input(width, height, { hintHeight: 60 }));
    expect(layout.hint).toBeDefined();
    if (layout.hint) {
      expect(intersects(layout.hint, layout.toolbar.rect)).toBe(false);
      expect(intersects(layout.hint, layout.zoom.rect)).toBe(false);
      expect(layout.hint.y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Shop offen', () => {
  it.each(SCREENS)('verbirgt bei %i×%i Werkzeugleiste-Hinweis, Chip, Infokarte und ✓/✕ und lässt die Lagerleiste stehen', (width, height) => {
    const layout = layoutBuildUi(input(width, height, { shopOpen: true, hasChip: true, hasPreview: true, hintHeight: 60, hintAtTop: true, infoOpen: true }));
    expect(layout.shop).toBeDefined();
    expect(layout.hint).toBeUndefined();
    expect(layout.chip).toBeUndefined();
    expect(layout.confirm).toBeUndefined();
    expect(layout.cancel).toBeUndefined();
    expect(layout.card).toBeUndefined();
    expect(layout.shop?.rect.y ?? 0).toBeGreaterThanOrEqual(layout.stock.rect.y + layout.stock.rect.height);
  });

  it.each(SCREENS)('zeigt bei %i×%i den Chip „zurück zum Shop“ links, ✓/✕ rechts, ohne dass sie sich berühren', (width, height) => {
    const layout = layoutBuildUi(input(width, height, { hasChip: true, hasPreview: true, hintHeight: HINT_MIN_HEIGHT, hintAtTop: true }));
    expect(layout.chip).toBeDefined();
    expect(layout.confirm).toBeDefined();
    if (layout.chip && layout.confirm && layout.cancel) {
      expect(intersects(layout.chip, layout.confirm)).toBe(false);
      expect(intersects(layout.chip, layout.cancel)).toBe(false);
      expect(intersects(layout.chip, layout.toolbar.rect)).toBe(false);
      expect(layout.chip.width).toBeGreaterThanOrEqual(48);
      expect(layout.chip.height).toBeGreaterThanOrEqual(48);
    }
  });
});

describe('Zoom-Knöpfe und Hinweisleiste', () => {
  it.each(SCREENS)('haben bei %i×%i große Knöpfe in der Spalte rechts, die die Hinweisleiste frei lässt', (width, height) => {
    const zoom = zoomLayout(width, height);
    expect(zoom.radius * 2).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
    const bar = hintBarGeometry(width);
    expect(bar.x + bar.width).toBeLessThanOrEqual(zoom.rect.x + 0.001);
    expect(bar.x).toBeGreaterThanOrEqual(0);
    expect(zoom.rect.x + zoom.rect.width).toBeLessThanOrEqual(width);
  });
});

describe('Zahnrad (Menü)', () => {
  it.each(SCREENS)('sitzt bei %i×%i unter den Zoom-Knöpfen, ist groß genug und stößt an nichts, solange man nur schaut', (width, height) => {
    const layout = layoutBuildUi(input(width, height, { hasMenu: true, hintHeight: 60, hintAtTop: false }));
    const gear = layout.menu;
    expect(gear).toBeDefined();
    if (!gear) {
      return;
    }
    expect(gear.width).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
    expect(gear.height).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
    expect(gear.x + gear.width).toBeLessThanOrEqual(width + 0.001);
    expect(gear.y).toBeGreaterThanOrEqual(layout.zoom.rect.y + layout.zoom.rect.height);
    for (const [name, rect] of parts(layout).filter(([name]) => name !== 'Zahnrad')) {
      expect(intersects(gear, rect), `Zahnrad überdeckt ${name}`).toBe(false);
    }
  });

  it('fehlt, wo es stören würde: mit Werkzeug (Vorschau, Chip), offenem Shop, offener Infokarte – oder wenn es nicht gewünscht ist', () => {
    const base = { hintHeight: 0, hintAtTop: false };
    expect(layoutBuildUi(input(800, 600, { ...base, hasMenu: true })).menu).toBeDefined();
    expect(layoutBuildUi(input(800, 600, { ...base })).menu).toBeUndefined();
    expect(layoutBuildUi(input(800, 600, { ...base, hasMenu: true, hasPreview: true })).menu).toBeUndefined();
    expect(layoutBuildUi(input(800, 600, { ...base, hasMenu: true, hasChip: true })).menu).toBeUndefined();
    expect(layoutBuildUi(input(800, 600, { ...base, hasMenu: true, shopOpen: true })).menu).toBeUndefined();
    expect(layoutBuildUi(input(800, 600, { ...base, hasMenu: true, infoOpen: true })).menu).toBeUndefined();
  });
});

const MORE_SCREENS: readonly (readonly [number, number])[] = [...SCREENS, [360, 780], [412, 915], [600, 960], [1920, 1080], [812, 375], [740, 360]];

describe('Lagerleiste', () => {
  it.each(MORE_SCREENS)('sitzt bei %i×%i oben links, links von den Zoom-Knöpfen, ohne Rand zu verletzen', (width, height) => {
    const layout = layoutBuildUi(input(width, height, { infoOpen: false, hintHeight: 0, hintAtTop: false }));
    const { stock, zoom } = layout;
    expect(stock.rect.x).toBeGreaterThanOrEqual(0);
    expect(stock.rect.y).toBeGreaterThanOrEqual(0);
    expect(stock.rect.x + stock.rect.width).toBeLessThanOrEqual(zoom.rect.x + 0.001);
    expect(intersects(stock.rect, zoom.rect)).toBe(false);
    expect(intersects(stock.rect, layout.toolbar.rect)).toBe(false);
    // Alle sechs Chips liegen im Feld, überlappen sich nicht, sind groß genug zum Lesen.
    expect(stock.chips).toHaveLength(6);
    const chipRects: Rect[] = stock.chips.map((chip) => ({ x: chip.x, y: chip.y, width: stock.chipW, height: stock.chipH }));
    for (const [i, chip] of chipRects.entries()) {
      expect(chip.x, `Chip ${String(i)}`).toBeGreaterThanOrEqual(stock.rect.x);
      expect(chip.y).toBeGreaterThanOrEqual(stock.rect.y);
      expect(chip.x + chip.width).toBeLessThanOrEqual(stock.rect.x + stock.rect.width + 0.001);
      expect(chip.y + chip.height).toBeLessThanOrEqual(stock.rect.y + stock.rect.height + 0.001);
      for (const other of chipRects.slice(i + 1)) {
        expect(intersects(chip, other)).toBe(false);
      }
    }
    expect(stock.fontSize).toBeGreaterThanOrEqual(16);
    expect(stock.iconSize).toBeGreaterThanOrEqual(22);
  });

  it('ist auf dem Tablet groß und einzeilig, auf dem Handy hoch zweizeilig und quer einzeilig', () => {
    const at = (width: number, height: number) =>
      layoutBuildUi(input(width, height, { infoOpen: false, hintHeight: 0, hintAtTop: false })).stock;
    expect(at(1024, 768).rows).toBe(1);
    expect(at(1024, 768).fontSize).toBeGreaterThanOrEqual(24);
    expect(at(320, 568).rows).toBe(2);
    expect(at(568, 320).rows).toBe(1);
  });

  it('schiebt die Hinweisleiste unter sich, wenn ein Werkzeug an ist', () => {
    for (const [width, height] of MORE_SCREENS) {
      const layout = layoutBuildUi(input(width, height, { infoOpen: false, hintHeight: HINT_MIN_HEIGHT, hintAtTop: true }));
      expect(layout.hint).toBeDefined();
      if (layout.hint) {
        expect(layout.hint.y, `${String(width)}×${String(height)}`).toBeGreaterThanOrEqual(layout.stock.rect.y + layout.stock.rect.height);
      }
    }
  });
});

describe('Infokarte auf sehr niedrigen Schirmen', () => {
  it('meldet „passt nicht“, wenn zwischen Lagerleiste und Werkzeugleiste zu wenig Platz ist (die Szene zeigt dann den Satz als Hinweis)', () => {
    const layout = layoutBuildUi(input(700, 250, { infoOpen: true, hintHeight: 0, hintAtTop: false }));
    expect(layout.card?.fits).toBe(false);
  });

  it('passt auf allen gängigen Handy-Größen, auch quer mit 375 px Höhe', () => {
    for (const [width, height] of [[568, 320], [640, 360], [667, 375], [812, 375], [740, 360]] as const) {
      const layout = layoutBuildUi(input(width, height, { infoOpen: true, hintHeight: 0, hintAtTop: false }));
      expect(layout.card?.fits, `${String(width)}×${String(height)}`).toBe(true);
    }
  });
});

describe('Infokarte', () => {
  it.each(MORE_SCREENS)('liegt bei %i×%i frei von Lagerleiste, Zoom-Knöpfen und Werkzeugleiste', (width, height) => {
    const layout = layoutBuildUi(input(width, height, { infoOpen: true, hintHeight: 0, hintAtTop: false }));
    const card = layout.card;
    expect(card).toBeDefined();
    if (!card) {
      return;
    }
    expect(card.fits).toBe(true);
    const all = parts(layout);
    expect(all.some(([name]) => name === 'Infokarte')).toBe(true);
    for (const [name, rect] of all) {
      expect(rect.x, `${name} links`).toBeGreaterThanOrEqual(-0.001);
      expect(rect.y, `${name} oben`).toBeGreaterThanOrEqual(-0.001);
      expect(rect.x + rect.width, `${name} rechts`).toBeLessThanOrEqual(width + 0.001);
      expect(rect.y + rect.height, `${name} unten`).toBeLessThanOrEqual(height + 0.001);
    }
    for (const [name, rect] of all) {
      if (name !== 'Infokarte') {
        expect(intersects(card.rect, rect), `Infokarte überdeckt ${name}`).toBe(false);
      }
    }
  });

  it.each(MORE_SCREENS)('hat bei %i×%i ein ✕ von mindestens 64 px, und alle Teile liegen in der Karte ohne sich zu überdecken', (width, height) => {
    const layout = layoutBuildUi(input(width, height, { infoOpen: true, hintHeight: 0, hintAtTop: false }));
    const card = layout.card;
    if (!card) {
      throw new Error('keine Karte');
    }
    expect(card.close.width).toBeGreaterThanOrEqual(64);
    expect(card.close.height).toBeGreaterThanOrEqual(64);
    const inner: [string, Rect][] = [
      ['✕', card.close],
      ['Name', card.name],
      ['Bilder', card.flow],
      ['Satz', card.status],
      ['Balken', card.bar],
    ];
    for (const [name, rect] of inner) {
      expect(rect.width, name).toBeGreaterThan(0);
      expect(rect.height, name).toBeGreaterThan(0);
      expect(rect.x, name).toBeGreaterThanOrEqual(card.rect.x - 0.001);
      expect(rect.y, name).toBeGreaterThanOrEqual(card.rect.y - 0.001);
      expect(rect.x + rect.width, name).toBeLessThanOrEqual(card.rect.x + card.rect.width + 0.001);
      expect(rect.y + rect.height, name).toBeLessThanOrEqual(card.rect.y + card.rect.height + 0.001);
    }
    for (let i = 0; i < inner.length; i += 1) {
      for (let j = i + 1; j < inner.length; j += 1) {
        const a = inner[i];
        const b = inner[j];
        if (a && b) {
          expect(intersects(a[1], b[1]), `${a[0]} überdeckt ${b[0]}`).toBe(false);
        }
      }
    }
    if (card.captions) {
      for (const caption of [card.captions.needs, card.captions.makes]) {
        expect(intersects(caption, card.flow)).toBe(false);
        expect(intersects(caption, card.name)).toBe(false);
        expect(intersects(caption, card.close)).toBe(false);
      }
    }
  });

  it('wird auf niedrigen Schirmen kompakt (Satz neben den Bildern), auf hohen groß mit Überschriften', () => {
    const at = (width: number, height: number) =>
      layoutBuildUi(input(width, height, { infoOpen: true, hintHeight: 0, hintAtTop: false })).card;
    expect(at(568, 320)?.compact).toBe(true);
    expect(at(667, 375)?.compact).toBe(true);
    expect(at(812, 375)?.compact).toBe(true);
    expect(at(1024, 768)?.compact).toBe(false);
    expect(at(1024, 768)?.captions).toBeDefined();
    expect(at(320, 568)?.compact).toBe(false);
  });
});

describe('Karte eines Bewohners (M7: mehr Zeilen, darf höher sein)', () => {
  it.each(MORE_SCREENS)('liegt bei %i×%i frei von Lagerleiste, Zoom-Knöpfen und Werkzeugleiste und ist höchstens 330 px hoch', (width, height) => {
    const layout = layoutBuildUi(input(width, height, { infoOpen: true, residentOpen: true, hintHeight: 0, hintAtTop: false }));
    const card = layout.card;
    if (!card) {
      throw new Error('keine Karte');
    }
    expect(card.fits).toBe(true);
    expect(card.rect.height).toBeLessThanOrEqual(330);
    for (const [name, rect] of parts(layout)) {
      expect(rect.y + rect.height, `${name} unten`).toBeLessThanOrEqual(height + 0.001);
      if (name !== 'Infokarte') {
        expect(intersects(card.rect, rect), `Karte überdeckt ${name}`).toBe(false);
      }
    }
    // Never lower than the card of a building: the resident's card only takes more of the free band.
    const building = layoutBuildUi(input(width, height, { infoOpen: true, hintHeight: 0, hintAtTop: false })).card;
    expect(card.rect.height).toBeGreaterThanOrEqual(building?.rect.height ?? 0);
  });

  it('nutzt auf dem Handy hochkant mehr Höhe als die Infokarte eines Gebäudes', () => {
    const resident = layoutBuildUi(input(320, 568, { infoOpen: true, residentOpen: true, hintHeight: 0, hintAtTop: false })).card;
    const building = layoutBuildUi(input(320, 568, { infoOpen: true, hintHeight: 0, hintAtTop: false })).card;
    expect(resident?.rect.height).toBeGreaterThan(building?.rect.height ?? 0);
  });
});
