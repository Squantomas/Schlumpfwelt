import { describe, expect, it } from 'vitest';
import { LANDING_MARGIN, landingGlide } from '../../src/ui/boatCamera';

const TABLET = { width: 1024, height: 768 };
const PHONE = { width: 320, height: 568 };
const BAND = { top: 70, bottom: 660 };

describe('landingGlide', () => {
  it('bewegt nichts, wenn die Anlegestelle schon gut im Bild ist', () => {
    const view = { centerX: 1000, centerY: 1000, zoom: 0.5 };
    expect(landingGlide(view, TABLET, BAND, { x: 1200, y: 900 }, { x: 1600, y: 900 })).toBeUndefined();
  });

  it('fährt hin, wenn die Anlegestelle außerhalb liegt – die Mitte der Bootsfahrt kommt in die Mitte des freien Bands', () => {
    const view = { centerX: 1000, centerY: 1000, zoom: 0.5 };
    const shore = { x: 3000, y: 1000 };
    const start = { x: 3448, y: 1000 };
    const target = landingGlide(view, TABLET, BAND, shore, start);
    expect(target).toBeDefined();
    if (!target) {
      return;
    }
    const after = { centerX: target.x, centerY: target.y, zoom: view.zoom };
    const screen = (p: { x: number; y: number }) => ({ x: (p.x - after.centerX) * after.zoom + TABLET.width / 2, y: (p.y - after.centerY) * after.zoom + TABLET.height / 2 });
    const middle = screen({ x: (shore.x + start.x) / 2, y: (shore.y + start.y) / 2 });
    expect(middle.x).toBeCloseTo(TABLET.width / 2, 6);
    expect(middle.y).toBeCloseTo((BAND.top + BAND.bottom) / 2, 6);
    // Afterwards the shore and where the boat comes into sight are both in the free band.
    for (const point of [screen(shore), screen(start)]) {
      expect(point.x).toBeGreaterThan(0);
      expect(point.x).toBeLessThan(TABLET.width);
      expect(point.y).toBeGreaterThan(BAND.top);
      expect(point.y).toBeLessThan(BAND.bottom);
    }
    expect(landingGlide(after, TABLET, BAND, shore, start)).toBeUndefined();
  });

  it('eine Anlegestelle unter der Leiste oben oder am Rand zählt als nicht im Bild', () => {
    const view = { centerX: 1000, centerY: 1000, zoom: 1 };
    // Under the store bar (screen y 40).
    expect(landingGlide(view, TABLET, BAND, { x: 1000, y: 1000 - 384 + 40 }, { x: 1000, y: 200 })).toBeDefined();
    // Right at the edge.
    expect(landingGlide(view, TABLET, BAND, { x: 1000 + 512 - LANDING_MARGIN / 2, y: 1000 }, { x: 1800, y: 1000 })).toBeDefined();
  });

  it('auf dem Handy liegt nach dem Fahren die Anlegestelle im Bild', () => {
    const view = { centerX: 1000, centerY: 1000, zoom: 0.5 };
    const band = { top: 110, bottom: 470 };
    const shore = { x: 2000, y: 1400 };
    const start = { x: 2000, y: 1848 };
    const target = landingGlide(view, PHONE, band, shore, start);
    expect(target).toBeDefined();
    if (!target) {
      return;
    }
    expect(landingGlide({ centerX: target.x, centerY: target.y, zoom: 0.5 }, PHONE, band, shore, start)).toBeUndefined();
  });

  it('kommt mit einem kaputten Zoom oder Schirm zurecht', () => {
    expect(landingGlide({ centerX: 0, centerY: 0, zoom: 0 }, TABLET, BAND, { x: 5000, y: 0 }, { x: 5000, y: 0 })).toBeUndefined();
    expect(landingGlide({ centerX: 0, centerY: 0, zoom: 1 }, { width: 0, height: 0 }, BAND, { x: 5000, y: 0 }, { x: 5000, y: 0 })).toBeUndefined();
  });
});
