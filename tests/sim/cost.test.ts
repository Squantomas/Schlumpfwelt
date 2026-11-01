import { describe, expect, it } from 'vitest';
import { BUILDING_TYPES, LOCKED_TYPE_IDS } from '../../src/data/buildings';
import { ITEM_IDS, START_INVENTORY } from '../../src/data/goods';
import { canPlace, checkPlacement, unconnectedBuildings } from '../../src/sim/buildings';
import { costOf, productionOf } from '../../src/sim/economy';
import { createInitialState } from '../../src/sim/state';
import { buildConnected, fillTerrain, grassState, producerOf, run, setStore, setTerrainAt, tickN } from './helpers';

describe('Bauen kostet Material und Geld', () => {
  it('bucht die Kosten beim Setzen ab', () => {
    const state = grassState();
    setStore(state, { coins: 100, wood: 20 });
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 3, y: 3 });
    expect(state.buildings).toHaveLength(1);
    expect(state.inventory['coins']).toBe(100 - (costOf('house-red')['coins'] ?? 0));
    expect(state.inventory['wood']).toBe(20 - (costOf('house-red')['wood'] ?? 0));
  });

  it('setzt nichts und bucht nichts ab, wenn etwas fehlt', () => {
    const state = grassState();
    setStore(state, { coins: 100, wood: 1 });
    const before = structuredClone(state);
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 3, y: 3 });
    expect(state).toEqual(before);
  });

  it('meldet „cost“ mit den fehlenden Mengen (und nur diesen)', () => {
    const state = grassState();
    setStore(state, { coins: 100, wood: 5 });
    const problem = checkPlacement(state, 'house-red', 3, 3);
    expect(problem.result).toBe('cost');
    expect(problem.missing).toEqual({ wood: (costOf('house-red')['wood'] ?? 0) - 5 });
    setStore(state, { coins: 10 });
    expect(checkPlacement(state, 'house-red', 3, 3).missing).toEqual({ coins: 30, wood: 8 });
    expect(canPlace(state, 'house-red', 3, 3)).toBe('cost');
  });

  it('meldet die Lage vor den Kosten (Wasser, belegt, kein Wald in der Nähe)', () => {
    const state = grassState();
    setStore(state);
    setTerrainAt(state, 4, 4, 'water');
    expect(canPlace(state, 'house-red', 3, 3)).toBe('terrain');
    expect(canPlace(state, 'house-red', -3, 3)).toBe('outOfMap');
    expect(canPlace(state, 'lumberjack', 8, 8)).toBe('noNearby');
  });

  it('erlaubt das Setzen genau dann, wenn die Kosten gerade reichen', () => {
    const state = grassState();
    setStore(state, { coins: 40, wood: 8 });
    expect(canPlace(state, 'house-red', 3, 3)).toBe('ok');
    setStore(state, { coins: 39, wood: 8 });
    expect(canPlace(state, 'house-red', 3, 3)).toBe('cost');
    setStore(state, { coins: 40, wood: 7 });
    expect(canPlace(state, 'house-red', 3, 3)).toBe('cost');
  });

  it('kostet für Wege nichts, sodass man nie festsitzt', () => {
    const state = grassState();
    setStore(state);
    run(state, { type: 'placePaths', tiles: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }] });
    expect(state.paths).toHaveLength(3);
    expect(state.inventory).toEqual({ coins: 0, wood: 0, stone: 0, berries: 0, furniture: 0, cake: 0 });
    expect(costOf('path')).toEqual({});
  });

  it('kostet beim Verschieben nichts, auch mit leerem Lager', () => {
    const state = grassState();
    setStore(state, { coins: 100, wood: 20 });
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 3, y: 3 });
    setStore(state);
    run(state, { type: 'moveBuilding', id: 1, x: 8, y: 8 });
    expect(state.buildings[0]).toMatchObject({ x: 8, y: 8 });
    expect(state.inventory['coins']).toBe(0);
  });

  it('prüft die Kosten pro Befehl mit dem Lager zum Zeitpunkt des Befehls (zweites Gebäude zu teuer)', () => {
    const state = grassState();
    setStore(state, { coins: 40, wood: 8 });
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 2, y: 2 }, { type: 'placeBuilding', buildingType: 'house-blue', x: 6, y: 2 });
    expect(state.buildings.map((b) => b.type)).toEqual(['house-red']);
    expect(state.inventory['coins']).toBe(0);
  });
});

describe('Abreißen erstattet die vollen Baukosten', () => {
  it('gibt für jeden Bautyp genau die Kosten zurück: Bauen und Abreißen ändert das Lager nicht', () => {
    // Inselartikel (Baum, Fels …) bauen keine Gebäude: ihr Abreißen und die Ausnahmen stehen in island.test.ts;
    // die Einladung eines Bewohners steht in residents.test.ts.
    for (const type of BUILDING_TYPES.filter((t) => t.category !== 'path' && t.category !== 'island' && t.category !== 'resident')) {
      const state = grassState(24);
      fillTerrain(state, 14, 2, 3, 4, 'forest');
      fillTerrain(state, 14, 8, 3, 4, 'rock');
      setStore(state, { coins: 123, wood: 45, stone: 6, berries: 7 });
      const before = structuredClone(state.inventory);
      run(state, { type: 'placeBuilding', buildingType: type.id, x: 10, y: 5 });
      expect(state.buildings, type.id).toHaveLength(1);
      expect(state.inventory, `${type.id} gebaut`).not.toEqual(before);
      run(state, { type: 'demolish', x: 10, y: 5 });
      expect(state.buildings, type.id).toHaveLength(0);
      expect(state.inventory, `${type.id} abgerissen`).toEqual(before);
    }
  });

  it('erstattet beim Abreißen eines Weges nichts (Wege sind frei)', () => {
    const state = grassState();
    setStore(state);
    run(state, { type: 'placePaths', tiles: [{ x: 1, y: 1 }] }, { type: 'demolish', x: 1, y: 1 });
    expect(state.inventory['coins']).toBe(0);
  });

  it('erstattet die Kosten auch, wenn das Gebäude schon lange gearbeitet hat (die erzeugten Waren bleiben)', () => {
    const state = grassState(24);
    setStore(state, { coins: 100, wood: 20 });
    const before = structuredClone(state.inventory);
    const id = buildConnected(state, 'berry-garden', 4, 3);
    tickN(state, 10 * (productionOf('berry-garden')?.intervalTicks ?? 1));
    expect(producerOf(state, id).delivered).toBe(10);
    run(state, { type: 'demolish', x: 4, y: 3 });
    expect(state.inventory).toEqual({ ...before, berries: 10 });
  });
});

describe('Startdorf abreißen: einmaliger Startbonus', () => {
  const startBuildings = (state: ReturnType<typeof createInitialState>): { x: number; y: number }[] => state.buildings.map((b) => ({ x: b.x, y: b.y }));
  const total = (inventory: Readonly<Record<string, number>>, id: string): number => inventory[id] ?? 0;

  it('erstattet die Baukosten der Startgebäude einmal, obwohl sie nichts gekostet haben', () => {
    const state = createInitialState(1);
    const start = { ...state.inventory };
    const expected: Record<string, number> = { ...start };
    for (const building of state.buildings) {
      for (const [id, amount] of Object.entries(costOf(building.type))) {
        expected[id] = (expected[id] ?? 0) + amount;
      }
    }
    for (const spot of startBuildings(state)) {
      run(state, { type: 'demolish', x: spot.x, y: spot.y });
    }
    expect(state.buildings).toHaveLength(0);
    expect(state.inventory).toEqual(expected);
    // Haus + Beerengarten + Markt + Deko des Startdorfs: ein spürbarer, aber einmaliger Bonus.
    expect(total(state.inventory, 'coins')).toBeGreaterThan(total(start, 'coins'));
  });

  it('lässt sich nicht wiederholen: Neu bauen und wieder abreißen ändert nichts mehr', () => {
    const state = createInitialState(1);
    for (const spot of startBuildings(state)) {
      run(state, { type: 'demolish', x: spot.x, y: spot.y });
    }
    const afterBonus = { ...state.inventory };
    const garden = createInitialState(1).buildings.find((b) => b.type === 'berry-garden');
    for (let i = 0; i < 5; i += 1) {
      run(state, { type: 'placeBuilding', buildingType: 'berry-garden', x: garden?.x ?? 0, y: garden?.y ?? 0 });
      expect(state.buildings).toHaveLength(1);
      run(state, { type: 'demolish', x: garden?.x ?? 0, y: garden?.y ?? 0 });
    }
    expect(state.inventory).toEqual(afterBonus);
  });
});

describe('Produktionsgebäude beim Setzen', () => {
  it('legt für jedes Produktionsgebäude einen Arbeitszustand an, für Häuser und Deko nicht', () => {
    const state = grassState(24);
    fillTerrain(state, 14, 2, 3, 4, 'forest');
    setStore(state, { coins: 500, wood: 100, stone: 10 });
    run(
      state,
      { type: 'placeBuilding', buildingType: 'house-red', x: 2, y: 2 },
      { type: 'placeBuilding', buildingType: 'flower', x: 6, y: 2 },
      { type: 'placeBuilding', buildingType: 'lumberjack', x: 10, y: 3 },
      { type: 'placeBuilding', buildingType: 'berry-garden', x: 2, y: 8 },
    );
    expect(state.production.map((p) => p.buildingId)).toEqual([3, 4]);
    expect(state.production.every((p) => p.progress === 0 && p.delivered === 0)).toBe(true);
  });

  it('verlangt für Holzfäller Wald und für den Steinbruch Fels im Radius, nicht für die anderen', () => {
    const state = grassState(24);
    setStore(state, { coins: 500, wood: 100, stone: 10 });
    for (const id of ['lumberjack', 'quarry'] as const) {
      expect(canPlace(state, id, 8, 8), id).toBe('noNearby');
    }
    for (const id of ['berry-garden', 'carpenter', 'bakery', 'market'] as const) {
      expect(canPlace(state, id, 8, 8), id).toBe('ok');
    }
    const nearbyLumber = productionOf('lumberjack')?.needsNearby;
    expect(nearbyLumber).toEqual({ terrain: 'forest', radius: 4 });
    // Genau am Rand des Radius: Wald in 4 Kacheln Abstand vom Grundriss zählt, in 5 nicht.
    setTerrainAt(state, 8 + 2 - 1 + 5, 8, 'forest');
    expect(canPlace(state, 'lumberjack', 8, 8)).toBe('noNearby');
    setTerrainAt(state, 8 + 2 - 1 + 4, 8, 'forest');
    expect(canPlace(state, 'lumberjack', 8, 8)).toBe('ok');
    expect(checkPlacement(state, 'quarry', 8, 8)).toEqual({ result: 'noNearby', terrain: 'rock' });
  });

  it('verbietet das Verschieben eines Holzfällers weit weg vom Wald, erlaubt es nahe am Wald', () => {
    const state = grassState(24);
    fillTerrain(state, 14, 2, 3, 4, 'forest');
    setStore(state, { coins: 100, wood: 20 });
    run(state, { type: 'placeBuilding', buildingType: 'lumberjack', x: 10, y: 3 });
    run(state, { type: 'moveBuilding', id: 1, x: 2, y: 15 });
    expect(state.buildings[0]).toMatchObject({ x: 10, y: 3 });
    run(state, { type: 'moveBuilding', id: 1, x: 10, y: 8 });
    expect(state.buildings[0]).toMatchObject({ x: 10, y: 8 });
  });
});

describe('Startzustand', () => {
  it('beginnt mit einem Startlager aus goods.json', () => {
    const state = createInitialState(1);
    for (const id of ITEM_IDS) {
      expect(state.inventory[id], id).toBe(START_INVENTORY[id] ?? 0);
    }
  });

  it('reicht, um sofort eine Bäckerei zu bauen (dann tragen Beeren Taler ein)', () => {
    const state = createInitialState(1);
    const cost = costOf('bakery');
    for (const [id, amount] of Object.entries(cost)) {
      expect(state.inventory[id] ?? 0, id).toBeGreaterThanOrEqual(amount);
    }
  });

  it('hat bei jedem Seed Haus, Beerengarten und Marktplatz, alle am Weg, ohne Überlappung und ohne etwas zu kosten', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const state = createInitialState(seed);
      const types = state.buildings.map((b) => b.type);
      expect(types, `Seed ${String(seed)}`).toEqual(expect.arrayContaining(['house-red', 'berry-garden', 'market']));
      expect(unconnectedBuildings(state), `Seed ${String(seed)}`).toEqual([]);
      for (const building of state.buildings) {
        expect(canPlace(state, building.type, building.x, building.y, building.id), `Seed ${String(seed)} ${building.type}`).toBe('ok');
      }
      expect(state.inventory).toEqual(createInitialState(0).inventory);
      expect(state.production.map((p) => p.buildingId)).toEqual(state.buildings.filter((b) => productionOf(b.type)).map((b) => b.id));
    }
  });

  it('hat im Startdorf einen arbeitenden Beerengarten und einen Markt im Leerlauf', () => {
    const state = createInitialState(1);
    const garden = state.buildings.find((b) => b.type === 'berry-garden');
    const market = state.buildings.find((b) => b.type === 'market');
    expect(state.production.find((p) => p.buildingId === garden?.id)?.status).toBe('working');
    expect(state.production.find((p) => p.buildingId === market?.id)?.status).toBe('idle');
  });

  it('lässt auf jeder der 40 Inseln Holzfällerhütte und Steinbruch irgendwo bauen', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const state = createInitialState(seed);
      state.inventory = { coins: 999, wood: 999, stone: 999, berries: 0, furniture: 0, cake: 0 };
      // Der Steinbruch wird mit dem ersten Holzfäller frei; hier zählt nur, ob es einen Platz gibt.
      state.unlocked = [...LOCKED_TYPE_IDS];
      for (const id of ['lumberjack', 'quarry']) {
        let found = false;
        for (let y = 0; y < state.world.height && !found; y += 1) {
          for (let x = 0; x < state.world.width && !found; x += 1) {
            found = canPlace(state, id, x, y) === 'ok';
          }
        }
        expect(found, `Seed ${String(seed)} ${id}`).toBe(true);
      }
    }
  });
});
