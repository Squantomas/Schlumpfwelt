import { describe, expect, it } from 'vitest';
import { LANDING_MARGIN, RECT_MARGIN, glideAllowed, landingGlide, rectGlide } from '../../src/ui/boatCamera';

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

  it('fährt auch hin, wenn nur die Anlegestelle im Bild ist und das Boot von außerhalb käme', () => {
    const view = { centerX: 1000, centerY: 1000, zoom: 0.5 };
    // The shore is in the picture (screen x 862), the start 448 world px further right is not (screen x 1086).
    const shore = { x: 1700, y: 1000 };
    const start = { x: 2148, y: 1000 };
    const target = landingGlide(view, TABLET, BAND, shore, start);
    expect(target).toBeDefined();
    if (!target) {
      return;
    }
    expect(target.x).toBeCloseTo((shore.x + start.x) / 2, 6);
    expect(landingGlide({ centerX: target.x, centerY: target.y, zoom: view.zoom }, TABLET, BAND, shore, start)).toBeUndefined();
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

describe('glideAllowed (Korrekturrunde 2)', () => {
  const looking = { tool: 'view', shopOpen: false, menuOpen: false, lostOpen: false, cardOpen: false, gestureActive: false };

  it('fährt nur beim Anschauen ohne offenes Feld', () => {
    expect(glideAllowed(looking)).toBe(true);
  });

  it('nicht beim Bauen, Verschieben, Abreißen, im Shop, im Menü, mit der Ebene „Hier weiterspielen“ oder einer offenen Karte', () => {
    for (const tool of ['place', 'path', 'move', 'demolish', 'shop']) {
      expect(glideAllowed({ ...looking, tool }), tool).toBe(false);
    }
    expect(glideAllowed({ ...looking, shopOpen: true })).toBe(false);
    expect(glideAllowed({ ...looking, menuOpen: true })).toBe(false);
    expect(glideAllowed({ ...looking, lostOpen: true })).toBe(false);
    expect(glideAllowed({ ...looking, cardOpen: true })).toBe(false);
  });

  it('nie, solange ein Finger auf der Welt liegt – etwa beim Tragen eines Bewohners (Korrekturrunde 1)', () => {
    expect(glideAllowed({ ...looking, gestureActive: true })).toBe(false);
  });
});

describe('rectGlide: ein angetipptes Haus unter der Hinweisleiste kommt ins Bild (Korrekturrunde 1)', () => {
  const view = { centerX: 1000, centerY: 1000, zoom: 1 };
  /** The world rect that lies at these screen coordinates (CSS px) with `view` on the tablet. */
  const at = (x: number, y: number, width: number, height: number) => ({ x: x - 512 + 1000, y: y - 384 + 1000, width, height });

  it('bewegt nichts, wenn das Haus im freien Teil liegt', () => {
    expect(rectGlide(view, TABLET, BAND, at(300, 200, 128, 200))).toBeUndefined();
    expect(rectGlide(view, TABLET, BAND, at(RECT_MARGIN, BAND.top + RECT_MARGIN, 128, 200))).toBeUndefined();
  });

  it('fährt hin, wenn das Dach unter der Hinweisleiste oder das Haus unter der Werkzeugleiste liegt – danach ist es frei', () => {
    for (const rect of [at(300, 20, 128, 200), at(300, 600, 128, 200), at(-60, 300, 128, 200), at(960, 300, 128, 200)]) {
      const target = rectGlide(view, TABLET, BAND, rect);
      expect(target).toBeDefined();
      if (!target) {
        return;
      }
      const after = { centerX: target.x, centerY: target.y, zoom: view.zoom };
      expect(rectGlide(after, TABLET, BAND, rect)).toBeUndefined();
      // The middle of the house is in the middle of the free band.
      const middleY = (rect.y + rect.height / 2 - after.centerY) * after.zoom + TABLET.height / 2;
      expect(middleY).toBeCloseTo((BAND.top + BAND.bottom) / 2, 6);
    }
  });

  it('auch weit herausgezoomt auf dem Handy, und mit kaputtem Zoom oder Schirm nichts', () => {
    const far = { centerX: 1000, centerY: 1000, zoom: 0.5 };
    const band = { top: 110, bottom: 470 };
    const rect = { x: 1000 - 100, y: 1000 - 568, width: 128, height: 200 };
    const target = rectGlide(far, PHONE, band, rect);
    expect(target).toBeDefined();
    if (target) {
      expect(rectGlide({ centerX: target.x, centerY: target.y, zoom: 0.5 }, PHONE, band, rect)).toBeUndefined();
    }
    expect(rectGlide({ centerX: 0, centerY: 0, zoom: 0 }, TABLET, BAND, rect)).toBeUndefined();
    expect(rectGlide(view, { width: 0, height: 0 }, BAND, rect)).toBeUndefined();
  });
});
