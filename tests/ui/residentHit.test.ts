import { describe, expect, it } from 'vitest';
import { buildingType } from '../../src/data/buildings';
import {
  RESIDENT_BODY_Y,
  RESIDENT_HIT_BOTTOM,
  RESIDENT_HIT_RADIUS,
  RESIDENT_HIT_TOP,
  RESIDENT_REACH_ON_BUILDING,
  distanceToResident,
  residentAt,
  residentHitRadius,
} from '../../src/ui/residentHit';
import { MIN_TAP_SIZE, TILE_SIZE } from '../../src/ui/style';

const ZOOMS = [0.0962, 0.2, 0.25, 0.35, 0.5, 0.75, 1, 1.5, 2, 3];

describe('residentHitRadius', () => {
  it('ist auf dem Schirm nie kleiner als 48 CSS-px im Durchmesser', () => {
    for (const zoom of ZOOMS) {
      expect(2 * residentHitRadius(zoom) * zoom, String(zoom)).toBeGreaterThanOrEqual(MIN_TAP_SIZE - 1e-9);
      expect(residentHitRadius(zoom)).toBeGreaterThanOrEqual(RESIDENT_HIT_RADIUS);
    }
  });

  it('kommt mit einem kaputten Zoom zurecht', () => {
    expect(residentHitRadius(0)).toBe(RESIDENT_HIT_RADIUS);
    expect(residentHitRadius(Number.NaN)).toBe(RESIDENT_HIT_RADIUS);
    expect(residentHitRadius(Number.POSITIVE_INFINITY)).toBe(RESIDENT_HIT_RADIUS);
  });
});

describe('distanceToResident', () => {
  const spot = { id: 1, x: 100, y: 200 };

  it('ist 0 auf der Mittellinie vom Bauch bis zur Mütze', () => {
    expect(distanceToResident(spot, { x: 100, y: 200 - RESIDENT_HIT_TOP })).toBe(0);
    expect(distanceToResident(spot, { x: 100, y: 200 - RESIDENT_HIT_BOTTOM })).toBe(0);
    expect(distanceToResident(spot, { x: 100, y: 180 })).toBe(0);
  });

  it('misst seitlich und über den Enden hinaus', () => {
    expect(distanceToResident(spot, { x: 110, y: 180 })).toBe(10);
    expect(distanceToResident(spot, { x: 100, y: 200 })).toBe(RESIDENT_HIT_BOTTOM);
    expect(distanceToResident(spot, { x: 103, y: 200 - RESIDENT_HIT_TOP - 4 })).toBe(5);
  });
});

describe('residentAt', () => {
  const spots = [
    { id: 1, x: 100, y: 200 },
    { id: 2, x: 160, y: 200 },
    { id: 3, x: 100, y: 230 },
  ];

  it('trifft den Bewohner unter dem Finger', () => {
    expect(residentAt(spots, { x: 160, y: 180 }, 1)).toBe(2);
    expect(residentAt(spots, { x: 101, y: 175 }, 1)).toBe(1);
  });

  it('trifft daneben nichts', () => {
    expect(residentAt(spots, { x: 300, y: 180 }, 1)).toBeUndefined();
    expect(residentAt([], { x: 100, y: 180 }, 1)).toBeUndefined();
  });

  it('nimmt den nächsten, bei gleichem Abstand den vorderen, dann die kleinere Nummer', () => {
    expect(residentAt(spots, { x: 125, y: 180 }, 0.5)).toBe(1);
    expect(residentAt(spots, { x: 135, y: 180 }, 0.5)).toBe(2);
    const same = [
      { id: 7, x: 100, y: 200 },
      { id: 4, x: 100, y: 200 },
      { id: 5, x: 140, y: 200 },
    ];
    expect(residentAt(same, { x: 100, y: 180 }, 1)).toBe(4);
    const behind = [
      { id: 1, x: 90, y: 200 },
      { id: 2, x: 110, y: 230 },
    ];
    // (100, 188) is 10 px from both middle lines.
    expect(residentAt(behind, { x: 100, y: 188 }, 1)).toBe(2);
  });

  it('weit herausgezoomt reicht ein Tipp knapp neben den kleinen Bewohner', () => {
    const one = [{ id: 9, x: 100, y: 200 }];
    // 24 CSS px at zoom 0.4 are 60 world px.
    expect(residentAt(one, { x: 150, y: 180 }, 0.4)).toBe(9);
    expect(residentAt(one, { x: 150, y: 180 }, 1)).toBeUndefined();
  });

  it('trifft jeden Tipp in einem Kreis von 24 CSS-px um die Körpermitte – bei jedem Zoom und in jeder Richtung', () => {
    const spot = { id: 4, x: 500, y: 700 };
    const centre = { x: spot.x, y: spot.y - RESIDENT_BODY_Y };
    expect(RESIDENT_BODY_Y).toBeGreaterThanOrEqual(RESIDENT_HIT_BOTTOM);
    expect(RESIDENT_BODY_Y).toBeLessThanOrEqual(RESIDENT_HIT_TOP);
    for (const zoom of ZOOMS) {
      for (let step = 0; step < 32; step += 1) {
        const angle = (step / 32) * Math.PI * 2;
        for (const css of [0, 12, 20, 22, MIN_TAP_SIZE / 2]) {
          const point = { x: centre.x + (Math.cos(angle) * css) / zoom, y: centre.y + (Math.sin(angle) * css) / zoom };
          expect(residentAt([spot], point, zoom), `Zoom ${String(zoom)}, ${String(css)} px, Richtung ${String(step)}`).toBe(4);
        }
      }
    }
  });

  it('T-A bleibt: 20 und 22 CSS-px neben der Körpermitte treffen auf einem Gebäude ab Zoom 1, sonst bei jedem Zoom', () => {
    // A worker at the door of a building that answers a tap (the building is above them).
    const worker = { id: 2, x: 320, y: 640 };
    for (const zoom of ZOOMS) {
      for (const css of [20, 22]) {
        for (const side of [-1, 1]) {
          const point = { x: worker.x + (side * css) / zoom, y: worker.y - RESIDENT_BODY_Y };
          expect(residentAt([worker], point, zoom), `Wiese, Zoom ${String(zoom)}, ${String(side * css)} px`).toBe(2);
          if (zoom >= 1) {
            expect(residentAt([worker], point, zoom, true), `Gebäude, Zoom ${String(zoom)}, ${String(side * css)} px`).toBe(2);
          }
        }
      }
      // The roof two tiles above stays with the building.
      expect(residentAt([worker], { x: worker.x, y: worker.y - 128 }, zoom, true)).toBeUndefined();
    }
  });
});

describe('auf einem Gebäude, das auf den Tipp antwortet (Korrekturrunde 2)', () => {
  it('reicht der Bewohner höchstens 24 Welt-px weit – ab Zoom 1 sind das weiter die vollen 24 CSS-px', () => {
    for (const zoom of ZOOMS) {
      const radius = residentHitRadius(zoom, true);
      expect(radius, String(zoom)).toBeLessThanOrEqual(RESIDENT_REACH_ON_BUILDING);
      expect(radius, String(zoom)).toBeGreaterThanOrEqual(RESIDENT_HIT_RADIUS);
      expect(radius).toBeLessThanOrEqual(residentHitRadius(zoom));
      if (zoom >= 1) {
        expect(radius * zoom, String(zoom)).toBeGreaterThanOrEqual(MIN_TAP_SIZE / 2 - 1e-9);
      }
    }
    expect(residentHitRadius(Number.NaN, true)).toBe(RESIDENT_HIT_RADIUS);
  });

  for (const zoom of [0.5, 0.25, 0.1]) {
    it(`Zoom ${String(zoom)}: ein Tipp nahe am Körper trifft den Bewohner, einer weiter weg das Gebäude`, () => {
      const worker = { id: 3, x: 800, y: 900 };
      const centre = { x: worker.x, y: worker.y - RESIDENT_BODY_Y };
      // Near the body: 10 world px to the side, on the hat, on the belly.
      for (const point of [
        { x: centre.x + 10, y: centre.y },
        { x: centre.x - 10, y: centre.y },
        { x: worker.x, y: worker.y - RESIDENT_HIT_TOP - 8 },
        { x: worker.x + 12, y: worker.y - RESIDENT_HIT_BOTTOM },
      ]) {
        expect(residentAt([worker], point, zoom, true), JSON.stringify(point)).toBe(3);
      }
      // 30 world px above the hat or beside the body: on a building that is the building's tap – before, the resident
      // took it (24 CSS px are 48, 96 and 240 world px at these zooms).
      for (const point of [
        { x: worker.x, y: worker.y - RESIDENT_HIT_TOP - 30 },
        { x: centre.x + 30, y: centre.y },
      ]) {
        expect(residentAt([worker], point, zoom, true), JSON.stringify(point)).toBeUndefined();
        expect(residentAt([worker], point, zoom), JSON.stringify(point)).toBe(3);
      }
    });
  }

  it('der Händler an der Tür nimmt dem Markt bei keinem Zoom mehr als 3 % der Tippfläche (vorher bei 0,1 fast alles)', () => {
    const market = buildingType('market');
    expect(market).toBeDefined();
    if (!market) {
      return;
    }
    const left = 10 * TILE_SIZE;
    const right = left + market.footprint.w * TILE_SIZE;
    const front = (10 + market.footprint.h) * TILE_SIZE;
    const top = 10 * TILE_SIZE - market.look.rise;
    // On the door tile in front of the middle of the market (feet a little below the middle of the tile).
    const trader = { id: 1, x: left + 1.5 * TILE_SIZE, y: front + 0.62 * TILE_SIZE };
    const share = (zoom: number, onBuilding: boolean): number => {
      let all = 0;
      let taken = 0;
      for (let y = top; y < front; y += 2) {
        for (let x = left; x < right; x += 2) {
          all += 1;
          taken += residentAt([trader], { x, y }, zoom, onBuilding) === undefined ? 0 : 1;
        }
      }
      return taken / all;
    };
    for (const zoom of [1, 0.5, 0.25, 0.1]) {
      expect(share(zoom, true), String(zoom)).toBeLessThanOrEqual(0.03);
    }
    expect(share(0.1, false)).toBeGreaterThan(0.5);
  });
});
