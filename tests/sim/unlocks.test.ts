import { describe, expect, it } from 'vitest';
import { BUILDING_TYPES, LOCKED_TYPE_IDS, buildingType, unlockOf } from '../../src/data/buildings';
import { checkPlacement, canPlace } from '../../src/sim/buildings';
import { buildConnected, fillTerrain, grassState, run, setStore, setTerrainAt } from './helpers';
import type { DeepReadonly } from '../../src/sim/readonly';
import { Simulation } from '../../src/sim/simulation';
import { createInitialState, type SimState } from '../../src/sim/state';
import { checkUnlocks, isUnlocked, lockOf, normalizeUnlocked, progressOf } from '../../src/sim/unlocks';

/** Ein Zustand wie am Start, in dem noch nichts freigeschaltet ist (Grasfläche, nur reich). */
function lockedState(): SimState {
  const state = grassState();
  state.unlocked = [];
  return state;
}

describe('Freischaltungen: Bedingungen', () => {
  it('Typen ohne Bedingung sind von Anfang an frei, auch ohne Eintrag in „unlocked“', () => {
    const state = lockedState();
    for (const id of ['path', 'house-red', 'lumberjack', 'berry-garden', 'market', 'flower', 'tree', 'rock']) {
      expect(isUnlocked(state, id), id).toBe(true);
    }
  });

  it('Typen mit Bedingung sind gesperrt, bis sie in „unlocked“ stehen', () => {
    const state = lockedState();
    expect(isUnlocked(state, 'carpenter')).toBe(false);
    state.unlocked.push('carpenter');
    expect(isUnlocked(state, 'carpenter')).toBe(true);
  });

  it('die Schreinerei braucht einen Holzfäller', () => {
    const state = lockedState();
    expect(unlockOf('carpenter')).toEqual({ kind: 'count', building: 'lumberjack', count: 1 });
    expect(progressOf(state, unlockOf('carpenter') ?? { kind: 'houses', count: 1 })).toEqual({ current: 0, needed: 1 });
    expect(checkUnlocks(state)).not.toContain('carpenter');
    fillTerrain(state, 8, 3, 1, 1, 'forest');
    buildConnected(state, 'lumberjack', 3, 3);
    expect(checkUnlocks(state)).toContain('carpenter');
    expect(state.unlocked).toContain('carpenter');
  });

  it('„houses“ zählt Häuser jeder Sorte', () => {
    const state = lockedState();
    expect(unlockOf('house-big')).toEqual({ kind: 'houses', count: 2 });
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 2, y: 2 });
    expect(checkUnlocks(state)).not.toContain('house-big');
    expect(lockOf(state, 'house-big')?.progress).toEqual({ current: 1, needed: 2 });
    run(state, { type: 'placeBuilding', buildingType: 'house-blue', x: 6, y: 2 });
    expect(checkUnlocks(state)).toContain('house-big');
    expect(lockOf(state, 'house-big')).toBeUndefined();
  });

  it('„earned“ zählt verdiente Taler, begrenzt auf die Zahl der Bedingung', () => {
    const state = lockedState();
    const unlock = unlockOf('bench');
    expect(unlock?.kind).toBe('earned');
    state.earnedCoins = 25;
    expect(lockOf(state, 'bench')?.progress).toEqual({ current: 25, needed: 40 });
    state.earnedCoins = 4000;
    expect(progressOf(state, unlock ?? { kind: 'earned', coins: 1 })).toEqual({ current: 40, needed: 40 });
    expect(checkUnlocks(state)).toContain('bench');
  });

  it('meldet jede Freischaltung nur einmal und in der Reihenfolge der Datei', () => {
    const state = lockedState();
    state.earnedCoins = 100000;
    const first = checkUnlocks(state);
    expect(first.length).toBeGreaterThan(1);
    const order = BUILDING_TYPES.map((type) => type.id);
    expect(first).toEqual([...first].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    expect(checkUnlocks(state)).toEqual([]);
    expect(new Set(state.unlocked).size).toBe(state.unlocked.length);
  });

  it('bleibt für immer frei, auch wenn der Holzfäller wieder abgerissen wird', () => {
    const state = lockedState();
    fillTerrain(state, 8, 3, 1, 1, 'forest');
    buildConnected(state, 'lumberjack', 3, 3);
    checkUnlocks(state);
    run(state, { type: 'demolish', x: 3, y: 3 });
    expect(state.buildings.some((b) => b.type === 'lumberjack')).toBe(false);
    checkUnlocks(state);
    expect(isUnlocked(state, 'carpenter')).toBe(true);
    expect(canPlace({ ...state, inventory: { ...state.inventory, coins: 999, wood: 99, stone: 99 } }, 'carpenter', 8, 8)).toBe('ok');
  });
});

describe('Freischaltungen: Platzieren', () => {
  it('lehnt einen gesperrten Typ mit „locked“ ab – vor allem anderen außer unbekannten Typen', () => {
    const state = lockedState();
    expect(checkPlacement(state, 'carpenter', 4, 4)).toEqual({ result: 'locked' });
    // Auch dort, wo er sowieso nicht hinpasst, sagt die Prüfung zuerst „gesperrt“.
    setTerrainAt(state, 4, 4, 'water');
    expect(canPlace(state, 'carpenter', 4, 4)).toBe('locked');
    expect(canPlace(state, 'carpenter', -5, 4)).toBe('locked');
    expect(canPlace(state, 'nope', 4, 4)).toBe('blocked');
  });

  it('der Befehl placeBuilding ändert bei einem gesperrten Typ nichts: nichts gebaut, nichts bezahlt', () => {
    const state = lockedState();
    const before = structuredClone(state);
    run(state, { type: 'placeBuilding', buildingType: 'carpenter', x: 4, y: 4 });
    expect(state).toEqual(before);
  });

  it('der Befehl baut den Typ, sobald er frei ist', () => {
    const state = lockedState();
    state.unlocked.push('carpenter');
    run(state, { type: 'placeBuilding', buildingType: 'carpenter', x: 4, y: 4 });
    expect(state.buildings.some((b) => b.type === 'carpenter')).toBe(true);
  });

  it('Verschieben bleibt immer erlaubt (Gebäude, die schon stehen, sperren nie)', () => {
    const state = lockedState();
    state.unlocked.push('carpenter');
    run(state, { type: 'placeBuilding', buildingType: 'carpenter', x: 4, y: 4 });
    state.unlocked = [];
    const id = state.buildings.find((b) => b.type === 'carpenter')?.id ?? -1;
    run(state, { type: 'moveBuilding', id, x: 9, y: 9 });
    expect(state.buildings.find((b) => b.id === id)).toMatchObject({ x: 9, y: 9 });
  });

  it('der Zustand merkt sich keine Typen ohne Bedingung', () => {
    const state = createInitialState(1);
    for (const id of state.unlocked) {
      expect(unlockOf(id), id).toBeDefined();
    }
  });
});

describe('Freischaltungen im laufenden Spiel', () => {
  it('schaltet die Bäckerei schon im Startdorf frei (Beerengarten steht) und die Schreinerei erst nach dem Holzfäller', () => {
    const sim = new Simulation(createInitialState(1));
    expect(sim.state.unlocked).toContain('bakery');
    expect(sim.state.unlocked).not.toContain('carpenter');
    expect(sim.state.unlocked).toEqual([...checkUnlocksOnCopy(sim.state)].slice(0, sim.state.unlocked.length));
  });

  it('prüft nach den Befehlen desselben Ticks – auch pausiert', () => {
    for (const paused of [false, true]) {
      const sim = new Simulation(createInitialState(1));
      sim.send({ type: 'setPaused', paused });
      sim.update(sim.tickMs);
      // Bei der Pause wird der Holzfäller trotzdem gesetzt (Befehle gelten immer).
      const spot = findLumberjackSpot(sim);
      sim.send({ type: 'placeBuilding', buildingType: 'lumberjack', x: spot.x, y: spot.y });
      sim.update(sim.tickMs);
      expect(sim.state.buildings.some((b) => b.type === 'lumberjack'), `pausiert ${String(paused)}`).toBe(true);
      expect(sim.state.unlocked, `pausiert ${String(paused)}`).toContain('carpenter');
    }
  });

  it('zählt den Marktertrag in „earnedCoins“ und schaltet damit Taler-Freischaltungen', () => {
    // Beeren im Lager: der Markt verkauft sie (über der Reserve von 4).
    const state = createInitialState(1);
    state.inventory['berries'] = 100;
    const sim = new Simulation(state);
    expect(sim.state.earnedCoins).toBe(0);
    expect(sim.state.unlocked).not.toContain('bench');
    const start = sim.state.inventory['coins'] ?? 0;
    for (let i = 0; i < 3000 && (sim.state.earnedCoins ?? 0) < 40; i += 1) {
      sim.update(sim.tickMs);
    }
    expect(sim.state.earnedCoins).toBeGreaterThanOrEqual(40);
    expect(sim.state.inventory['coins']).toBeGreaterThan(start);
    expect(sim.state.unlocked).toContain('bench');
  });

  it('läuft deterministisch: gleiche Befehle, gleiche Freischaltungen', () => {
    const run1 = playScript();
    const run2 = playScript();
    expect(run1.unlocked).toEqual(run2.unlocked);
    expect(run1.earnedCoins).toBe(run2.earnedCoins);
  });
});

function checkUnlocksOnCopy(state: DeepReadonly<SimState>): string[] {
  const copy = structuredClone(state) as SimState;
  copy.unlocked = [];
  checkUnlocks(copy);
  return copy.unlocked;
}

function findLumberjackSpot(sim: Simulation): { x: number; y: number } {
  const state = structuredClone(sim.state) as SimState;
  setStore(state, { coins: 999, wood: 99, stone: 99 });
  for (let y = 0; y < state.world.height; y += 1) {
    for (let x = 0; x < state.world.width; x += 1) {
      if (canPlace(state, 'lumberjack', x, y) === 'ok') {
        return { x, y };
      }
    }
  }
  throw new Error('kein Platz für den Holzfäller');
}

function playScript(): { unlocked: string[]; earnedCoins: number } {
  const sim = new Simulation(createInitialState(2));
  const spot = findLumberjackSpot(sim);
  sim.send({ type: 'placeBuilding', buildingType: 'lumberjack', x: spot.x, y: spot.y });
  for (let i = 0; i < 2000; i += 1) {
    sim.update(sim.tickMs);
  }
  return { unlocked: [...sim.state.unlocked], earnedCoins: sim.state.earnedCoins };
}

describe('Daten: Freischaltungen', () => {
  it('sperrt nichts, was man zum Weiterkommen braucht: Holzfäller, Beerengarten, Markt, Baum, Fels, Weg', () => {
    for (const id of ['lumberjack', 'berry-garden', 'market', 'tree', 'rock', 'path', 'house-red', 'flower']) {
      expect(unlockOf(id), id).toBeUndefined();
    }
  });

  it('hat mindestens eine Bedingung jeder Art', () => {
    const kinds = new Set(LOCKED_TYPE_IDS.map((id) => unlockOf(id)?.kind));
    expect(kinds).toEqual(new Set(['count', 'houses', 'earned']));
  });

  it('normalizeUnlocked behält nur bekannte Typen mit Bedingung, ohne Doppelte', () => {
    expect(normalizeUnlocked(['bench', 'bench', 'lumberjack', 'nope', 42, 'carpenter'])).toEqual(['bench', 'carpenter']);
    expect(normalizeUnlocked('kaputt')).toEqual([]);
    expect(normalizeUnlocked(undefined)).toEqual([]);
  });

  it('kaputte Bedingungen sperren einen Typ nie dauerhaft (unlockOf liefert dann „frei“)', () => {
    const type = buildingType('bench');
    expect(type).toBeDefined();
    if (!type) {
      return;
    }
    const original = type.unlock;
    try {
      (type as { unlock?: unknown }).unlock = { kind: 'earned', coins: -5 };
      expect(unlockOf('bench')).toBeUndefined();
      (type as { unlock?: unknown }).unlock = { kind: 'count', building: 'nope', count: 1 };
      expect(unlockOf('bench')).toBeUndefined();
      (type as { unlock?: unknown }).unlock = { kind: 'count', building: 'bench', count: 1 };
      expect(unlockOf('bench')).toBeUndefined();
      (type as { unlock?: unknown }).unlock = { kind: 'zauber' };
      expect(unlockOf('bench')).toBeUndefined();
    } finally {
      (type as { unlock?: unknown }).unlock = original;
    }
    expect(unlockOf('bench')?.kind).toBe('earned');
  });
});
