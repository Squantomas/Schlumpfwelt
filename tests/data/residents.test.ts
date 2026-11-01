import { describe, expect, it } from 'vitest';
import { BUILDING_TYPES, INVITE_TYPE_ID, buildingType, capacityOf, shopCategoryOf, typesOf } from '../../src/data/buildings';
import { HAT_IDS, MAX_NAME_LENGTH, RESIDENT_NAMES, RESIDENT_RULES } from '../../src/data/residents';
import texts from '../../src/data/texts.de.json';
import { MAX_PRODUCERS, MAX_RESIDENTS } from '../../src/sim/limits';
import { HAT_COLORS } from '../../src/ui/style';

describe('residents.json und names.json', () => {
  it('hat 64 verschiedene, kurze Vornamen', () => {
    expect(RESIDENT_NAMES).toHaveLength(64);
    expect(new Set(RESIDENT_NAMES).size).toBe(RESIDENT_NAMES.length);
    for (const name of RESIDENT_NAMES) {
      expect(name.length, name).toBeGreaterThan(1);
      // Room for " 2", " 3" … when every name is taken.
      expect(name.length, name).toBeLessThanOrEqual(MAX_NAME_LENGTH - 4);
    }
  });

  it('jede Mützenfarbe hat eine Farbe und einen Text', () => {
    expect(HAT_IDS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(HAT_IDS).size).toBe(HAT_IDS.length);
    for (const id of HAT_IDS) {
      expect(HAT_COLORS[id], id).toBeDefined();
      expect(Object.keys(texts), id).toContain(`hat.${id}`);
    }
  });

  it('hat sinnvolle Zahlen: auf Wegen schneller, Wege am billigsten, Gebäude am teuersten; alles ganze Zahlen über 0', () => {
    const { walk, boat, routine } = RESIDENT_RULES;
    const costs = [walk.cost.path, walk.cost.ground, walk.cost.rough, walk.cost.building];
    const times = [routine.workTicks, routine.restTicks, routine.visitTicks, routine.waitTicks, routine.tripsBeforeRest];
    for (const value of [walk.stepsPerTile, walk.pathSpeed, walk.groundSpeed, boat.speed, ...costs, ...times]) {
      expect(Number.isInteger(value) && value > 0).toBe(true);
    }
    expect(walk.pathSpeed).toBeGreaterThan(walk.groundSpeed);
    expect(walk.pathSpeed).toBeLessThan(walk.stepsPerTile);
    expect(boat.speed).toBeLessThan(walk.stepsPerTile);
    expect(walk.cost.path).toBeLessThan(walk.cost.ground);
    expect(walk.cost.ground).toBeLessThan(walk.cost.rough);
    expect(walk.cost.rough).toBeLessThan(walk.cost.building);
  });
});

describe('Bewohner in buildings.json', () => {
  it('jedes Haus hat Platz für Bewohner (das große mehr als die kleinen), alles andere keinen', () => {
    for (const house of typesOf('house')) {
      expect(capacityOf(house.id), house.id).toBeGreaterThanOrEqual(1);
    }
    expect(capacityOf('house-big')).toBeGreaterThan(capacityOf('house-red'));
    for (const type of BUILDING_TYPES.filter((t) => t.category !== 'house')) {
      expect(capacityOf(type.id), type.id).toBe(0);
    }
  });

  it('jedes Produktionsgebäude nennt den Beruf seines Arbeiters (mit Text)', () => {
    const jobs = typesOf('production').map((type) => type.jobKey);
    expect(jobs).toHaveLength(6);
    expect(new Set(jobs).size).toBe(6);
    for (const key of jobs) {
      expect(key).toBeDefined();
      expect(Object.keys(texts)).toContain(key);
    }
    expect(buildingType('lumberjack')?.jobKey).toBe('job.lumberjack');
    expect(buildingType('market')?.jobKey).toBe('job.trader');
  });

  it('die Einladung ist ein Artikel im Reiter Häuser, kostet Taler und ist nie gesperrt', () => {
    const invite = buildingType(INVITE_TYPE_ID);
    expect(invite?.category).toBe('resident');
    expect(shopCategoryOf(INVITE_TYPE_ID)).toBe('houses');
    expect(invite?.cost['coins']).toBeGreaterThan(0);
    expect(invite?.unlock).toBeUndefined();
    expect(BUILDING_TYPES.filter((type) => type.category === 'resident')).toHaveLength(1);
  });

  it('es gibt mehr Platz für Bewohner als Produktionsgebäude: jedes findet immer einen Arbeiter', () => {
    expect(MAX_RESIDENTS).toBeGreaterThan(MAX_PRODUCERS);
  });
});
