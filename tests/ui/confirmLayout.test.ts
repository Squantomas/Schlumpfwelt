import { describe, expect, it } from 'vitest';
import { CANCEL_DIAMETER, CONFIRM_DIAMETER, placeConfirmButtons } from '../../src/ui/confirmLayout';

describe('placeConfirmButtons', () => {
  it('macht beide Knöpfe mindestens 64 px groß, ✓ größer als ✕', () => {
    expect(CONFIRM_DIAMETER).toBeGreaterThanOrEqual(64);
    expect(CANCEL_DIAMETER).toBeGreaterThanOrEqual(64);
    expect(CONFIRM_DIAMETER).toBeGreaterThan(CANCEL_DIAMETER);
  });

  it('setzt ✓ unten rechts über die Werkzeugleiste, ✕ links daneben', () => {
    const placement = placeConfirmButtons(1024, 650);
    expect(placement.confirm.x + CONFIRM_DIAMETER / 2).toBeLessThanOrEqual(1024);
    expect(placement.confirm.x).toBeGreaterThan(placement.cancel.x);
    expect(placement.confirm.y).toBe(placement.cancel.y);
    expect(placement.confirm.y + CONFIRM_DIAMETER / 2).toBeLessThanOrEqual(650);
  });

  it('hängt nicht vom Objekt ab: gleicher Platz bei gleicher Bildschirmgröße', () => {
    expect(placeConfirmButtons(1024, 650)).toEqual(placeConfirmButtons(1024, 650));
  });

  it('bleibt auf schmalen Bildschirmen (320 px) im Bild und lässt links Platz', () => {
    const placement = placeConfirmButtons(320, 600);
    expect(placement.left).toBeGreaterThanOrEqual(100);
    expect(placement.cancel.x - CANCEL_DIAMETER / 2).toBeGreaterThanOrEqual(0);
    expect(placement.confirm.x + CONFIRM_DIAMETER / 2).toBeLessThanOrEqual(320);
  });

  it('wandert mit der Oberkante der Leiste mit', () => {
    const low = placeConfirmButtons(768, 900);
    const high = placeConfirmButtons(768, 700);
    expect(low.confirm.y - high.confirm.y).toBe(200);
  });
});
