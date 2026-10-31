import { describe, expect, it } from 'vitest';
import { buildingType, typesOf } from '../../src/data/buildings';
import { canPlace, checkPlacement } from '../../src/sim/buildings';
import { applyCommand, placementCommand } from '../../src/sim/commands';
import { costOf, hasNearby } from '../../src/sim/economy';
import { islandResult, isPlanted, normalizePlanted, plantedRefund } from '../../src/sim/island';
import { Simulation } from '../../src/sim/simulation';
import { createInitialState, type SimState } from '../../src/sim/state';
import { ISLAND_EDGE, createWorld, terrainAt } from '../../src/sim/world';
import { buildConnected, fillTerrain, grassState, run, setStore, setTerrainAt } from './helpers';

/** 16×16 Gras mit einem See links oben (Wasser bei x 0–3, y 0–3), so dass es Küste gibt. */
function lakeState(): SimState {
  const state = grassState();
  fillTerrain(state, 0, 0, 4, 4, 'water');
  return state;
}

const at = (state: SimState, x: number, y: number): string => terrainAt(state.world, x, y);

describe('Insel: Baum pflanzen', () => {
  it('macht aus Wiese einen Baum, kostet Taler und zählt als Änderung', () => {
    const state = grassState();
    setStore(state, { coins: 20 });
    run(state, { type: 'plantTree', typeId: 'tree', x: 6, y: 6 });
    expect(at(state, 6, 6)).toBe('forest');
    expect(state.inventory['coins']).toBe(20 - (costOf('tree')['coins'] ?? 0));
    expect(state.revision).toBe(1);
    expect(isPlanted(state, 6, 6)).toBe(true);
  });

  it('zählt für den Holzfäller als Baum', () => {
    const state = grassState();
    const lumberjack = buildingType('lumberjack');
    expect(lumberjack).toBeDefined();
    if (!lumberjack) {
      return;
    }
    // Ohne Bäume lässt sich der Holzfäller nicht setzen …
    expect(canPlace(state, 'lumberjack', 6, 6)).toBe('noNearby');
    run(state, { type: 'plantTree', typeId: 'tree', x: 9, y: 6 });
    expect(hasNearby(state.world, lumberjack, 6, 6, 'forest', 4)).toBe(true);
    // … mit dem gepflanzten schon.
    expect(canPlace(state, 'lumberjack', 6, 6)).toBe('ok');
  });

  it('geht nur auf freier Wiese: nicht auf Wasser, Strand, Wald, Fels, Weg oder Haus', () => {
    const state = lakeState();
    setTerrainAt(state, 8, 8, 'sand');
    setTerrainAt(state, 9, 8, 'forest');
    setTerrainAt(state, 10, 8, 'rock');
    run(state, { type: 'placePaths', tiles: [{ x: 6, y: 6 }] });
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 12, y: 12 });
    for (const [x, y] of [[2, 2], [8, 8], [9, 8], [10, 8], [6, 6], [12, 12], [13, 13]] as const) {
      expect(canPlace(state, 'tree', x, y), `${String(x)},${String(y)}`).not.toBe('ok');
    }
    const before = structuredClone(state);
    for (const [x, y] of [[2, 2], [8, 8], [9, 8], [10, 8], [6, 6], [12, 12]] as const) {
      run(state, { type: 'plantTree', typeId: 'tree', x, y });
    }
    expect(state).toEqual(before);
  });

  it('wird bei zu wenig Geld abgelehnt („cost“) und ändert dann nichts', () => {
    const state = grassState();
    setStore(state, { coins: 1 });
    expect(checkPlacement(state, 'tree', 5, 5)).toMatchObject({ result: 'cost', missing: { coins: 4 } });
    run(state, { type: 'plantTree', typeId: 'tree', x: 5, y: 5 });
    expect(at(state, 5, 5)).toBe('grass');
    expect(state.inventory['coins']).toBe(1);
    expect(state.revision).toBe(0);
  });
});

describe('Insel: Fels setzen', () => {
  it('macht aus Wiese einen Fels, den der Steinbruch zählt', () => {
    const state = grassState();
    const quarry = buildingType('quarry');
    if (!quarry) {
      throw new Error('kein Steinbruch');
    }
    run(state, { type: 'placeRock', typeId: 'rock', x: 8, y: 6 });
    expect(at(state, 8, 6)).toBe('rock');
    expect(isPlanted(state, 8, 6)).toBe(true);
    expect(hasNearby(state.world, quarry, 5, 6, 'rock', 5)).toBe(true);
    expect(canPlace(state, 'quarry', 5, 6)).toBe('ok');
  });
});

describe('Insel: Strand aufschütten', () => {
  it('macht Wasser am Land zu Strand und kostet etwas', () => {
    const state = lakeState();
    setStore(state, { coins: 10 });
    run(state, { type: 'fillLand', typeId: 'beach', x: 3, y: 3 });
    expect(at(state, 3, 3)).toBe('sand');
    expect(state.inventory['coins']).toBe(10 - (costOf('beach')['coins'] ?? 0));
    expect(state.revision).toBe(1);
    // Strand ist kein „gepflanztes“ Ding.
    expect(isPlanted(state, 3, 3)).toBe(false);
  });

  it('braucht Wasser, das ans Land grenzt (diagonal reicht nicht), sonst „noCoast“', () => {
    const state = createWorld(16, 16);
    const world = { ...grassState(), world: state };
    world.inventory = { coins: 100, wood: 0, stone: 0, berries: 0, furniture: 0, cake: 0 };
    world.unlocked = grassState().unlocked;
    setTerrainAt(world, 8, 8, 'grass');
    expect(canPlace(world, 'beach', 8, 7)).toBe('ok');
    expect(canPlace(world, 'beach', 9, 9)).toBe('noCoast');
    expect(canPlace(world, 'beach', 5, 5)).toBe('noCoast');
    run(world, { type: 'fillLand', typeId: 'beach', x: 5, y: 5 });
    expect(at(world, 5, 5)).toBe('water');
    // Nach dem Aufschütten wächst das Land weiter: das nächste Feld grenzt jetzt an.
    run(world, { type: 'fillLand', typeId: 'beach', x: 8, y: 7 });
    expect(canPlace(world, 'beach', 8, 6)).toBe('ok');
  });

  it('geht nicht auf Land und nicht ganz am Rand der Karte', () => {
    const state = createWorld(16, 16);
    const world = { ...grassState(), world: state };
    world.inventory['coins'] = 100;
    for (let y = 0; y < 16; y += 1) {
      setTerrainAt(world, 0, y, 'grass');
    }
    // Am Rand grenzt Wasser an Land, ist aber zu nah am Kartenrand.
    expect(ISLAND_EDGE).toBeGreaterThanOrEqual(1);
    expect(canPlace(world, 'beach', 1, 5)).toBe('outOfMap');
    expect(canPlace(world, 'beach', 0, 5)).toBe('outOfMap');
    setTerrainAt(world, ISLAND_EDGE, 5, 'grass');
    expect(canPlace(world, 'beach', ISLAND_EDGE + 1, 5)).toBe('ok');
    expect(canPlace(world, 'beach', ISLAND_EDGE, 5)).toBe('terrain');
    expect(canPlace(world, 'beach', 16 - ISLAND_EDGE, 5)).toBe('outOfMap');
    expect(canPlace(world, 'beach', -1, 5)).toBe('outOfMap');
    expect(canPlace(world, 'beach', 5, 99)).toBe('outOfMap');
  });
});

describe('Insel: Wiese anlegen', () => {
  it('macht Strand zu Wiese, auf der man bauen kann', () => {
    const state = grassState();
    setTerrainAt(state, 7, 7, 'sand');
    setTerrainAt(state, 8, 7, 'sand');
    expect(canPlace(state, 'flower', 7, 7)).toBe('terrain');
    run(state, { type: 'makeMeadow', typeId: 'meadow', x: 7, y: 7 });
    expect(at(state, 7, 7)).toBe('grass');
    expect(canPlace(state, 'flower', 7, 7)).toBe('ok');
    expect(state.revision).toBe(1);
    expect(isPlanted(state, 7, 7)).toBe(false);
  });

  it('geht nur auf Strand', () => {
    const state = lakeState();
    for (const [x, y] of [[6, 6], [2, 2]] as const) {
      expect(canPlace(state, 'meadow', x, y), `${String(x)},${String(y)}`).toBe('terrain');
    }
  });
});

describe('Insel: gesperrt', () => {
  it('beach und meadow sind gesperrt, bis genug Taler verdient sind; Baum und Fels sind von Anfang an frei', () => {
    const sim = new Simulation(createInitialState(1));
    const state = sim.state;
    const water = findCoastWater(state as SimState);
    expect(checkPlacement(state, 'beach', water.x, water.y).result).toBe('locked');
    expect(checkPlacement(state, 'meadow', water.x, water.y).result).toBe('locked');
    expect(checkPlacement(state, 'tree', 24, 12).result).not.toBe('locked');
    expect(checkPlacement(state, 'rock', 24, 12).result).not.toBe('locked');
    sim.send({ type: 'fillLand', typeId: 'beach', x: water.x, y: water.y });
    sim.update(sim.tickMs);
    expect(terrainAt(sim.state.world, water.x, water.y)).toBe('water');
  });
});

describe('Insel: Abreißen', () => {
  it('reißt einen gepflanzten Baum ab, erstattet die Kosten und macht die Kachel wieder zur Wiese', () => {
    const state = grassState();
    setStore(state, { coins: 30 });
    run(state, { type: 'plantTree', typeId: 'tree', x: 6, y: 6 });
    const afterPlanting = state.inventory['coins'] ?? 0;
    const revision = state.revision;
    expect(plantedRefund(state, 6, 6)).toEqual(costOf('tree'));
    run(state, { type: 'demolish', x: 6, y: 6 });
    expect(at(state, 6, 6)).toBe('grass');
    expect(isPlanted(state, 6, 6)).toBe(false);
    expect(state.inventory['coins']).toBe(afterPlanting + (costOf('tree')['coins'] ?? 0));
    expect(state.inventory['coins']).toBe(30);
    expect(state.revision).toBe(revision + 1);
  });

  it('reißt auch einen gepflanzten Fels ab und erstattet dessen Kosten', () => {
    const state = grassState();
    setStore(state, { coins: 30 });
    run(state, { type: 'placeRock', typeId: 'rock', x: 6, y: 6 }, { type: 'demolish', x: 6, y: 6 });
    expect(at(state, 6, 6)).toBe('grass');
    expect(state.inventory['coins']).toBe(30);
  });

  it('lässt natürliche Bäume und Felsen stehen (nichts passiert, nichts wird erstattet)', () => {
    const state = grassState();
    setTerrainAt(state, 5, 5, 'forest');
    setTerrainAt(state, 6, 5, 'rock');
    const before = structuredClone(state);
    run(state, { type: 'demolish', x: 5, y: 5 }, { type: 'demolish', x: 6, y: 5 });
    expect(state).toEqual(before);
  });

  it('Aufschütten und Wiese anlegen lassen sich nicht rückgängig machen: Abreißen tut nichts und erstattet nichts', () => {
    const state = lakeState();
    setStore(state, { coins: 50 });
    run(state, { type: 'fillLand', typeId: 'beach', x: 3, y: 3 });
    const coins = state.inventory['coins'];
    const before = structuredClone(state);
    run(state, { type: 'demolish', x: 3, y: 3 });
    expect(state).toEqual(before);
    expect(state.inventory['coins']).toBe(coins);
    setTerrainAt(state, 8, 8, 'sand');
    run(state, { type: 'makeMeadow', typeId: 'meadow', x: 8, y: 8 });
    const afterMeadow = structuredClone(state);
    run(state, { type: 'demolish', x: 8, y: 8 });
    expect(state).toEqual(afterMeadow);
  });

  it('ein Haus auf einer Kachel geht vor: Abreißen nimmt zuerst das Gebäude', () => {
    const state = grassState();
    buildConnected(state, 'house-red', 2, 2);
    run(state, { type: 'plantTree', typeId: 'tree', x: 8, y: 8 });
    run(state, { type: 'demolish', x: 2, y: 2 });
    expect(state.buildings).toHaveLength(0);
    expect(at(state, 8, 8)).toBe('forest');
  });

  it('bei Wald, der später etwas anderes wird, gibt es nichts zu erstatten', () => {
    const state = grassState();
    run(state, { type: 'plantTree', typeId: 'tree', x: 6, y: 6 });
    setTerrainAt(state, 6, 6, 'grass');
    expect(plantedRefund(state, 6, 6)).toEqual({});
  });

  it('bei Kosten, die die Obergrenze überschreiten würden, bleibt das Lager ganz (kein Überlauf)', () => {
    const state = grassState();
    run(state, { type: 'plantTree', typeId: 'tree', x: 6, y: 6 });
    state.inventory['coins'] = 99999;
    run(state, { type: 'demolish', x: 6, y: 6 });
    expect(state.inventory['coins']).toBe(99999);
  });
});

describe('Insel: Daten und Zustand', () => {
  it('jeder Inselbefehl gehört zu einem Artikel mit passender Aktion', () => {
    for (const type of typesOf('island')) {
      const command = placementCommand(type.id, 3, 4);
      expect(command.type, type.id).toBe(type.island?.action);
      expect(command, type.id).toMatchObject({ typeId: type.id, x: 3, y: 4 });
      expect(islandResult(type.id), type.id).toBeDefined();
    }
    expect(islandResult('house-red')).toBeUndefined();
  });

  it('ein Inselbefehl mit dem falschen Artikel (oder einem Gebäude) ändert nichts', () => {
    const state = grassState();
    const before = structuredClone(state);
    applyCommand(state, { type: 'plantTree', typeId: 'rock', x: 5, y: 5 });
    applyCommand(state, { type: 'placeRock', typeId: 'house-red', x: 5, y: 5 });
    applyCommand(state, { type: 'fillLand', typeId: 'nope', x: 5, y: 5 });
    expect(state).toEqual(before);
  });

  it('merkt sich je gepflanzter Kachel den Artikel – die Erstattung folgt diesem Artikel', () => {
    const state = grassState();
    run(state, { type: 'plantTree', typeId: 'tree', x: 4, y: 4 }, { type: 'placeRock', typeId: 'rock', x: 6, y: 4 });
    expect(state.planted).toEqual([
      { index: 4 * 16 + 4, type: 'tree' },
      { index: 4 * 16 + 6, type: 'rock' },
    ]);
    expect(plantedRefund(state, 6, 4)).toEqual(costOf('rock'));
    // Ein Artikel, der nicht (mehr) zum Gelände passt, erstattet nichts.
    setTerrainAt(state, 6, 4, 'forest');
    expect(plantedRefund(state, 6, 4)).toEqual({});
  });

  it('Inselartikel sind 1×1 und kosten etwas', () => {
    for (const type of typesOf('island')) {
      expect(type.footprint, type.id).toEqual({ w: 1, h: 1 });
      expect(Object.keys(costOf(type.id)).length, type.id).toBeGreaterThan(0);
    }
  });

  it('der Bau-Befehl für einen Inselartikel baut nichts', () => {
    const state = grassState();
    run(state, { type: 'placeBuilding', buildingType: 'tree', x: 5, y: 5 });
    expect(state.buildings).toHaveLength(0);
    expect(at(state, 5, 5)).toBe('grass');
  });

  it('hält die Liste der gepflanzten Kacheln sortiert und ohne Doppelte', () => {
    const state = grassState();
    run(state, { type: 'plantTree', typeId: 'tree', x: 9, y: 9 }, { type: 'plantTree', typeId: 'tree', x: 2, y: 2 }, { type: 'placeRock', typeId: 'rock', x: 5, y: 5 }, { type: 'plantTree', typeId: 'tree', x: 2, y: 2 });
    expect(state.planted.map((planted) => planted.index)).toEqual([2 * 16 + 2, 5 * 16 + 5, 9 * 16 + 9]);
  });

  it('normalizePlanted behält nur Kacheln, die noch Wald oder Fels sind', () => {
    const state = grassState();
    run(state, { type: 'plantTree', typeId: 'tree', x: 9, y: 9 }, { type: 'placeRock', typeId: 'rock', x: 5, y: 5 });
    const raw = [...state.planted, { index: 0, type: 'tree' }, { index: 9 * 16 + 9, type: 'tree' }, { index: -3, type: 'tree' }, { index: 1.5, type: 'tree' }, { index: 9999, type: 'tree' }, 'x', { index: 3 * 16 + 3, type: 'rock' }, { index: 5 * 16 + 5, type: 'house-red' }, { index: 5 * 16 + 5, type: 'rock' }];
    expect(normalizePlanted(raw, state.world)).toEqual([
      { index: 5 * 16 + 5, type: 'rock' },
      { index: 9 * 16 + 9, type: 'tree' },
    ]);
    expect(normalizePlanted(undefined, state.world)).toEqual([]);
  });

  it('läuft über die Simulation: Befehle gelten zu Beginn des nächsten Ticks', () => {
    const sim = new Simulation(createInitialState(1));
    const { width, height } = sim.state.world;
    // Eine Wiese ohne alles in der Nähe der Mitte.
    const probe = structuredClone(sim.state) as SimState;
    let spot: { x: number; y: number } | undefined;
    for (let y = 5; y < height - 5 && !spot; y += 1) {
      for (let x = 5; x < width - 5 && !spot; x += 1) {
        if (checkPlacement(probe, 'tree', x, y).result === 'ok') {
          spot = { x, y };
        }
      }
    }
    expect(spot).toBeDefined();
    if (!spot) {
      return;
    }
    const revision = sim.state.revision;
    sim.send({ type: 'plantTree', typeId: 'tree', x: spot.x, y: spot.y });
    expect(terrainAt(sim.state.world, spot.x, spot.y)).toBe('grass');
    sim.update(sim.tickMs);
    expect(terrainAt(sim.state.world, spot.x, spot.y)).toBe('forest');
    expect(sim.state.revision).toBe(revision + 1);
  });
});

function findCoastWater(state: SimState): { x: number; y: number } {
  for (let y = 3; y < state.world.height - 3; y += 1) {
    for (let x = 3; x < state.world.width - 3; x += 1) {
      if (terrainAt(state.world, x, y) === 'water' && (terrainAt(state.world, x + 1, y) !== 'water' || terrainAt(state.world, x, y + 1) !== 'water')) {
        return { x, y };
      }
    }
  }
  throw new Error('keine Küste');
}
