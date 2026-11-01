import { describe, expect, it } from 'vitest';
import { BUILDING_SHAPES, BUILDING_TYPES, buildingType, typesOf } from '../../src/data/buildings';
import texts from '../../src/data/texts.de.json';
import { HOUSE_PALETTES } from '../../src/ui/style';

describe('buildings.json', () => {
  it('hat nur Typen mit bekannter Kategorie, Größe und Optik', () => {
    for (const type of BUILDING_TYPES) {
      expect(['path', 'house', 'deco', 'production', 'island', 'resident'], type.id).toContain(type.category);
      expect(Number.isInteger(type.footprint.w) && type.footprint.w >= 1, type.id).toBe(true);
      expect(Number.isInteger(type.footprint.h) && type.footprint.h >= 1, type.id).toBe(true);
      if (type.category === 'resident') {
        // Nur die Einladung eines Bewohners (M6) steht nirgends: sie wird nicht auf die Karte gesetzt.
        expect(type.terrains, type.id).toEqual([]);
      } else {
        expect(type.terrains.length, type.id).toBeGreaterThan(0);
      }
      expect(BUILDING_SHAPES as readonly string[], type.id).toContain(type.look.shape);
      expect(type.look.rise, type.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('verweist auf vorhandene Texte', () => {
    for (const type of BUILDING_TYPES) {
      expect(Object.keys(texts), type.id).toContain(type.nameKey);
    }
  });

  it('verweist auf vorhandene Farbpaletten', () => {
    for (const type of BUILDING_TYPES) {
      if (type.look.palette !== undefined) {
        expect(Object.keys(HOUSE_PALETTES), type.id).toContain(type.look.palette);
      }
    }
    for (const house of typesOf('house')) {
      expect(house.look.palette, house.id).toBeDefined();
    }
  });

  it('hat den Weg als eigenen Typ und findet Typen nach id', () => {
    expect(buildingType('path')?.category).toBe('path');
    expect(buildingType('house-red')?.category).toBe('house');
    expect(buildingType('nope')).toBeUndefined();
  });
});
