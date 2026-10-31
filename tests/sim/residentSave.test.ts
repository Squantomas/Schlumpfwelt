import { describe, expect, it } from 'vitest';
import { HAT_IDS, MAX_NAME_LENGTH, RESIDENT_NAMES } from '../../src/data/residents';
import { MAX_ID, MAX_RESIDENTS, MAX_ROUTE } from '../../src/sim/limits';
import { residentSeed } from '../../src/sim/residents';
import { SAVE_VERSION, fromSaveData, loadFromText, migrateV2ToV3, saveToText, toSaveData } from '../../src/sim/saveData';
import { Simulation } from '../../src/sim/simulation';
import { createInitialState, type SimState } from '../../src/sim/state';
import { doorOf, isWalkable } from '../../src/sim/walk';
import { fillTerrain, grassState, run } from './helpers';

/** A small sea island with a path, a market, a berry garden, a house and an invited resident, played for a while. */
function residentVillage(ticks = 120): SimState {
  const state = grassState(24);
  fillTerrain(state, 0, 0, 24, 3, 'water');
  fillTerrain(state, 0, 21, 24, 3, 'water');
  fillTerrain(state, 0, 0, 3, 24, 'water');
  fillTerrain(state, 21, 0, 3, 24, 'water');
  run(
    state,
    { type: 'placePaths', tiles: Array.from({ length: 16 }, (_, i) => ({ x: 4 + i, y: 12 })) },
    { type: 'placeBuilding', buildingType: 'market', x: 16, y: 13 },
    { type: 'placeBuilding', buildingType: 'berry-garden', x: 8, y: 10 },
    { type: 'placeBuilding', buildingType: 'house-big', x: 4, y: 9 },
    { type: 'inviteResident', typeId: 'invite' },
  );
  const sim = new Simulation(state);
  for (let i = 0; i < ticks; i += 1) {
    sim.update(sim.tickMs);
  }
  return structuredClone(sim.state) as SimState;
}

/** The save of `state` with some of its fields replaced (as a plain record, like a file). */
function saveWith(state: SimState, change: (data: Record<string, unknown>) => void): Record<string, unknown> {
  const data = JSON.parse(saveToText(state)) as Record<string, unknown>;
  change(data);
  return data;
}

function load(data: unknown): SimState {
  const result = fromSaveData(data);
  if (!result.ok) {
    throw new Error(`nicht geladen: ${result.reason}`);
  }
  return result.state;
}

const residentsOf = (data: Record<string, unknown>): Record<string, unknown>[] => data['residents'] as Record<string, unknown>[];

describe('Spielstand der Bewohner (Version 3)', () => {
  it('speichert Bewohner, Wege, Boote, die nächste Id und den Zufall – und lädt sie unverändert', () => {
    const sailing = residentVillage(3);
    expect(sailing.boats.length).toBeGreaterThan(0);
    const walking = residentVillage(40);
    expect(walking.residents.some((r) => r.doing === 'walk' && r.route.length > 0)).toBe(true);
    for (const state of [sailing, walking]) {
      const loaded = loadFromText(saveToText(state));
      expect(loaded.ok && loaded.state.residents).toEqual(state.residents);
      expect(loaded.ok && loaded.state.boats).toEqual(state.boats);
      expect(loaded.ok && loaded.state.nextResidentId).toBe(state.nextResidentId);
      expect(loaded.ok && loaded.state.residentRng).toBe(state.residentRng);
    }
    const state = walking;
    expect(toSaveData(state).version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(3);
  });

  it('weiterspielen nach dem Laden ist dasselbe wie ohne Speichern – auch mitten im Gehen und auf dem Boot', () => {
    for (const ticks of [5, 40, 333]) {
      const state = residentVillage(ticks);
      const direct = new Simulation(state);
      const resumed = new Simulation(load(JSON.parse(saveToText(state))));
      for (let i = 0; i < 400; i += 1) {
        direct.update(direct.tickMs);
        resumed.update(resumed.tickMs);
      }
      expect(resumed.state).toEqual(direct.state);
    }
  });

  it('holt beim Laden nichts nach: alle stehen genau dort, wo sie beim Speichern waren', () => {
    const state = residentVillage(77);
    const loaded = load(JSON.parse(saveToText(state)));
    expect(loaded.tick).toBe(state.tick);
    expect(loaded.residents.map((r) => [r.at, r.step, r.doing])).toEqual(state.residents.map((r) => [r.at, r.step, r.doing]));
  });
});

describe('Spielstand: Version 2 → 3 (alte Dörfer bekommen ihre Bewohner)', () => {
  it('migrateV2ToV3 ändert die Eingabe nicht und liefert Version 3 ohne Bewohner', () => {
    const input = { format: 'village-save', version: 2, seed: 9, residents: 'alt' };
    const copy = structuredClone(input);
    const out = migrateV2ToV3(input);
    expect(input).toEqual(copy);
    expect(out).toMatchObject({ version: 3, residents: [], boats: [], nextResidentId: 1, residentRng: residentSeed(9) });
  });

  it('jedes Produktionsgebäude bekommt beim Laden seinen Arbeiter – schon bei der Arbeit, nicht per Boot – und ein Zuhause, wo Platz ist', () => {
    const state = residentVillage(10);
    const v2 = saveWith(state, (data) => {
      data['version'] = 2;
      delete data['residents'];
      delete data['boats'];
      delete data['nextResidentId'];
      delete data['residentRng'];
    });
    const loaded = load(v2);
    const producers = loaded.buildings.filter((b) => ['market', 'berry-garden'].includes(b.type));
    expect(loaded.residents.map((r) => r.job).sort()).toEqual(producers.map((b) => b.id).sort());
    expect(loaded.boats).toEqual([]);
    const house = loaded.buildings.find((b) => b.type === 'house-big');
    for (const resident of loaded.residents) {
      const job = loaded.buildings.find((b) => b.id === resident.job);
      expect(resident.doing).toBe('stay');
      expect(job && resident.at).toBe(job && doorOf(loaded, job));
      expect(resident.home).toBe(house?.id);
      expect(RESIDENT_NAMES).toContain(resident.name);
    }
    // The same file always gives the same residents.
    expect(load(v2).residents).toEqual(loaded.residents);
    // The economy goes on as before: the store and the production are what the file says.
    expect(loaded.inventory).toEqual(state.inventory);
    expect(loaded.production.map((p) => p.progress)).toEqual(state.production.map((p) => p.progress));
  });

  it('auch ein Spielstand der Version 1 kommt über die ganze Kette mit Bewohnern an', () => {
    const v1 = { format: 'village-save', version: 1, seed: 5, tick: 10, revision: 1, buildings: [], nextBuildingId: 1, paths: [], inventory: { coins: 5 }, production: [] };
    const start = createInitialState(5);
    const withGarden = {
      ...v1,
      buildings: start.buildings.map((b) => ({ ...b })),
      nextBuildingId: start.nextBuildingId,
      paths: [...start.paths],
    };
    const loaded = load(withGarden);
    expect(loaded.residents).toHaveLength(2);
  });
});

describe('Spielstand: kaputte Bewohner werden repariert', () => {
  it('Namen: zu lange werden gekürzt, leere bekommen einen Vornamen; Mützen außerhalb der Farben werden ersetzt', () => {
    const state = residentVillage(30);
    const data = saveWith(state, (d) => {
      const [first, second] = residentsOf(d);
      if (first && second) {
        first['name'] = 'X'.repeat(80);
        first['hat'] = 99;
        second['name'] = '   ';
        second['hat'] = 1.5;
      }
    });
    const loaded = load(data);
    expect(loaded.residents[0]?.name).toHaveLength(MAX_NAME_LENGTH);
    expect(RESIDENT_NAMES).toContain(loaded.residents[1]?.name);
    for (const resident of loaded.residents) {
      expect(resident.hat).toBeGreaterThanOrEqual(0);
      expect(resident.hat).toBeLessThan(HAT_IDS.length);
    }
  });

  it('wer auf dem Wasser steht oder einen kaputten Weg hat, steht an seiner Tür und plant neu', () => {
    const state = residentVillage(30);
    const water = 0;
    const data = saveWith(state, (d) => {
      const [first, second] = residentsOf(d);
      if (first && second) {
        first['at'] = water;
        first['doing'] = 'walk';
        second['doing'] = 'walk';
        second['route'] = [5, 900, 'x'];
      }
    });
    const loaded = load(data);
    for (const resident of loaded.residents) {
      expect(isWalkable(loaded.world, resident.at)).toBe(true);
    }
    const sim = new Simulation(loaded);
    for (let i = 0; i < 5; i += 1) {
      sim.update(sim.tickMs);
    }
    expect(sim.state.residents.every((r) => r.doing !== 'wait')).toBe(true);
  });

  it('doppelte Ids und doppelte Arbeiter: nur der erste bleibt; Häuser werden nicht überfüllt; unbekannte Waren fallen weg', () => {
    const state = residentVillage(30);
    const garden = state.buildings.find((b) => b.type === 'berry-garden')?.id;
    const house = state.buildings.find((b) => b.type === 'house-big')?.id;
    const data = saveWith(state, (d) => {
      const list = residentsOf(d);
      const first = list[0] ?? {};
      d['residents'] = [
        ...list,
        { ...first },
        ...Array.from({ length: 6 }, (_, i) => ({ ...first, id: 100 + i, job: garden, home: house, carrying: i === 0 ? 'gold' : 'wood' })),
      ];
    });
    const loaded = load(data);
    const ids = loaded.residents.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(loaded.residents.filter((r) => r.job === garden)).toHaveLength(1);
    expect(loaded.residents.filter((r) => r.home === house).length).toBeLessThanOrEqual(4);
    expect(loaded.residents.find((r) => r.id === 100)?.carrying).toBeNull();
    expect(loaded.nextResidentId).toBeGreaterThan(105);
  });

  it('Boote: auf Land oder ohne Passagier an Bord – der Bewohner steigt aus, nichts hängt', () => {
    const state = residentVillage(3);
    const boat = state.boats[0];
    expect(boat).toBeDefined();
    const data = saveWith(state, (d) => {
      const boats = d['boats'] as Record<string, unknown>[];
      const first = boats[0];
      if (first) {
        first['at'] = 24 * 12 + 12;
      }
    });
    const loaded = load(data);
    expect(loaded.boats.some((b) => b.id === boat?.id)).toBe(false);
    expect(loaded.residents.every((r) => r.doing !== 'boat' || loaded.boats.some((b) => b.passenger === r.id))).toBe(true);
    const noBoats = load(saveWith(state, (d) => {
      d['boats'] = [];
    }));
    expect(noBoats.residents.every((r) => r.doing !== 'boat')).toBe(true);
  });

  it('Obergrenzen: höchstens 500 Bewohner, Wege bis 2000 Kacheln, Ids unter 2³¹, nextResidentId bleibt spielbar', () => {
    const state = residentVillage(30);
    const template = toSaveData(state).residents[0];
    const data = saveWith(state, (d) => {
      d['residents'] = Array.from({ length: MAX_RESIDENTS + 80 }, (_, i) => ({ ...template, id: i + 1, job: null, home: null, route: [], doing: 'stay' }));
      d['nextResidentId'] = 1e15;
    });
    const loaded = load(data);
    expect(loaded.residents).toHaveLength(MAX_RESIDENTS);
    expect(loaded.nextResidentId).toBeLessThan(MAX_ID);
    expect(loaded.nextResidentId).toBeGreaterThan(MAX_RESIDENTS);

    const long = saveWith(state, (d) => {
      const first = residentsOf(d)[0];
      if (first) {
        first['doing'] = 'walk';
        first['route'] = Array.from({ length: MAX_ROUTE + 1 }, (_, i) => (i % 2 === 0 ? Number(first['at']) + 1 : Number(first['at'])));
        first['id'] = 2 ** 31;
      }
    });
    const cut = load(long);
    expect(cut.residents.every((r) => r.route.length <= MAX_ROUTE && r.id < MAX_ID)).toBe(true);
  });

  it('stürzt bei keinem Unsinn ab', () => {
    const state = residentVillage(10);
    for (const junk of [null, 5, 'viele', [null, 7, 'x', [], { id: 'a' }, { id: 3, name: 5, at: -4, route: 'x', doing: 'fliegen', goal: 9, step: -3, timer: 'lang' }]]) {
      const data = saveWith(state, (d) => {
        d['residents'] = junk;
        d['boats'] = junk;
        d['residentRng'] = 'zufall';
      });
      const result = fromSaveData(data);
      expect(result.ok).toBe(true);
      if (result.ok) {
        const sim = new Simulation(result.state);
        for (let i = 0; i < 50; i += 1) {
          sim.update(sim.tickMs);
        }
        expect(sim.state.residents.length).toBeGreaterThanOrEqual(2);
        // Without a usable generator in the file it starts from the seed: the same file always loads the same.
        const again = fromSaveData(data);
        expect(again.ok && again.state).toEqual(result.state);
      }
    }
  });
});
