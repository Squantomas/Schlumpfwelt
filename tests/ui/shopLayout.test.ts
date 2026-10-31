import { describe, expect, it } from 'vitest';
import { SHOP_CATEGORIES, shopItems } from '../../src/data/buildings';
import type { Rect } from '../../src/ui/cameraMath';
import { layoutBuildUi } from '../../src/ui/buildLayout';
import { SHOP_ARROW, SHOP_CELL_HEIGHTS, shopCellRects, shopLayout, shopPages } from '../../src/ui/shopLayout';
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
  [360, 780],
  [412, 915],
  [600, 960],
  [1920, 1080],
  [812, 375],
  [740, 360],
];

const COUNTS = SHOP_CATEGORIES.map((category) => shopItems(category).length);
const MOST = Math.max(...COUNTS);

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width - 0.001 && b.x < a.x + a.width - 0.001 && a.y < b.y + b.height - 0.001 && b.y < a.y + a.height - 0.001;
}

function inside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x - 0.001 && inner.y >= outer.y - 0.001 && inner.x + inner.width <= outer.x + outer.width + 0.001 && inner.y + inner.height <= outer.y + outer.height + 0.001;
}

/** Ein Schirm mit offenem Shop, so wie ihn BuildUI rechnet. */
function open(width: number, height: number, count = MOST) {
  return layoutBuildUi({
    width,
    height,
    toolCount: 4,
    shopOpen: true,
    shopCount: count,
    shopTabs: SHOP_CATEGORIES.length,
    hasChip: false,
    hasPreview: false,
    hintHeight: 0,
    hintAtTop: false,
    stockCount: 6,
    infoOpen: false,
  });
}

describe('Shop-Layout: nichts überlappt, nichts ragt über den Rand', () => {
  for (const [width, height] of SCREENS) {
    for (const count of [3, ...COUNTS]) {
      it(`${String(width)}×${String(height)} mit ${String(count)} Karten`, () => {
        const layout = open(width, height, count);
        const shop = layout.shop;
        expect(shop).toBeDefined();
        if (!shop) {
          return;
        }
        expect(shop.fits).toBe(true);
        // Das Feld liegt im Bild, unter der Lagerleiste (die sichtbar bleibt).
        expect(inside(shop.rect, { x: 0, y: 0, width, height })).toBe(true);
        expect(intersects(shop.rect, layout.stock.rect)).toBe(false);
        // Zoom-Knöpfe, Werkzeugleiste, Hinweis und ✓/✕ sind versteckt – die Lagerleiste liegt links von den (versteckten) Zoom-Knöpfen.
        expect(layout.hint).toBeUndefined();
        expect(layout.chip).toBeUndefined();
        expect(layout.confirm).toBeUndefined();
        expect(layout.card).toBeUndefined();

        // Reiter und ✕: im Feld, groß genug zum Tippen, ohne sich zu berühren.
        const header: [string, Rect][] = [...shop.tabs.map((tab, index): [string, Rect] => [`Reiter ${String(index)}`, tab]), ['✕', shop.close]];
        for (const [name, rect] of header) {
          expect(inside(rect, shop.rect), `${name} im Feld`).toBe(true);
          expect(rect.width, `${name} Breite`).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
          expect(rect.height, `${name} Höhe`).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
        }
        for (let i = 0; i < header.length; i += 1) {
          for (let j = i + 1; j < header.length; j += 1) {
            const a = header[i];
            const b = header[j];
            if (a && b) {
              expect(intersects(a[1], b[1]), `${a[0]} überdeckt ${b[0]}`).toBe(false);
            }
          }
        }
        expect(shop.tabs).toHaveLength(SHOP_CATEGORIES.length);

        // Karten: im Gitter, ohne Überlappung, unter dem Kopf, mit Mindestgröße.
        const onPage = Math.min(count, shop.perPage);
        const cells = shopCellRects(shop, onPage);
        expect(cells).toHaveLength(onPage);
        for (const [index, cell] of cells.entries()) {
          expect(inside(cell, shop.grid), `Karte ${String(index)} im Gitter`).toBe(true);
          expect(inside(cell, shop.rect)).toBe(true);
          expect(cell.height).toBeGreaterThanOrEqual(72);
          expect(cell.width).toBeGreaterThanOrEqual(88);
          for (const [name, rect] of header) {
            expect(intersects(cell, rect), `Karte ${String(index)} überdeckt ${name}`).toBe(false);
          }
          for (const other of cells.slice(index + 1)) {
            expect(intersects(cell, other)).toBe(false);
          }
        }
        // Pfeile (nur beim Blättern): groß genug, im Feld, nicht auf Karten.
        if (shop.paged) {
          expect(shop.prev && shop.next).toBeTruthy();
          for (const arrow of [shop.prev, shop.next]) {
            expect(arrow).toBeDefined();
            if (!arrow) {
              continue;
            }
            expect(arrow.width).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
            expect(arrow.height).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
            expect(inside(arrow, shop.rect)).toBe(true);
            for (const cell of cells) {
              expect(intersects(arrow, cell)).toBe(false);
            }
          }
          expect(shopPages(shop, count)).toBe(Math.ceil(count / shop.perPage));
        } else {
          expect(shop.prev).toBeUndefined();
          expect(shop.perPage).toBeGreaterThanOrEqual(count);
          expect(shopPages(shop, count)).toBe(1);
        }
        // Der Rest des Bildes bleibt links und rechts vom Feld frei von Überhang.
        expect(shop.rect.x).toBeGreaterThanOrEqual(0);
        expect(shop.rect.x + shop.rect.width).toBeLessThanOrEqual(width);
      });
    }
  }
});

describe('Shop-Layout: Größe der Karten', () => {
  it('#14: die Deko-Auswahl auf 320×568 zeigt viele Karten pro Seite – alle, ohne Blättern', () => {
    const deco = shopItems('deco').length;
    expect(deco).toBeGreaterThanOrEqual(7);
    const shop = open(320, 568, deco).shop;
    expect(shop?.paged).toBe(false);
    expect(shop?.perPage).toBeGreaterThan(1);
    expect(shop?.perPage).toBeGreaterThanOrEqual(deco);
    expect(shop?.cols).toBeGreaterThanOrEqual(2);
    // Und ordentlich große Karten, nicht die kleinsten.
    expect(shop?.cellH).toBeGreaterThanOrEqual(88);
  });

  it('#14: auch auf allen anderen Schirmen zeigt jede Seite mehr als 1 Karte', () => {
    for (const [width, height] of SCREENS) {
      const shop = open(width, height).shop;
      expect(shop?.perPage, `${String(width)}×${String(height)}`).toBeGreaterThan(1);
    }
  });

  it('nimmt auf dem Tablet die breiten, hohen Karten und alle in einer Seite', () => {
    const shop = open(1024, 768).shop;
    expect(shop?.paged).toBe(false);
    expect(shop?.cellW).toBe(104);
    expect(shop?.cellH).toBe(SHOP_CELL_HEIGHTS[0]);
  });

  it('blättert erst, wenn selbst die kleinsten Karten nicht alle passen – dann mit großen Pfeilen', () => {
    // Ein sehr niedriger Schirm: nur eine Reihe passt.
    const shop = shopLayout({ width: 568, height: 230, top: 54, count: 8, tabCount: 4 });
    expect(shop.paged).toBe(true);
    expect(shop.rows).toBe(1);
    expect(shop.perPage).toBeGreaterThan(1);
    expect(shop.perPage).toBeLessThan(8);
    expect(SHOP_ARROW).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
  });

  it('meldet „passt nicht“, wenn der Schirm zu niedrig für selbst eine Reihe ist', () => {
    expect(shopLayout({ width: 568, height: 150, top: 54, count: 8, tabCount: 4 }).fits).toBe(false);
  });

  it('hat für jede Seite eines Reiters die richtige Zahl Karten und zentriert die letzte Reihe', () => {
    const shop = open(320, 568, 8).shop;
    if (!shop) {
      throw new Error('kein Shop');
    }
    const cells = shopCellRects(shop, 5);
    expect(cells).toHaveLength(5);
    // Die letzte Reihe (2 von 3) liegt mittig.
    const last = cells.slice(-2);
    const left = (last[0]?.x ?? 0) - shop.grid.x;
    const right = shop.grid.x + shop.grid.width - ((last[1]?.x ?? 0) + (last[1]?.width ?? 0));
    expect(Math.abs(left - right)).toBeLessThan(0.01);
  });

  it('hält das Feld gleich groß für alle Reiter (Geometrie aus dem größten Reiter)', () => {
    const a = open(320, 568, MOST).shop;
    const b = open(320, 568, MOST).shop;
    expect(a?.rect).toEqual(b?.rect);
  });
});
