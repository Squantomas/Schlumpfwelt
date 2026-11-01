import { describe, expect, it } from 'vitest';
import { RESIDENT_RULES } from '../../src/data/residents';
import { moodOf } from '../../src/sim/mood';
import { checkHome, settleResidents } from '../../src/sim/residents';
import { fromSaveData, saveToText } from '../../src/sim/saveData';
import { Simulation } from '../../src/sim/simulation';
import { createInitialState, type SimState } from '../../src/sim/state';
import { doorOf } from '../../src/sim/walk';
import { fillTerrain, grassState, run } from './helpers';

const idOf = (state: SimState, type: string, x: number, y: number): number => {
  const id = state.buildings.find((b) => b.type === type && b.x === x && b.y === y)?.id;
  if (id === undefined) {
    throw new Error(`${type} fehlt`);
  }
  return id;
};

/**
 * A 32×32 meadow with a path along y 10: a berry garden (4, 11), a market (20, 11), a small house (4, 8) where both
 * workers live, a big house (12, 7) and a second small house (24, 8), both empty.
 */
function village(): { state: SimState; small: number; big: number; other: number; garden: number; market: number } {
  const state = grassState(32);
  run(
    state,
    { type: 'placePaths', tiles: Array.from({ length: 28 }, (_, i) => ({ x: 2 + i, y: 10 })) },
    { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 8 },
    { type: 'placeBuilding', buildingType: 'berry-garden', x: 4, y: 11 },
    { type: 'placeBuilding', buildingType: 'market', x: 20, y: 11 },
    { type: 'placeBuilding', buildingType: 'house-big', x: 12, y: 7 },
    { type: 'placeBuilding', buildingType: 'house-blue', x: 24, y: 8 },
  );
  return {
    state,
    small: idOf(state, 'house-red', 4, 8),
    big: idOf(state, 'house-big', 12, 7),
    other: idOf(state, 'house-blue', 24, 8),
    garden: idOf(state, 'berry-garden', 4, 11),
    market: idOf(state, 'market', 20, 11),
  };
}

const residentAt = (state: SimState, job: number): SimState['residents'][number] => {
  const resident = state.residents.find((r) => r.job === job);
  if (!resident) {
    throw new Error('fehlt');
  }
  return resident;
};

describe('checkHome: darf ein Bewohner in dieses Haus ziehen?', () => {
  it('ok bei freiem Platz, same für das eigene Haus, full mit „2/2“, noHouse für alles andere', () => {
    const { state, small, big, garden } = village();
    const gardener = residentAt(state, garden);
    expect(gardener.home).toBe(small);
    expect(checkHome(state, gardener.id, big)).toEqual({ result: 'ok', used: 0, capacity: 4 });
    expect(checkHome(state, gardener.id, small)).toEqual({ result: 'same', used: 2, capacity: 2 });
    run(state, { type: 'inviteResident', typeId: 'invite' });
    const guest = state.residents.find((r) => r.job === null);
    expect(guest?.home).toBe(big);
    expect(guest && checkHome(state, guest.id, small)).toEqual({ result: 'full', used: 2, capacity: 2 });
    expect(checkHome(state, gardener.id, garden)).toEqual({ result: 'noHouse', used: 0, capacity: 0 });
    run(state, { type: 'placeBuilding', buildingType: 'flower', x: 8, y: 8 });
    expect(checkHome(state, gardener.id, idOf(state, 'flower', 8, 8)).result).toBe('noHouse');
    expect(checkHome(state, gardener.id, 9999).result).toBe('noHouse');
    expect(checkHome(state, 9999, big).result).toBe('noResident');
  });

  it('wer noch auf dem Boot ist, zieht erst nach dem Aussteigen um', () => {
    const state = grassState(24);
    fillTerrain(state, 0, 0, 24, 3, 'water');
    fillTerrain(state, 0, 21, 24, 3, 'water');
    fillTerrain(state, 0, 0, 3, 24, 'water');
    fillTerrain(state, 21, 0, 3, 24, 'water');
    run(state, { type: 'placeBuilding', buildingType: 'house-big', x: 10, y: 10 }, { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 5 }, { type: 'inviteResident', typeId: 'invite' });
    const guest = state.residents[0];
    expect(guest?.doing).toBe('boat');
    const red = idOf(state, 'house-red', 5, 5);
    expect(guest && checkHome(state, guest.id, red).result).toBe('noResident');
    const before = structuredClone(state);
    run(state, { type: 'assignHome', residentId: guest?.id ?? 0, houseId: red });
    expect(state).toEqual(before);
  });
});

describe('assignHome: umziehen', () => {
  it('zieht sofort ein: steht an der neuen Tür und ruht sich aus; zählt als Änderung', () => {
    const { state, big, garden } = village();
    const gardener = residentAt(state, garden);
    gardener.carrying = 'berries';
    gardener.trips = 2;
    const revision = state.revision;
    run(state, { type: 'assignHome', residentId: gardener.id, houseId: big });
    const house = state.buildings.find((b) => b.id === big);
    expect(gardener).toMatchObject({
      home: big,
      at: house && doorOf(state, house),
      route: [],
      step: 0,
      doing: 'stay',
      goal: 'home',
      place: big,
      timer: RESIDENT_RULES.routine.restTicks,
      carrying: null,
      trips: 0,
    });
    expect(state.revision).toBe(revision + 1);
  });

  it('in ein volles Haus, ins eigene oder in kein Haus: nichts ändert sich', () => {
    const { state, small, garden, market } = village();
    run(state, { type: 'inviteResident', typeId: 'invite' });
    const guest = state.residents.find((r) => r.job === null);
    if (!guest) {
      throw new Error('fehlt');
    }
    const before = structuredClone(state);
    run(
      state,
      { type: 'assignHome', residentId: guest.id, houseId: small },
      { type: 'assignHome', residentId: residentAt(state, garden).id, houseId: small },
      { type: 'assignHome', residentId: guest.id, houseId: market },
      { type: 'assignHome', residentId: 777, houseId: small },
    );
    expect(state).toEqual(before);
  });

  it('das neue Zuhause bleibt: neue Häuser näher an der Arbeit, Abrisse anderswo und viele Ticks ändern es nicht', () => {
    const { state, other, garden, market } = village();
    const gardener = residentAt(state, garden);
    const trader = residentAt(state, market);
    run(state, { type: 'assignHome', residentId: gardener.id, houseId: other });
    run(
      state,
      { type: 'placeBuilding', buildingType: 'house-yellow', x: 7, y: 8 },
      { type: 'placeBuilding', buildingType: 'house-garden', x: 2, y: 13 },
      { type: 'demolish', x: 12, y: 7 },
      { type: 'moveBuilding', id: garden, x: 8, y: 11 },
    );
    expect(gardener.home).toBe(other);
    const sim = new Simulation(state);
    for (let i = 0; i < 3000; i += 1) {
      sim.update(sim.tickMs);
    }
    expect(sim.state.residents.find((r) => r.id === gardener.id)?.home).toBe(other);
    expect(sim.state.residents.find((r) => r.id === trader.id)?.home).toBe(trader.home);
    // settleResidents twice changes nothing.
    const settled = structuredClone(sim.state) as SimState;
    const again = structuredClone(settled);
    settleResidents(again);
    expect(again).toEqual(settled);
  });

  it('der frei gewordene Platz bleibt frei – der nächste Gast zieht dort ein', () => {
    const { state, small, big, other, market } = village();
    const trader = residentAt(state, market);
    run(state, { type: 'assignHome', residentId: trader.id, houseId: other });
    expect(state.residents.filter((r) => r.home === small)).toHaveLength(1);
    // The next guest moves into the first house (in the order they were built) with room: the small one.
    run(state, { type: 'inviteResident', typeId: 'invite' });
    expect(state.residents.filter((r) => r.home === small)).toHaveLength(2);
    expect(state.residents.filter((r) => r.home === big)).toHaveLength(0);
    expect(trader.home).toBe(other);
  });

  it('Abreißen des neuen Hauses macht nur obdachlos; niemand wird weggeschickt', () => {
    const { state, other, garden } = village();
    const gardener = residentAt(state, garden);
    run(state, { type: 'assignHome', residentId: gardener.id, houseId: other });
    const count = state.residents.length;
    run(state, { type: 'demolish', x: 24, y: 8 });
    expect(state.residents).toHaveLength(count);
    // He moves into the next house with room (the big one), the village does it by itself.
    expect(gardener.home).not.toBe(other);
    expect(gardener.home).not.toBeNull();
  });

  it('über die Simulation: der Befehl gilt zu Beginn des nächsten Ticks; nach Speichern und Laden bleibt das Zuhause', () => {
    const { state, big, garden } = village();
    const sim = new Simulation(state);
    const id = residentAt(state, garden).id;
    sim.send({ type: 'assignHome', residentId: id, houseId: big });
    expect(sim.state.residents.find((r) => r.id === id)?.home).not.toBe(big);
    sim.update(sim.tickMs);
    expect(sim.state.residents.find((r) => r.id === id)?.home).toBe(big);
    const loaded = fromSaveData(JSON.parse(saveToText(sim.state)));
    expect(loaded.ok && loaded.state.residents.find((r) => r.id === id)?.home).toBe(big);
  });

  it('im Startdorf: wer in ein neues Haus ohne Deko zieht, ist nur noch normal gelaunt, mit Blumen wieder fröhlich', () => {
    const state = createInitialState(1);
    const cx = Math.floor(state.world.width / 2);
    const cy = Math.floor(state.world.height / 2);
    run(state, { type: 'placeBuilding', buildingType: 'house-blue', x: cx + 3, y: cy - 5 });
    const blue = idOf(state, 'house-blue', cx + 3, cy - 5);
    const [first, second] = state.residents;
    if (!first || !second) {
      throw new Error('fehlt');
    }
    expect(moodOf(state, first).mood).toBe('happy');
    run(state, { type: 'assignHome', residentId: first.id, houseId: blue });
    expect(first.home).toBe(blue);
    expect(moodOf(state, first).mood).toBe('normal');
    expect(moodOf(state, second).mood).toBe('happy');
    run(state, { type: 'placeBuilding', buildingType: 'flower', x: cx + 5, y: cy - 5 });
    expect(moodOf(state, first).mood).toBe('happy');
  });
});
