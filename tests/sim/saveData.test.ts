import { describe, expect, it } from 'vitest';
import { LOCKED_TYPE_IDS } from '../../src/data/buildings';
import { MAX_AMOUNT } from '../../src/data/goods';
import { generateIsland } from '../../src/sim/islandGen';
import { canPlace } from '../../src/sim/buildings';
import { applyCommand, type Command } from '../../src/sim/commands';
import {
  MIGRATIONS,
  SAVE_FORMAT,
  SAVE_VERSION,
  fromSaveData,
  loadFromText,
  migrateSave,
  migrateV1ToV2,
  saveToText,
  terrainFromText,
  toSaveData,
  type Migration,
} from '../../src/sim/saveData';
import { Simulation } from '../../src/sim/simulation';
import { createInitialState, type SimState } from '../../src/sim/state';
import { hasLandNeighbor, terrainAt } from '../../src/sim/world';
import { richInventory } from './helpers';

/** A village with a bit of everything: houses, production, paths, planted trees and rocks, a beach, a meadow, a running game. */
function busyState(): SimState {
  const state = createInitialState(7);
  state.inventory = richInventory();
  state.unlocked = [...LOCKED_TYPE_IDS];
  const cx = Math.floor(state.world.width / 2);
  const cy = Math.floor(state.world.height / 2);
  const grass: { x: number; y: number }[] = [];
  for (let y = cy - 6; y < cy + 6; y += 1) {
    for (let x = cx + 4; x < cx + 12; x += 1) {
      if (terrainAt(state.world, x, y) === 'grass') {
        grass.push({ x, y });
      }
    }
  }
  const first = grass[0];
  if (!first) {
    throw new Error('seed 7 has no free meadow near the middle');
  }
  const send = (command: Command): void => {
    applyCommand(state, command);
  };
  send({ type: 'plantTree', typeId: 'tree', x: first.x, y: first.y });
  send({ type: 'placeRock', typeId: 'rock', x: first.x + 1, y: first.y });
  // Production buildings and a house on the first free spots the rules allow.
  for (const typeId of ['lumberjack', 'quarry', 'bakery', 'house-blue']) {
    const spot = grass.find((tile) => canPlace(state, typeId, tile.x, tile.y) === 'ok');
    if (spot) {
      send({ type: 'placeBuilding', buildingType: typeId, x: spot.x, y: spot.y });
      send({ type: 'placePaths', tiles: [{ x: spot.x, y: spot.y + 2 }, { x: spot.x + 1, y: spot.y + 2 }] });
    }
  }
  // A beach where water touches the land.
  outer: for (let y = 2; y < state.world.height - 2; y += 1) {
    for (let x = 2; x < state.world.width - 2; x += 1) {
      if (terrainAt(state.world, x, y) === 'water' && hasLandNeighbor(state.world, x, y)) {
        send({ type: 'fillLand', typeId: 'beach', x, y });
        break outer;
      }
    }
  }
  const sim = new Simulation(state);
  for (let i = 0; i < 250; i += 1) {
    sim.update(sim.tickMs);
  }
  return structuredClone(sim.state) as SimState;
}

const minimalV1 = {
  format: SAVE_FORMAT,
  version: 1,
  seed: 5,
  tick: 120,
  revision: 3,
  buildings: [{ id: 1, type: 'house-red', x: 20, y: 20 }],
  nextBuildingId: 2,
  paths: [],
  inventory: { coins: 77, wood: 3 },
  production: [],
};

describe('Spielstand: Speichern und Laden', () => {
  it('gibt den Anfangszustand nach JSON und zurück unverändert zurück', () => {
    const state = createInitialState(3);
    const result = loadFromText(saveToText(state));
    expect(result.ok).toBe(true);
    expect(result.ok && result.state).toEqual(state);
  });

  it('gibt ein Dorf mit allem Drum und Dran unverändert zurück (Gelände, Gebäude, Wege, Lager, Produktion, Freischaltungen)', () => {
    const state = busyState();
    expect(state.buildings.length).toBeGreaterThan(6);
    expect(state.production.length).toBeGreaterThan(2);
    expect(state.planted.length).toBeGreaterThan(0);
    expect(state.tick).toBeGreaterThan(200);
    const result = loadFromText(saveToText(state));
    expect(result.ok).toBe(true);
    expect(result.ok && result.state).toEqual(state);
  });

  it('speichert das veränderte Gelände (gepflanzte Bäume, Strand), nicht nur den Seed', () => {
    const state = busyState();
    const fresh = generateIsland(state.seed);
    const saved = toSaveData(state);
    const loaded = fromSaveData(JSON.parse(JSON.stringify(saved)) as unknown);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    expect(loaded.state.world.tiles).toEqual(state.world.tiles);
    expect(loaded.state.world.tiles).not.toEqual(fresh.tiles);
  });

  it('kopiert alles: spätere Änderungen am Spiel verändern den Spielstand nicht', () => {
    const state = createInitialState(2);
    const saved = toSaveData(state);
    const before = JSON.stringify(saved);
    state.inventory['coins'] = 1;
    state.paths.push(9999);
    state.buildings.push({ id: 99, type: 'bush', x: 1, y: 1 });
    state.world.tiles[0] = 'rock';
    state.tick = 5;
    expect(JSON.stringify(saved)).toBe(before);
  });

  it('lädt pausiert nie: ein gespeicherter Stillstand gehört nicht zum Spielstand', () => {
    const state = createInitialState(2);
    state.paused = true;
    const loaded = loadFromText(saveToText(state));
    expect(loaded.ok && loaded.state.paused).toBe(false);
  });

  it('holt keine Zeit nach: der Tick des Spielstands bleibt, nichts wird im Hintergrund verdient', () => {
    const state = busyState();
    const loaded = loadFromText(saveToText(state));
    expect(loaded.ok && loaded.state.tick).toBe(state.tick);
    expect(loaded.ok && loaded.state.inventory).toEqual(state.inventory);
  });

  it('weiterspielen nach dem Laden ist dasselbe wie ohne Speichern dazwischen', () => {
    const state = busyState();
    const direct = new Simulation(state);
    const loaded = loadFromText(saveToText(state));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    const resumed = new Simulation(loaded.state);
    for (let i = 0; i < 300; i += 1) {
      direct.update(direct.tickMs);
      resumed.update(resumed.tickMs);
    }
    expect(resumed.state).toEqual(direct.state);
  });
});

describe('Spielstand: was keiner von uns ist', () => {
  it.each([
    ['kein JSON', 'das ist {kein json'],
    ['leerer Text', ''],
    ['Zahl', '42'],
    ['null', 'null'],
    ['Liste', '[1,2,3]'],
    ['anderes JSON', '{"name":"Max","level":3}'],
    ['falsches Format', JSON.stringify({ format: 'etwas-anderes', version: 2 })],
    ['Version fehlt', JSON.stringify({ format: SAVE_FORMAT })],
    ['Version als Text', JSON.stringify({ format: SAVE_FORMAT, version: '2' })],
    ['Version 0', JSON.stringify({ format: SAVE_FORMAT, version: 0 })],
    ['Version mit Komma', JSON.stringify({ format: SAVE_FORMAT, version: 1.5 })],
  ])('weist %s als „keine Datei von diesem Spiel“ ab', (_name, text) => {
    expect(loadFromText(text)).toEqual({ ok: false, reason: 'notSave' });
  });

  it('weist einen Spielstand aus einer neueren Version ab, ohne ihn anzufassen', () => {
    const future = { ...toSaveData(createInitialState(1)), version: SAVE_VERSION + 1 };
    const before = JSON.stringify(future);
    expect(fromSaveData(future)).toEqual({ ok: false, reason: 'tooNew' });
    expect(JSON.stringify(future)).toBe(before);
  });
});

describe('Spielstand: Kaputtes wird repariert oder abgelehnt', () => {
  const base = (): ReturnType<typeof toSaveData> => toSaveData(createInitialState(4));
  const load = (data: unknown): SimState => {
    const result = fromSaveData(data);
    if (!result.ok) {
      throw new Error(`should load, but: ${result.reason}`);
    }
    return result.state;
  };

  it.each([
    ['Welt fehlt', (d: Record<string, unknown>) => delete d['world']],
    ['Welt ist kein Objekt', (d: Record<string, unknown>) => (d['world'] = 'wasser')],
    ['Gelände zu kurz', (d: Record<string, unknown>) => (d['world'] = { width: 48, height: 48, terrain: 'www' })],
    ['Gelände kein Text', (d: Record<string, unknown>) => (d['world'] = { width: 48, height: 48, terrain: [1, 2] })],
    ['Breite keine ganze Zahl', (d: Record<string, unknown>) => (d['world'] = { width: 4.5, height: 48, terrain: 'w'.repeat(216) })],
    ['Karte absurd groß', (d: Record<string, unknown>) => (d['world'] = { width: 100000, height: 100000, terrain: '' })],
    ['Karte winzig', (d: Record<string, unknown>) => (d['world'] = { width: 2, height: 2, terrain: 'gggg' })],
    ['nur Wasser', (d: Record<string, unknown>) => (d['world'] = { width: 48, height: 48, terrain: 'w'.repeat(48 * 48) })],
    ['mehr Gebäude als Kacheln', (d: Record<string, unknown>) => (d['buildings'] = Array.from({ length: 48 * 48 + 1 }, (_, id) => ({ id: id + 1, type: 'bush', x: 0, y: 0 })))],
  ])('lehnt ab (kaputt): %s', (_name, damage) => {
    const data = JSON.parse(JSON.stringify(base())) as Record<string, unknown>;
    damage(data);
    expect(fromSaveData(data)).toEqual({ ok: false, reason: 'broken' });
  });

  it('verwirft unbekannte Gebäudetypen, Wege und Inselartikel als Gebäude', () => {
    const data = base();
    const house = data.buildings[0];
    expect(house).toBeDefined();
    data.buildings.push({ id: 90, type: 'raumschiff', x: 20, y: 30 }, { id: 91, type: 'path', x: 21, y: 30 }, { id: 92, type: 'tree', x: 22, y: 30 });
    data.nextBuildingId = 10;
    const state = load(data);
    expect(state.buildings.map((b) => b.type)).not.toContain('raumschiff');
    expect(state.buildings.map((b) => b.type)).not.toContain('path');
    expect(state.buildings.map((b) => b.type)).not.toContain('tree');
    expect(state.buildings).toHaveLength(createInitialState(4).buildings.length);
  });

  it('lässt Gebäude nicht auf Wasser, außerhalb der Karte oder übereinander stehen; ein Weg unter einem Gebäude weicht', () => {
    const state0 = createInitialState(4);
    const water = state0.world.tiles.findIndex((tile) => tile === 'water');
    const data = base();
    const pathIndex = data.paths[0] ?? 0;
    data.buildings = [
      { id: 1, type: 'house-red', x: water % 48, y: Math.floor(water / 48) },
      { id: 2, type: 'house-red', x: 47, y: 47 },
      { id: 3, type: 'house-red', x: -2, y: 5 },
      { id: 4, type: 'bush', x: pathIndex % 48, y: Math.floor(pathIndex / 48) },
      { id: 5, type: 'house-red', x: 20, y: 20 },
      { id: 6, type: 'house-red', x: 21, y: 21 },
      { id: 7, type: 'house-red', x: 1.5, y: 20 },
    ];
    const grassHere = (x: number, y: number): boolean => ['x'].length > 0 && terrainAt(state0.world, x, y) === 'grass';
    const state = load(data);
    // Nothing stands on water or outside, and no two overlap.
    for (const b of state.buildings) {
      expect(terrainAt(state.world, b.x, b.y)).not.toBe('water');
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + 1).toBeLessThan(48);
    }
    expect(state.buildings.find((b) => b.id === 4)).toBeDefined();
    expect(state.paths).not.toContain(pathIndex);
    expect(state.buildings.find((b) => b.id === 7)).toBeUndefined();
    if (grassHere(20, 20) && grassHere(21, 21)) {
      expect(state.buildings.find((b) => b.id === 5)).toBeDefined();
      expect(state.buildings.find((b) => b.id === 6)).toBeUndefined();
    }
  });

  it('doppelte Gebäude-IDs: nur das erste bleibt, nextBuildingId liegt über der größten ID', () => {
    const data = base();
    data.buildings = [
      { id: 5, type: 'bush', x: 5, y: 5 },
      { id: 5, type: 'bush', x: 10, y: 10 },
      { id: 8, type: 'flower', x: 30, y: 30 },
    ];
    data.production = [];
    data.paths = [];
    data.nextBuildingId = 1;
    const world = createInitialState(4).world;
    // Put grass under all three, so only the ids decide.
    const tiles = [...world.tiles];
    for (const [x, y] of [[5, 5], [10, 10], [30, 30]] as const) {
      tiles[y * 48 + x] = 'grass';
    }
    data.world = { width: 48, height: 48, terrain: tiles.map((t) => ({ water: 'w', sand: 's', grass: 'g', forest: 'f', rock: 'r' })[t]).join('') };
    const state = load(data);
    expect(state.buildings.map((b) => b.id)).toEqual([5, 8]);
    expect(state.nextBuildingId).toBe(9);
  });

  it('macht aus unsortierten, doppelten und ungültigen Wegen eine saubere Liste; Wege nur auf Land, nicht unter Gebäuden', () => {
    const data = base();
    const state0 = createInitialState(4);
    const water = state0.world.tiles.findIndex((tile) => tile === 'water');
    const houseTile = (state0.buildings[0]?.y ?? 0) * 48 + (state0.buildings[0]?.x ?? 0);
    data.paths = [900, 901, 900, -4, 1.5, 99999, water, houseTile, 902];
    const state = load(data);
    expect(state.paths).toEqual([900, 901, 902].filter((index) => ['grass', 'sand'].includes(state.world.tiles[index] ?? 'water')));
    expect(state.paths).toEqual([...state.paths].sort((a, b) => a - b));
    expect(state.paths).not.toContain(water);
    expect(state.paths).not.toContain(houseTile);
    expect(state.paths).not.toContain(99999);
  });

  it('sorgt für genau einen Produktionseintrag je Produktionsgebäude und entfernt Waisen', () => {
    const state0 = busyState();
    const data = toSaveData(state0);
    const missing = data.production.shift();
    expect(missing).toBeDefined();
    data.production.push({ buildingId: 4242, progress: 3, status: 'working', delivered: 1, lastSale: 0 });
    const state = load(data);
    const producers = state.buildings.filter((b) => ['lumberjack', 'quarry', 'bakery', 'berry-garden', 'market'].includes(b.type));
    expect(state.production.map((p) => p.buildingId)).toEqual(producers.map((b) => b.id));
    expect(state.production.find((p) => p.buildingId === 4242)).toBeUndefined();
  });

  it('korrigiert Produktionsfelder: Fortschritt über dem Takt, unbekannter Status, Brüche, negative Zahlen', () => {
    const data = toSaveData(createInitialState(4));
    const first = data.production[0];
    expect(first).toBeDefined();
    if (!first) {
      return;
    }
    data.production[0] = { ...first, progress: 100000, status: 'verwirrt' as never, delivered: -5, lastSale: 2.7 };
    const state = load(data);
    const loaded = state.production[0];
    expect(loaded?.progress).toBe(0);
    expect(['working', 'noPath', 'noNearby', 'waitingInput', 'idle']).toContain(loaded?.status);
    expect(loaded?.delivered).toBe(0);
    expect(loaded?.lastSale).toBe(2);
  });

  it('bringt das Lager in Ordnung: nur bekannte Dinge, ganze Zahlen, nicht unter 0 und nicht über der Obergrenze', () => {
    const data = base();
    data.inventory = { coins: 12.9, wood: -4, stone: MAX_AMOUNT * 10, berries: Number.NaN, ufo: 5 };
    const state = load(data);
    expect(state.inventory['coins']).toBe(12);
    expect(state.inventory['wood']).toBe(0);
    expect(state.inventory['stone']).toBe(MAX_AMOUNT);
    expect(state.inventory['berries']).toBe(0);
    expect(state.inventory['furniture']).toBe(0);
    expect(state.inventory).not.toHaveProperty('ufo');
  });

  it('earnedCoins: ganze Zahl von 0 bis zur Obergrenze', () => {
    const cases: [unknown, number][] = [[-5, 0], [7.8, 7], [MAX_AMOUNT * 3, MAX_AMOUNT], ['viel', 0], [null, 0]];
    for (const [value, expected] of cases) {
      const data = base() as unknown as Record<string, unknown>;
      data['earnedCoins'] = value;
      expect(load(data).earnedCoins).toBe(expected);
    }
  });

  it('Freischaltungen: unbekannte und doppelte fliegen raus, erreichte werden nachgetragen', () => {
    const data = base();
    data.unlocked = ['tisch', 'bench', 'bench', 'house-red', 42 as never];
    data.earnedCoins = 1_000_000;
    const state = load(data);
    expect(state.unlocked).not.toContain('tisch');
    expect(state.unlocked.filter((id) => id === 'bench')).toHaveLength(1);
    expect(state.unlocked).not.toContain('house-red');
    // 1 000 000 earned coins reach every unlock that asks for money.
    expect(state.unlocked.length).toBeGreaterThan(0);
  });

  it('gepflanzte Bäume und Felsen: nur gültige Einträge, der Boden muss noch stimmen', () => {
    const data = busyState();
    const save = toSaveData(data);
    const valid = save.planted[0];
    expect(valid).toBeDefined();
    save.planted.push({ index: -1, type: 'tree' }, { index: 999999, type: 'tree' }, { index: 5, type: 'bush' }, { index: 6, type: 'tree' });
    const state = load(save);
    expect(state.planted).toEqual(data.planted);
  });

  it('Gelände mit unbekannten Buchstaben: sie werden Wasser, nichts stürzt ab', () => {
    const tiles = terrainFromText('wgx?Sr', 6);
    expect(tiles).toEqual(['water', 'grass', 'water', 'water', 'water', 'rock']);
    expect(terrainFromText('www', 4)).toBeUndefined();
  });

  it('tick, revision und nextBuildingId: kaputte Werte werden zu 0 beziehungsweise 1', () => {
    const data = base() as unknown as Record<string, unknown>;
    data['tick'] = 'jetzt';
    data['revision'] = -3;
    data['nextBuildingId'] = null;
    const state = load(data);
    expect(state.tick).toBe(0);
    expect(state.revision).toBe(0);
    expect(state.nextBuildingId).toBeGreaterThan(Math.max(...state.buildings.map((b) => b.id)));
  });

  it('stürzt bei keinem Unsinn ab', () => {
    const junk: unknown[] = [
      undefined,
      null,
      0,
      'text',
      [],
      {},
      { format: SAVE_FORMAT, version: SAVE_VERSION },
      { format: SAVE_FORMAT, version: SAVE_VERSION, world: { width: 48, height: 48, terrain: 'g'.repeat(2304) }, buildings: 'viele', paths: { a: 1 }, production: 7, inventory: [], planted: 'x', unlocked: 3 },
      { format: SAVE_FORMAT, version: SAVE_VERSION, world: { width: 48, height: 48, terrain: 'g'.repeat(2304) }, buildings: [null, 5, 'x', [], { id: 'a' }, { id: 1, type: 5 }], production: [null, { buildingId: 'x' }] },
      { format: SAVE_FORMAT, version: 1, seed: 'x' },
      { format: SAVE_FORMAT, version: 1, seed: {}, buildings: null },
    ];
    for (const value of junk) {
      expect(() => fromSaveData(value)).not.toThrow();
      const result = fromSaveData(value);
      if (result.ok) {
        // A loaded state is always usable: the simulation can run with it.
        const sim = new Simulation(result.state);
        expect(() => {
          for (let i = 0; i < 20; i += 1) {
            sim.update(sim.tickMs);
          }
        }).not.toThrow();
      }
    }
  });
});

describe('Spielstand: Versionen und Migration', () => {
  it('Version 1 (Stand vor M4, bewusst minimal) wird auf die aktuelle Version gehoben', () => {
    const result = fromSaveData(minimalV1);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const { state } = result;
    // The terrain is the one the seed makes, the rest comes from the file.
    expect(state.world.tiles).toEqual(generateIsland(5).tiles);
    expect(state.seed).toBe(5);
    expect(state.tick).toBe(120);
    expect(state.inventory['coins']).toBe(77);
    expect(state.inventory['wood']).toBe(3);
    expect(state.planted).toEqual([]);
    expect(state.earnedCoins).toBe(0);
    // The house is only kept if the generated island has meadow for it there.
    const onGrass = ['grass'].includes(state.world.tiles[20 * 48 + 20] ?? 'water');
    expect(state.buildings.length).toBe(onGrass ? 1 : 0);
    // A migrated save, saved again, is a current one.
    expect(toSaveData(state).version).toBe(SAVE_VERSION);
  });

  it('migrateV1ToV2 ändert die Eingabe nicht und liefert Version 2 mit Gelände', () => {
    const input = structuredClone(minimalV1);
    const before = JSON.stringify(input);
    const out = migrateV1ToV2(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(out['version']).toBe(2);
    expect((out['world'] as { terrain: string }).terrain).toHaveLength(48 * 48);
  });

  it('die Kette läuft Schritt für Schritt (v1 → v2 → v3 …) und bricht bei einer Lücke ab', () => {
    const steps: Record<number, Migration> = {
      1: (d) => ({ ...d, version: 2, a: 1 }),
      2: (d) => ({ ...d, version: 3, b: 2 }),
      3: (d) => ({ ...d, version: 4, c: 3 }),
    };
    expect(migrateSave({ version: 1 }, 1, steps, 4)).toEqual({ version: 4, a: 1, b: 2, c: 3 });
    expect(migrateSave({ version: 3 }, 3, steps, 4)).toEqual({ version: 4, c: 3 });
    expect(migrateSave({ version: 2 }, 2, { 1: steps[1] as Migration }, 4)).toBeUndefined();
    // A step that forgets to raise the version is an error, not an endless loop.
    expect(migrateSave({ version: 1 }, 1, { 1: (d) => ({ ...d }) }, 2)).toBeUndefined();
    expect(migrateSave({ version: 5 }, 5, steps, 5)).toEqual({ version: 5 });
  });

  it('jede Version unterhalb der aktuellen hat einen Schritt', () => {
    for (let version = 1; version < SAVE_VERSION; version += 1) {
      expect(MIGRATIONS[version]).toBeTypeOf('function');
    }
  });

  it('der Spielstand der aktuellen Version trägt Format und Version', () => {
    const saved = toSaveData(createInitialState(1));
    expect(saved.format).toBe(SAVE_FORMAT);
    expect(saved.version).toBe(SAVE_VERSION);
  });

  it('applyCommand auf einem geladenen Zustand funktioniert wie sonst (Ids laufen weiter)', () => {
    const loaded = loadFromText(saveToText(busyState()));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    const state = loaded.state;
    const idsBefore = state.buildings.map((b) => b.id);
    applyCommand(state, { type: 'demolish', x: state.buildings[0]?.x ?? 0, y: state.buildings[0]?.y ?? 0 });
    expect(state.buildings.length).toBe(idsBefore.length - 1);
    expect(state.nextBuildingId).toBeGreaterThan(Math.max(...idsBefore));
  });
});

describe('Spielstand: Obergrenzen gegen absurde Dateien (R6, R7)', () => {
  const base = (): ReturnType<typeof toSaveData> => toSaveData(createInitialState(4));
  const grassWorld = (side: number): { width: number; height: number; terrain: string } => ({ width: side, height: side, terrain: 'g'.repeat(side * side) });

  it('R6: riesige oder gebrochene Zahlen werden begrenzt, riesige Ids fallen weg – keine doppelten Ids', () => {
    const data = base();
    data.buildings.push({ id: 1e300, type: 'bush', x: 30, y: 30 }, { id: 1e300 + 1, type: 'bush', x: 31, y: 30 }, { id: 2 ** 31, type: 'bush', x: 32, y: 30 });
    data.nextBuildingId = 1e300;
    data.tick = 1e300;
    data.revision = Number.MAX_VALUE;
    data.earnedCoins = 1e300;
    const result = fromSaveData(data);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const ids = result.state.buildings.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.max(...ids)).toBeLessThan(2 ** 31);
    expect(result.state.nextBuildingId).toBeLessThanOrEqual(2 ** 31);
    expect(result.state.nextBuildingId).toBeGreaterThan(Math.max(...ids));
    expect(Number.isSafeInteger(result.state.tick)).toBe(true);
    expect(Number.isSafeInteger(result.state.revision)).toBe(true);
    expect(result.state.earnedCoins).toBe(MAX_AMOUNT);
  });

  it('R7: eine Karte, die mehr als doppelt so groß ist wie die Insel, ist kaputt; die doppelte Größe geht noch', () => {
    const big = base();
    big.world = grassWorld(97);
    big.buildings = [];
    big.paths = [];
    big.production = [];
    big.planted = [];
    expect(fromSaveData(big)).toEqual({ ok: false, reason: 'broken' });
    const ok = base();
    ok.world = grassWorld(96);
    ok.buildings = [];
    ok.paths = [];
    ok.production = [];
    ok.planted = [];
    expect(fromSaveData(ok).ok).toBe(true);
  });

  it('R7: ein riesiges Dorf (Tausende Bäckereien) wird auf eine spielbare Größe gekürzt und lässt das Spiel nicht stehen', () => {
    const data = base();
    data.world = grassWorld(96);
    data.buildings = Array.from({ length: 2000 }, (_, i) => ({ id: i + 1, type: 'bakery', x: (i % 48) * 2, y: Math.floor(i / 48) * 2 }));
    data.production = [];
    data.paths = [];
    data.planted = [];
    const result = fromSaveData(data);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.state.buildings.length).toBeLessThanOrEqual(1000);
    expect(result.state.production.length).toBeLessThanOrEqual(200);
    expect(result.state.production).toHaveLength(result.state.buildings.filter((b) => b.type === 'bakery').length);
    const sim = new Simulation(result.state);
    const started = Date.now();
    for (let i = 0; i < 20; i += 1) {
      sim.update(sim.tickMs);
    }
    // 20 ticks, even on a slow machine, are far from "the game stands still" (a tick has 100 ms).
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('R7: sehr viele Gebäude in der Datei werden auf 1000 gekürzt', () => {
    const data = base();
    data.world = grassWorld(96);
    data.buildings = Array.from({ length: 3000 }, (_, i) => ({ id: i + 1, type: 'flower', x: i % 96, y: Math.floor(i / 96) }));
    data.production = [];
    data.paths = [];
    data.planted = [];
    const result = fromSaveData(data);
    expect(result.ok && result.state.buildings.length).toBe(1000);
  });
});

describe('Spielstand: nextBuildingId bleibt unter dem Id-Limit (N2)', () => {
  it('eine Datei mit nextBuildingId 1e15 verliert beim Neuladen keine Gebäude, auch nicht die danach gebauten', () => {
    const data = toSaveData(createInitialState(4));
    data.nextBuildingId = 1e15;
    const loaded = fromSaveData(data);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    expect(loaded.state.nextBuildingId).toBe(2 ** 31 - 1);
    const count = loaded.state.buildings.length;
    expect(count).toBeGreaterThan(0);
    // The village is "full" for new buildings (no id left), and what is there survives another round trip.
    const again = fromSaveData(JSON.parse(JSON.stringify(toSaveData(loaded.state))) as unknown);
    expect(again.ok && again.state.buildings.length).toBe(count);
  });
});
