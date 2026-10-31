import { describe, expect, it } from 'vitest';
import { RESIDENT_HIT_BOTTOM, RESIDENT_HIT_RADIUS, RESIDENT_HIT_TOP, distanceToResident, residentAt, residentHitRadius } from '../../src/ui/residentHit';
import { MIN_TAP_SIZE } from '../../src/ui/style';

describe('residentHitRadius', () => {
  it('ist auf dem Schirm nie kleiner als 48 CSS-px im Durchmesser', () => {
    for (const zoom of [0.2, 0.35, 0.5, 0.75, 1, 1.5, 2, 3]) {
      expect(2 * residentHitRadius(zoom, false) * zoom, String(zoom)).toBeGreaterThanOrEqual(MIN_TAP_SIZE - 1e-9);
      expect(residentHitRadius(zoom, false)).toBeGreaterThanOrEqual(RESIDENT_HIT_RADIUS);
    }
  });

  it('auf einem Gebäude zählt nur der Körper', () => {
    expect(residentHitRadius(0.3, true)).toBe(RESIDENT_HIT_RADIUS);
  });

  it('kommt mit einem kaputten Zoom zurecht', () => {
    expect(residentHitRadius(0, false)).toBe(RESIDENT_HIT_RADIUS);
    expect(residentHitRadius(Number.NaN, false)).toBe(RESIDENT_HIT_RADIUS);
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
    // On a building only the body counts.
    expect(residentAt(one, { x: 150, y: 180 }, 0.4, true)).toBeUndefined();
    expect(residentAt(one, { x: 110, y: 180 }, 0.4, true)).toBe(9);
  });
});
