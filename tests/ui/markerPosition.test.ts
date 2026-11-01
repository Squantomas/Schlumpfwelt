import { describe, expect, it } from 'vitest';
import { homeLabelY, markerY } from '../../src/ui/markerPosition';

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

describe('homeLabelY: das „2/2“ über dem Haus bleibt lesbar (Korrekturrunde 1)', () => {
  const box = { x: 500, halfWidth: 20, top: 300, bottom: 380 };

  it('steht über dem Dach, solange niemand darüber getragen wird', () => {
    expect(homeLabelY(350, 500, 30, 40, 0)).toBe(350);
    // A figure beside the label, or wholly below or above it, changes nothing.
    expect(homeLabelY(350, 500, 30, 40, 0, [{ ...box, x: 600 }])).toBe(350);
    expect(homeLabelY(350, 500, 30, 40, 0, [{ ...box, top: 360, bottom: 440 }])).toBe(350);
    expect(homeLabelY(350, 500, 30, 40, 0, [{ ...box, top: 200, bottom: 300 }, undefined])).toBe(350);
  });

  it('weicht über die getragene Figur (samt Herz) aus, wenn sie das Dach verdeckt', () => {
    expect(homeLabelY(350, 500, 30, 40, 0, [box])).toBe(298);
    expect(homeLabelY(350, 530, 30, 40, 0, [box])).toBe(298);
  });

  it('weicht über das Schild „Weg fehlt“ aus, und über die Figur, die darüber hängt', () => {
    const sign = { x: 500, halfWidth: 23, top: 290, bottom: 352 };
    expect(homeLabelY(350, 500, 30, 40, 0, [sign])).toBe(288);
    // Sign and figure, in either order: the label ends above both.
    const above = { x: 510, halfWidth: 20, top: 220, bottom: 300 };
    expect(homeLabelY(350, 500, 30, 40, 0, [sign, above])).toBe(218);
    expect(homeLabelY(350, 500, 30, 40, 0, [above, sign])).toBe(218);
    // A figure well above the sign does not push it further.
    expect(homeLabelY(350, 500, 30, 40, 0, [sign, { ...above, top: 100, bottom: 200 }])).toBe(288);
  });

  it('bleibt unter der Hinweisleiste', () => {
    expect(homeLabelY(350, 500, 30, 40, 280, [box])).toBe(320);
    expect(homeLabelY(100, 500, 30, 40, 200)).toBe(240);
  });
});
