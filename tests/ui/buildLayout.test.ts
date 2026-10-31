import { describe, expect, it } from 'vitest';
import type { Rect } from '../../src/ui/cameraMath';
import { HINT_MAX_HEIGHT_NARROW, HINT_MIN_HEIGHT, hintBarGeometry, layoutBuildUi, zoomLayout, type BuildLayout } from '../../src/ui/buildLayout';
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
    ['Auswahl', layout.picker?.rect],
    ['Chip', layout.chip],
    ['✓', layout.confirm],
    ['✕', layout.cancel],
  ];
  return list.filter((entry): entry is [string, Rect] => entry[1] !== undefined);
}

describe('layoutBuildUi: nichts überlappt, nichts ragt über den Rand', () => {
  for (const [width, height] of SCREENS) {
    for (const variants of [3, 6]) {
      for (const pickerOpen of [true, false]) {
        for (const hasPreview of [true, false]) {
          // Zweizeiliger und fünfzeiliger Hinweis (schmale Schirme brechen um).
          // Auf niedrigen Schirmen schrumpft die Schrift, bis der Hinweis höchstens HINT_MIN_HEIGHT hoch ist (BuildUI.measureHint).
          // Auf schmalen (hochkant gehaltenes Handy) höchstens HINT_MAX_HEIGHT_NARROW.
          for (const hintHeight of height < 400 ? [HINT_MIN_HEIGHT] : width < 420 ? [HINT_MIN_HEIGHT, HINT_MAX_HEIGHT_NARROW] : [HINT_MIN_HEIGHT, 120]) {
            const label = `${String(width)}×${String(height)}, ${String(variants)} Varianten, Auswahl ${pickerOpen ? 'offen' : 'als Chip'}, ${hasPreview ? 'mit' : 'ohne'} Vorschau, Hinweis ${String(hintHeight)} px`;
            it(label, () => {
              const layout = layoutBuildUi({ width, height, toolCount: 6, stockCount: 6, infoOpen: false, variantCount: variants, pickerOpen, hasPreview, hintHeight, hintAtTop: true });
              // Reicht die Höhe bei offener Auswahl und Vorschau nicht, schließt das UI zuerst die Vorschau – dann gibt es diesen Fall nicht.
              if (pickerOpen && hasPreview && !layout.pickerFitsWithPreview) {
                return;
              }
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
  }

  it.each(SCREENS)('lässt bei %i×%i im Anschauen die Notiz über der Werkzeugleiste frei von den Zoom-Knöpfen', (width, height) => {
    const layout = layoutBuildUi({ width, height, toolCount: 6, stockCount: 6, infoOpen: false, variantCount: 0, pickerOpen: true, hasPreview: false, hintHeight: 60, hintAtTop: false });
    expect(layout.hint).toBeDefined();
    if (layout.hint) {
      expect(intersects(layout.hint, layout.toolbar.rect)).toBe(false);
      expect(intersects(layout.hint, layout.zoom.rect)).toBe(false);
      expect(layout.hint.y).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Auswahl auf niedrigen Schirmen', () => {
  it('blättert mit Pfeilen, sobald der Platz für Deko nicht reicht (568×320)', () => {
    const layout = layoutBuildUi({ width: 568, height: 320, toolCount: 6, stockCount: 6, infoOpen: false, variantCount: 6, pickerOpen: true, hasPreview: false, hintHeight: HINT_MIN_HEIGHT, hintAtTop: true });
    expect(layout.picker?.paged).toBe(true);
    expect(layout.picker?.fits).toBe(true);
    expect(layout.picker?.pages).toBeGreaterThan(1);
  });

  it('zeigt sechs Gebäude auf einem hochkant gehaltenen Handy (320×568) in zwei Reihen schmaler Karten, ohne zu blättern', () => {
    const layout = layoutBuildUi({ width: 320, height: 568, toolCount: 6, stockCount: 6, infoOpen: false, variantCount: 6, pickerOpen: true, hasPreview: false, hintHeight: HINT_MAX_HEIGHT_NARROW, hintAtTop: true });
    expect(layout.picker?.paged).toBe(false);
    expect(layout.picker?.rows).toBe(2);
    expect(layout.picker?.cols).toBe(3);
    expect(layout.picker?.cellW).toBeLessThan(104);
    expect(layout.picker?.fits).toBe(true);
  });

  it('zeigt 3 Häuser ohne Pfeile, wenn sie ganz passen (568×320)', () => {
    const layout = layoutBuildUi({ width: 568, height: 320, toolCount: 6, stockCount: 6, infoOpen: false, variantCount: 3, pickerOpen: true, hasPreview: false, hintHeight: HINT_MIN_HEIGHT, hintAtTop: true });
    expect(layout.picker?.paged).toBe(false);
  });

  it('spart die Zoom-Spalte aus, wenn die Auswahl bis zu den Zoom-Knöpfen hinaufreicht', () => {
    const layout = layoutBuildUi({ width: 568, height: 320, toolCount: 6, stockCount: 6, infoOpen: false, variantCount: 6, pickerOpen: true, hasPreview: false, hintHeight: HINT_MIN_HEIGHT, hintAtTop: true });
    expect(layout.picker?.sideInset).toBeGreaterThan(0);
  });

  it('meldet auf 568×320 mit Vorschau, dass die Auswahl nicht passt (ein Tipp auf den Chip schließt dann die Vorschau)', () => {
    const layout = layoutBuildUi({ width: 568, height: 320, toolCount: 6, stockCount: 6, infoOpen: false, variantCount: 6, pickerOpen: false, hasPreview: true, hintHeight: HINT_MIN_HEIGHT, hintAtTop: true });
    expect(layout.pickerFitsWithPreview).toBe(false);
    const tablet = layoutBuildUi({ width: 1024, height: 768, toolCount: 6, stockCount: 6, infoOpen: false, variantCount: 6, pickerOpen: false, hasPreview: true, hintHeight: HINT_MIN_HEIGHT, hintAtTop: true });
    expect(tablet.pickerFitsWithPreview).toBe(true);
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

const MORE_SCREENS: readonly (readonly [number, number])[] = [...SCREENS, [360, 780], [412, 915], [600, 960], [1920, 1080], [812, 375], [740, 360]];

describe('Lagerleiste', () => {
  it.each(MORE_SCREENS)('sitzt bei %i×%i oben links, links von den Zoom-Knöpfen, ohne Rand zu verletzen', (width, height) => {
    const layout = layoutBuildUi({ width, height, toolCount: 6, stockCount: 6, infoOpen: false, variantCount: 0, pickerOpen: true, hasPreview: false, hintHeight: 0, hintAtTop: false });
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
      layoutBuildUi({ width, height, toolCount: 6, stockCount: 6, infoOpen: false, variantCount: 0, pickerOpen: true, hasPreview: false, hintHeight: 0, hintAtTop: false }).stock;
    expect(at(1024, 768).rows).toBe(1);
    expect(at(1024, 768).fontSize).toBeGreaterThanOrEqual(24);
    expect(at(320, 568).rows).toBe(2);
    expect(at(568, 320).rows).toBe(1);
  });

  it('schiebt die Hinweisleiste unter sich, wenn ein Werkzeug an ist', () => {
    for (const [width, height] of MORE_SCREENS) {
      const layout = layoutBuildUi({ width, height, toolCount: 6, stockCount: 6, infoOpen: false, variantCount: 0, pickerOpen: true, hasPreview: false, hintHeight: HINT_MIN_HEIGHT, hintAtTop: true });
      expect(layout.hint).toBeDefined();
      if (layout.hint) {
        expect(layout.hint.y, `${String(width)}×${String(height)}`).toBeGreaterThanOrEqual(layout.stock.rect.y + layout.stock.rect.height);
      }
    }
  });
});

describe('Infokarte', () => {
  it.each(MORE_SCREENS)('liegt bei %i×%i frei von Lagerleiste, Zoom-Knöpfen und Werkzeugleiste', (width, height) => {
    const layout = layoutBuildUi({ width, height, toolCount: 6, stockCount: 6, infoOpen: true, variantCount: 0, pickerOpen: true, hasPreview: false, hintHeight: 0, hintAtTop: false });
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
    const layout = layoutBuildUi({ width, height, toolCount: 6, stockCount: 6, infoOpen: true, variantCount: 0, pickerOpen: true, hasPreview: false, hintHeight: 0, hintAtTop: false });
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
      layoutBuildUi({ width, height, toolCount: 6, stockCount: 6, infoOpen: true, variantCount: 0, pickerOpen: true, hasPreview: false, hintHeight: 0, hintAtTop: false }).card;
    expect(at(568, 320)?.compact).toBe(true);
    expect(at(667, 375)?.compact).toBe(true);
    expect(at(812, 375)?.compact).toBe(true);
    expect(at(1024, 768)?.compact).toBe(false);
    expect(at(1024, 768)?.captions).toBeDefined();
    expect(at(320, 568)?.compact).toBe(false);
  });
});
