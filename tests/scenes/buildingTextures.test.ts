import { describe, expect, it } from 'vitest';
import { BUILDING_SHAPES, BUILDING_TYPES } from '../../src/data/buildings';
import { DRAWN_SHAPES, buildingOrigin, buildingTextureSize } from '../../src/scenes/island/buildingTextures';
import { TILE_SIZE } from '../../src/ui/style';

describe('Platzhalterbilder der Bautypen', () => {
  it('jede Form aus buildings.json (außer dem Weg) hat eine Zeichnung – sonst zeigt der Shop ein leeres Bild', () => {
    for (const type of BUILDING_TYPES) {
      if (type.category !== 'path') {
        expect(DRAWN_SHAPES, `${type.id}: ${type.look.shape}`).toContain(type.look.shape);
      }
    }
  });

  it('jede erlaubte Form (außer dem Weg) wird gezeichnet und von mindestens einem Typ benutzt', () => {
    for (const shape of BUILDING_SHAPES) {
      if (shape !== 'path') {
        expect(DRAWN_SHAPES, shape).toContain(shape);
        expect(BUILDING_TYPES.some((type) => type.look.shape === shape), shape).toBe(true);
      }
    }
  });

  it('die Textur reicht über den Grundriss (Breite und Höhe in Welt-Pixeln) und liegt auf dem Boden der Kachel', () => {
    for (const type of BUILDING_TYPES) {
      const { width, height } = buildingTextureSize(type);
      expect(width, type.id).toBeGreaterThanOrEqual(type.footprint.w * TILE_SIZE);
      expect(height, type.id).toBeGreaterThanOrEqual(type.footprint.h * TILE_SIZE);
      const origin = buildingOrigin(type);
      expect(origin.x).toBe(0.5);
      expect(origin.y).toBeGreaterThan(0.5);
      expect(origin.y).toBeLessThan(1);
    }
  });
});
