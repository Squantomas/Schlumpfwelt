import { describe, expect, it } from 'vitest';
import { CARD_CLOSE, flowSlots, infoCardLayout } from '../../src/ui/infoCardLayout';

describe('flowSlots', () => {
  const flow = { x: 100, y: 50, width: 400, height: 60 };

  it('stellt „braucht“ links vom Pfeil und „macht“ rechts davon auf, in einer Reihe', () => {
    const slots = flowSlots(flow, 2, 1);
    expect(slots.needs).toHaveLength(2);
    expect(slots.makes).toHaveLength(1);
    expect(slots.arrow).toBeDefined();
    const arrowX = slots.arrow?.x ?? 0;
    for (const spot of slots.needs) {
      expect(spot.x).toBeLessThan(arrowX);
      expect(spot.y).toBe(80);
    }
    for (const spot of slots.makes) {
      expect(spot.x).toBeGreaterThan(arrowX);
    }
    const xs = slots.needs.map((spot) => spot.x);
    expect(xs[0]).toBeLessThan(xs[1] ?? 0);
  });

  it('lässt die Bilder im Feld und ohne Überlappung (Slot-Breite)', () => {
    for (const [needs, makes] of [[1, 1], [2, 1], [3, 2], [0, 1], [2, 3]] as const) {
      const slots = flowSlots(flow, needs, makes);
      const all = [...slots.needs, ...slots.makes].map((spot) => spot.x).sort((a, b) => a - b);
      for (const x of all) {
        expect(x - slots.slot / 2).toBeGreaterThanOrEqual(flow.x - 0.001);
        expect(x + slots.slot / 2).toBeLessThanOrEqual(flow.x + flow.width + 0.001);
      }
      for (let i = 1; i < all.length; i += 1) {
        expect((all[i] ?? 0) - (all[i - 1] ?? 0)).toBeGreaterThanOrEqual(slots.slot - 0.001);
      }
    }
  });

  it('stellt ohne „braucht“ nur das Erzeugnis in die Mitte, ohne Pfeil', () => {
    const slots = flowSlots(flow, 0, 1);
    expect(slots.arrow).toBeUndefined();
    expect(slots.makes[0]?.x).toBe(300);
  });
});

describe('infoCardLayout', () => {
  it('hat ein ✕ von mindestens 64 px rechts oben in der Karte', () => {
    const layout = infoCardLayout({ top: 100, bottom: 600, width: 1024, zoom: { x: 940, y: 16, width: 68, height: 148 } });
    expect(CARD_CLOSE).toBeGreaterThanOrEqual(64);
    expect(layout.close.width).toBe(CARD_CLOSE);
    expect(layout.close.x + layout.close.width).toBeLessThanOrEqual(layout.rect.x + layout.rect.width);
    expect(layout.close.y).toBeGreaterThanOrEqual(layout.rect.y);
  });

  it('weicht den Zoom-Knöpfen nach unten aus, wenn darunter Platz ist, und sonst nach links', () => {
    const zoom = { x: 236, y: 16, width: 68, height: 148 };
    const tall = infoCardLayout({ top: 90, bottom: 400, width: 320, zoom });
    expect(tall.rect.y).toBeGreaterThanOrEqual(zoom.y + zoom.height);
    expect(tall.rect.width).toBeGreaterThan(280);
    const low = infoCardLayout({ top: 50, bottom: 222, width: 568, zoom: { x: 500, y: 12, width: 56, height: 120 } });
    expect(low.compact).toBe(true);
    expect(low.rect.x + low.rect.width).toBeLessThanOrEqual(500);
  });

  it('meldet, wenn der Platz für eine Karte nicht reicht', () => {
    const layout = infoCardLayout({ top: 100, bottom: 160, width: 400, zoom: { x: 330, y: 10, width: 60, height: 100 } });
    expect(layout.fits).toBe(false);
  });
});
