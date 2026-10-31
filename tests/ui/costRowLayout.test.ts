import { describe, expect, it } from 'vitest';
import { BUILDING_TYPES } from '../../src/data/buildings';
import { formatNumber } from '../../src/data/texts';
import { COST_MIN_FONT, costRowLayout } from '../../src/ui/costRowLayout';
import { SHOP_CELL_HEIGHTS, SHOP_CELL_WIDTHS } from '../../src/ui/shopLayout';

describe('costRowLayout: Zahlen nie kleiner als 13 px', () => {
  // Breite der Zeile = Kartenbreite minus Rand (SquareButton), Höhe: kleinste und größte Karte.
  for (const cellW of SHOP_CELL_WIDTHS) {
    for (const cellH of SHOP_CELL_HEIGHTS) {
      it(`bei jedem Bautyp passt die Kostenzeile in eine Karte ${String(cellW)}×${String(cellH)}`, () => {
        const rowW = cellW - 8;
        const rowH = cellH * 0.3 * 0.8;
        for (const type of BUILDING_TYPES) {
          const entries = Object.entries(type.cost).map(([id, amount]) => ({ id, text: formatNumber(amount) }));
          const layout = costRowLayout(rowW, rowH, entries);
          expect(layout.fontSize, type.id).toBeGreaterThanOrEqual(COST_MIN_FONT);
          expect(layout.fits, type.id).toBe(true);
          expect(layout.iconSize, type.id).toBeGreaterThanOrEqual(10);
          for (const item of layout.items) {
            expect(item.iconX, type.id).toBeGreaterThanOrEqual(0);
            expect(item.textX + item.textWidth, type.id).toBeLessThanOrEqual(rowW + 0.001);
          }
          // Reihenfolge ohne Überlappung.
          for (let i = 1; i < layout.items.length; i += 1) {
            const previous = layout.items[i - 1];
            const current = layout.items[i];
            if (previous && current) {
              expect(current.iconX, type.id).toBeGreaterThanOrEqual(previous.textX + previous.textWidth);
            }
          }
        }
      });
    }
  }

  it('verkleinert bei drei Posten (Schreinerei) die Bilder, nicht die Zahlen', () => {
    const entries = [{ id: 'coins', text: '30' }, { id: 'wood', text: '8' }, { id: 'stone', text: '2' }];
    const wide = costRowLayout(96, 22, entries);
    const narrow = costRowLayout(80, 17, entries);
    expect(narrow.fontSize).toBeGreaterThanOrEqual(COST_MIN_FONT);
    expect(narrow.iconSize).toBeLessThanOrEqual(wide.iconSize);
    expect(narrow.fits).toBe(true);
  });

  it('meldet, wenn es nicht passt, und behält trotzdem die Mindestschrift', () => {
    const layout = costRowLayout(30, 17, [{ id: 'coins', text: '12.345' }, { id: 'wood', text: '99.999' }]);
    expect(layout.fits).toBe(false);
    expect(layout.fontSize).toBeGreaterThanOrEqual(COST_MIN_FONT);
  });
});
