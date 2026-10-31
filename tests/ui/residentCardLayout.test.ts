import { describe, expect, it } from 'vitest';
import type { Rect } from '../../src/ui/cameraMath';
import { layoutBuildUi } from '../../src/ui/buildLayout';
import { residentCardLayout } from '../../src/ui/residentCardLayout';

const SCREENS = [
  [320, 568],
  [568, 320],
  [640, 360],
  [360, 640],
  [1024, 768],
  [768, 1024],
  [1280, 800],
  [390, 844],
  [844, 390],
  [320, 480],
  [1366, 1024],
] as const;

function cardOf(width: number, height: number) {
  const layout = layoutBuildUi({
    width,
    height,
    toolCount: 4,
    stockCount: 6,
    shopOpen: false,
    shopCount: 6,
    shopTabs: 4,
    hasChip: false,
    hasPreview: false,
    hintAtTop: false,
    hasMenu: false,
    infoOpen: true,
    hintHeight: 0,
  });
  return layout.card;
}

const inside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x - 0.001 && inner.y >= outer.y - 0.001 && inner.x + inner.width <= outer.x + outer.width + 0.001 && inner.y + inner.height <= outer.y + outer.height + 0.001;

const overlap = (a: Rect, b: Rect): boolean => a.x < b.x + b.width - 0.001 && b.x < a.x + a.width - 0.001 && a.y < b.y + b.height - 0.001 && b.y < a.y + a.height - 0.001;

describe('residentCardLayout', () => {
  it('legt Bild und Zeilen in die Karte, unter den Namen und ohne Überlappung – auf allen Schirmen, auf die die Karte passt', () => {
    for (const [width, height] of SCREENS) {
      const card = cardOf(width, height);
      expect(card, `${String(width)}×${String(height)}`).toBeDefined();
      if (!card?.fits) {
        continue;
      }
      const layout = residentCardLayout(card);
      const parts = [layout.picture, ...layout.lines];
      for (const part of parts) {
        expect(inside(part, card.rect), `${String(width)}×${String(height)}`).toBe(true);
        expect(overlap(part, card.name) || overlap(part, card.close), `${String(width)}×${String(height)}`).toBe(false);
      }
      for (let i = 0; i < parts.length; i += 1) {
        for (let j = i + 1; j < parts.length; j += 1) {
          expect(overlap(parts[i] as Rect, parts[j] as Rect), `${String(width)}×${String(height)} ${String(i)}/${String(j)}`).toBe(false);
        }
      }
    }
  });

  it('zeigt das Bild groß genug und lässt jeder Zeile Platz für mindestens 12-px-Schrift', () => {
    for (const [width, height] of SCREENS) {
      const card = cardOf(width, height);
      if (!card?.fits) {
        continue;
      }
      const layout = residentCardLayout(card);
      expect(layout.picture.width, `${String(width)}×${String(height)}`).toBeGreaterThanOrEqual(56);
      expect(layout.lineFont).toBeGreaterThanOrEqual(12);
      for (const line of layout.lines) {
        expect(line.height, `${String(width)}×${String(height)}`).toBeGreaterThanOrEqual(16);
        expect(line.width, `${String(width)}×${String(height)}`).toBeGreaterThanOrEqual(150);
      }
      // The activity can wrap: it gets at least as much room as one line.
      expect(layout.lines[3].height).toBeGreaterThanOrEqual(layout.lines[0].height - 0.001);
    }
  });

  it('stellt das Bild links neben die Zeilen', () => {
    const card = cardOf(1024, 768);
    if (!card) {
      throw new Error('no card');
    }
    const layout = residentCardLayout(card);
    for (const line of layout.lines) {
      expect(line.x).toBeGreaterThan(layout.picture.x + layout.picture.width);
    }
  });
});
