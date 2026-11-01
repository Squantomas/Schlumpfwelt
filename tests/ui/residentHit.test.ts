import { describe, expect, it } from 'vitest';
import { RESIDENT_BODY_Y, RESIDENT_HIT_BOTTOM, RESIDENT_HIT_RADIUS, RESIDENT_HIT_TOP, distanceToResident, residentAt, residentHitRadius } from '../../src/ui/residentHit';
import { MIN_TAP_SIZE } from '../../src/ui/style';

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

  it('gilt auch an Gebäuden: der Bewohner an der Tür gewinnt nahe am Körper, weiter weg gehört der Tipp dem Haus', () => {
    // A worker at the door of a building (the house is above them); 20 and 22 CSS px to the side hit them at every zoom.
    const worker = { id: 2, x: 320, y: 640 };
    for (const zoom of [0.25, 0.5, 1, 2]) {
      for (const css of [20, 22]) {
        for (const side of [-1, 1]) {
          expect(residentAt([worker], { x: worker.x + (side * css) / zoom, y: worker.y - RESIDENT_BODY_Y }, zoom)).toBe(2);
        }
      }
      // The roof two tiles above (well beyond 24 CSS px at zoom 0.5 and more) stays with the house.
      if (zoom >= 0.5) {
        expect(residentAt([worker], { x: worker.x, y: worker.y - 128 }, zoom)).toBeUndefined();
      }
    }
  });
});
