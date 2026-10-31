import { describe, expect, it } from 'vitest';
import { markerY } from '../../src/ui/markerPosition';

describe('markerY', () => {
  it('lässt das Schild über dem Dach schweben, wenn das Haus gut im Bild ist', () => {
    expect(markerY(300, 100, 60, 500)).toBe(300);
  });

  it('schiebt das Schild unter die Hinweisleiste, wenn das Haus oben im Bild steht', () => {
    // Das Schild wäre bei y = 90 (zu weit oben), die sichtbare Oberkante ist 100, das Schild 60 hoch.
    expect(markerY(90, 100, 60, 500)).toBe(160);
  });

  it('schiebt das Schild höchstens bis zum Fuß des Hauses', () => {
    expect(markerY(90, 100, 60, 130)).toBe(130);
  });

  it('heftet das Schild nicht an den Bildrand, wenn das Haus weit über dem Bild liegt', () => {
    // Haus 1460 px über der sichtbaren Oberkante: das Schild bleibt am Haus.
    const top = 0;
    const houseBottom = top - 1460;
    const desired = houseBottom - 110;
    const y = markerY(desired, top, 84, houseBottom);
    expect(y).toBe(houseBottom);
    expect(y).toBeLessThan(top - 1000);
  });

  it('lässt ein Schild an seinem Platz, wenn das Haus unter der Oberkante liegt', () => {
    expect(markerY(400, 0, 84, 600)).toBe(400);
  });

  it('funktioniert ohne Hinweisleiste (Oberkante unendlich weit oben)', () => {
    expect(markerY(10, Number.NEGATIVE_INFINITY, 84, 100)).toBe(10);
  });
});
