import { describe, expect, it } from 'vitest';
import { buildingType, capacityOf } from '../../src/data/buildings';
import { HAT_IDS, RESIDENT_NAMES, RESIDENT_RULES } from '../../src/data/residents';
import { MAX_RESIDENTS } from '../../src/sim/limits';
import {
  STEPS_PER_TILE,
  activityOf,
  boatPoint,
  carriedGood,
  checkInvite,
  housing,
  inviteHome,
  residentPoint,
  settleResidents,
  type Resident,
} from '../../src/sim/residents';
import { Simulation } from '../../src/sim/simulation';
import { createInitialState, type SimState } from '../../src/sim/state';
import { doorOf, isWalkable } from '../../src/sim/walk';
import { fillTerrain, grassState, run, setStore, tickN } from './helpers';

/** A 24×24 island: meadow inside a sea border of 3 tiles (so boats can come). */
function seaState(size = 24): SimState {
  const state = grassState(size);
  fillTerrain(state, 0, 0, size, 3, 'water');
  fillTerrain(state, 0, size - 3, size, 3, 'water');
  fillTerrain(state, 0, 0, 3, size, 'water');
  fillTerrain(state, size - 3, 0, 3, size, 'water');
  return state;
}

const idOf = (state: SimState, type: string, x: number, y: number): number => {
  const id = state.buildings.find((b) => b.type === type && b.x === x && b.y === y)?.id;
  if (id === undefined) {
    throw new Error(`${type} fehlt`);
  }
  return id;
};

const tick = (sim: Simulation, count = 1): void => {
  for (let i = 0; i < count; i += 1) {
    sim.update(sim.tickMs);
  }
};

/** A path row from x 4 to 19 at y 12 with a market below it at (16, 13). */
function village(): SimState {
  const state = seaState();
  run(state, { type: 'placePaths', tiles: Array.from({ length: 16 }, (_, i) => ({ x: 4 + i, y: 12 })) }, { type: 'placeBuilding', buildingType: 'market', x: 16, y: 13 });
  return state;
}

/** Checks what must always hold: one worker per production building, houses not over full, everybody on land, ways step by step. */
function expectSound(state: DeepState): void {
  const jobs = new Map<number, number>();
  const homes = new Map<number, number>();
  for (const resident of state.residents) {
    if (resident.job !== null) {
      jobs.set(resident.job, (jobs.get(resident.job) ?? 0) + 1);
    }
    if (resident.home !== null) {
      homes.set(resident.home, (homes.get(resident.home) ?? 0) + 1);
    }
    expect(isWalkable(state.world, resident.at), `${resident.name} steht auf Land`).toBe(true);
    let previous = resident.at;
    for (const tile of resident.route) {
      const w = state.world.width;
      expect(Math.abs((tile % w) - (previous % w)) + Math.abs(Math.floor(tile / w) - Math.floor(previous / w))).toBe(1);
      previous = tile;
    }
    expect(resident.step).toBeGreaterThanOrEqual(0);
    expect(resident.step).toBeLessThan(STEPS_PER_TILE);
  }
  for (const building of state.buildings) {
    const type = buildingType(building.type);
    if (type?.category === 'production' && state.residents.length < MAX_RESIDENTS) {
      expect(jobs.get(building.id), `${building.type} hat einen Arbeiter`).toBe(1);
    }
    if (type?.category === 'house') {
      expect(homes.get(building.id) ?? 0).toBeLessThanOrEqual(capacityOf(building.type));
    }
  }
  for (const [job, count] of jobs) {
    expect(count).toBe(1);
    expect(buildingType(state.buildings.find((b) => b.id === job)?.type ?? '')?.category).toBe('production');
  }
}

type DeepState = Simulation['state'];

describe('Bewohner im Startdorf', () => {
  it('der Gärtner und der Händler wohnen im Pilzhaus und stehen bei der Arbeit', () => {
    const state = createInitialState(1);
    expect(state.residents).toHaveLength(2);
    const house = state.buildings.find((b) => b.type === 'house-red');
    const garden = state.buildings.find((b) => b.type === 'berry-garden');
    const market = state.buildings.find((b) => b.type === 'market');
    expect(state.residents.map((r) => r.job)).toEqual([garden?.id, market?.id]);
    for (const resident of state.residents) {
      expect(resident.home).toBe(house?.id);
      expect(resident.doing).toBe('stay');
      expect(resident.goal).toBe('work');
      const job = state.buildings.find((b) => b.id === resident.job);
      expect(job && resident.at).toBe(job && doorOf(state, job));
      expect(RESIDENT_NAMES).toContain(resident.name);
      expect(resident.hat).toBeGreaterThanOrEqual(0);
      expect(resident.hat).toBeLessThan(HAT_IDS.length);
    }
    expect(state.residents[0]?.name).not.toBe(state.residents[1]?.name);
    expect(state.boats).toEqual([]);
    expect(state.nextResidentId).toBe(3);
    expect(state.revision).toBe(0);
  });

  it('ist für jeden Seed gleich, und verschiedene Seeds geben verschiedene Namen', () => {
    expect(createInitialState(5).residents).toEqual(createInitialState(5).residents);
    const names = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => createInitialState(seed).residents.map((r) => r.name).join()));
    expect(names.size).toBeGreaterThan(4);
  });

  it('das Haus des Startdorfs ist voll: zum Einladen braucht es erst ein neues Haus', () => {
    const state = createInitialState(1);
    expect(housing(state)).toEqual({ residents: 2, capacity: 2 });
    expect(checkInvite(state, 'invite').result).toBe('noHouse');
  });
});

describe('Arbeiter: jedes Produktionsgebäude hat sofort einen', () => {
  it('ein neues Gebäude ohne freien Bewohner bekommt einen neuen, der mit dem Boot kommt – und arbeitet sofort', () => {
    const state = village();
    run(state, { type: 'placeBuilding', buildingType: 'berry-garden', x: 6, y: 10 });
    const garden = idOf(state, 'berry-garden', 6, 10);
    const worker = state.residents.find((r) => r.job === garden);
    expect(worker?.doing).toBe('boat');
    expect(state.boats.map((b) => b.passenger)).toContain(worker?.id);
    expect(state.production.find((p) => p.buildingId === garden)?.status).toBe('working');
    expectSound(state);
  });

  it('nimmt den nächsten Bewohner ohne Arbeit, statt einen neuen zu holen', () => {
    const state = village();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 10 }, { type: 'placeBuilding', buildingType: 'house-red', x: 10, y: 10 });
    run(state, { type: 'inviteResident', typeId: 'invite' }, { type: 'inviteResident', typeId: 'invite' });
    const sim = new Simulation(state);
    tick(sim, 400);
    const before = sim.state.residents.length;
    const idle = sim.state.residents.filter((r) => r.job === null);
    expect(idle.length).toBeGreaterThan(0);
    sim.send({ type: 'placeBuilding', buildingType: 'berry-garden', x: 7, y: 10 });
    tick(sim);
    expect(sim.state.residents).toHaveLength(before);
    const garden = idOf(sim.state as SimState, 'berry-garden', 7, 10);
    const worker = sim.state.residents.find((r) => r.job === garden);
    expect(worker && idle.map((r) => r.id)).toContain(worker?.id);
    expect(worker && activityOf(worker)).toBe('toWork');
    expectSound(sim.state);
  });

  it('Abreißen des Arbeitsplatzes macht den Arbeiter arbeitslos; beim nächsten Bau arbeitet er wieder – niemand kommt dazu', () => {
    const state = village();
    run(state, { type: 'placeBuilding', buildingType: 'berry-garden', x: 6, y: 10 });
    const sim = new Simulation(state);
    tick(sim, 200);
    const count = sim.state.residents.length;
    const worker = sim.state.residents.find((r) => r.job === idOf(sim.state as SimState, 'berry-garden', 6, 10));
    sim.send({ type: 'demolish', x: 6, y: 10 });
    tick(sim);
    expect(sim.state.residents.find((r) => r.id === worker?.id)?.job).toBeNull();
    tick(sim, 100);
    sim.send({ type: 'placeBuilding', buildingType: 'berry-garden', x: 8, y: 10 });
    tick(sim);
    expect(sim.state.residents).toHaveLength(count);
    expect(sim.state.residents.find((r) => r.id === worker?.id)?.job).toBe(idOf(sim.state as SimState, 'berry-garden', 8, 10));
    expectSound(sim.state);
  });

  it('die Wirtschaft ist genau dieselbe wie ohne Bewohner: Tragen ist nur ein Bild', () => {
    const state = village();
    run(state, { type: 'placeBuilding', buildingType: 'berry-garden', x: 6, y: 10 }, { type: 'placeBuilding', buildingType: 'bakery', x: 9, y: 10 }, { type: 'placeBuilding', buildingType: 'house-red', x: 12, y: 10 });
    setStore(state, { coins: 7 });
    const plain = structuredClone(state);
    const sim = new Simulation(state);
    let carried = 0;
    for (let i = 0; i < 1500; i += 1) {
      tick(sim);
      tickN(plain, 1);
      expect(sim.state.inventory).toEqual(plain.inventory);
      expect(sim.state.earnedCoins).toBe(plain.earnedCoins);
      carried += sim.state.residents.filter((r) => r.carrying !== null).length;
    }
    expect(carried).toBeGreaterThan(0);
    expect(sim.state.earnedCoins).toBeGreaterThan(0);
  });
});

describe('Der Tag eines Arbeiters', () => {
  it('trägt, was gemacht wurde, zum Markt und geht zurück; nach ein paar Fahrten ruht er sich zu Hause aus', () => {
    const state = village();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 10 }, { type: 'placeBuilding', buildingType: 'berry-garden', x: 8, y: 10 });
    const sim = new Simulation(state);
    const garden = idOf(sim.state as SimState, 'berry-garden', 8, 10);
    const seen = new Set<string>();
    let deliveries = 0;
    let wasCarrying = false;
    for (let i = 0; i < 3000; i += 1) {
      tick(sim);
      const worker = sim.state.residents.find((r) => r.job === garden);
      if (!worker) {
        continue;
      }
      seen.add(activityOf(worker));
      if (worker.carrying !== null) {
        expect(worker.carrying).toBe('berries');
        wasCarrying = true;
      } else if (wasCarrying) {
        deliveries += 1;
        wasCarrying = false;
        const market = sim.state.buildings.find((b) => b.type === 'market');
        expect(market && worker.at).toBe(market && doorOf(sim.state, market));
      }
      expectSound(sim.state);
    }
    expect(deliveries).toBeGreaterThanOrEqual(RESIDENT_RULES.routine.tripsBeforeRest);
    for (const activity of ['boat', 'toWork', 'work', 'carry', 'toHome', 'rest']) {
      expect(seen, activity).toContain(activity);
    }
  });

  it('der Markt-Händler trägt nichts; ohne Markt trägt niemand etwas', () => {
    expect(carriedGood('market')).toBeUndefined();
    expect(carriedGood('berry-garden')).toBe('berries');
    expect(carriedGood('lumberjack')).toBe('wood');
    expect(carriedGood('house-red')).toBeUndefined();
    const state = seaState();
    run(state, { type: 'placePaths', tiles: Array.from({ length: 10 }, (_, i) => ({ x: 5 + i, y: 12 })) }, { type: 'placeBuilding', buildingType: 'berry-garden', x: 6, y: 10 });
    const sim = new Simulation(state);
    for (let i = 0; i < 800; i += 1) {
      tick(sim);
      expect(sim.state.residents.every((r) => r.carrying === null)).toBe(true);
    }
  });

  it('wer kein Zuhause hat, bleibt länger bei der Arbeit', () => {
    const state = village();
    run(state, { type: 'placeBuilding', buildingType: 'lumberjack', x: 6, y: 10 });
    fillTerrain(state, 6, 6, 3, 2, 'forest');
    const sim = new Simulation(state);
    tick(sim, 2000);
    const worker = sim.state.residents.find((r) => r.job !== null && sim.state.buildings.find((b) => b.id === r.job)?.type === 'market');
    expect(worker?.home).toBeNull();
    expect(['work', 'toWork']).toContain(worker && activityOf(worker));
  });
});

describe('Häuser', () => {
  it('nimmt so viele Bewohner auf, wie Platz ist; die anderen suchen ein Zuhause und ziehen ein, sobald eins frei wird', () => {
    const state = village();
    for (const x of [4, 7, 10]) {
      run(state, { type: 'placeBuilding', buildingType: 'berry-garden', x, y: 10 });
    }
    // Four workers (three gardens, the market), no house yet.
    expect(state.residents.filter((r) => r.home === null)).toHaveLength(4);
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 13, y: 10 });
    expect(state.residents.filter((r) => r.home !== null)).toHaveLength(2);
    run(state, { type: 'placeBuilding', buildingType: 'house-big', x: 4, y: 13 });
    expect(state.residents.filter((r) => r.home === null)).toHaveLength(0);
    expectSound(state);
  });

  it('Abreißen eines bewohnten Hauses macht seine Bewohner nur heimatlos – kein Fehler, niemand geht', () => {
    const state = village();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 10 }, { type: 'inviteResident', typeId: 'invite' }, { type: 'inviteResident', typeId: 'invite' });
    const sim = new Simulation(state);
    tick(sim, 600);
    const count = sim.state.residents.length;
    sim.send({ type: 'demolish', x: 4, y: 10 });
    tick(sim);
    expect(sim.state.residents).toHaveLength(count);
    expect(sim.state.residents.every((r) => r.home === null)).toBe(true);
    for (let i = 0; i < 300; i += 1) {
      tick(sim);
      expectSound(sim.state);
    }
    sim.send({ type: 'placeBuilding', buildingType: 'house-blue', x: 7, y: 10 });
    tick(sim);
    expect(sim.state.residents.filter((r) => r.home !== null)).toHaveLength(2);
  });
});

describe('Einladen im Shop', () => {
  it('braucht ein freies Haus, kostet Taler und zählt als Änderung; das Boot bringt den Bewohner, der nach Hause geht', () => {
    const state = village();
    expect(checkInvite(state, 'invite').result).toBe('noHouse');
    run(state, { type: 'inviteResident', typeId: 'invite' });
    expect(state.residents).toHaveLength(1);
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 6, y: 10 });
    const house = idOf(state, 'house-red', 6, 10);
    expect(checkInvite(state, 'invite')).toEqual({ result: 'ok', home: house });
    expect(inviteHome(state)?.id).toBe(house);
    setStore(state, { coins: 29 });
    expect(checkInvite(state, 'invite')).toMatchObject({ result: 'cost', missing: { coins: 1 } });
    run(state, { type: 'inviteResident', typeId: 'invite' });
    expect(state.residents).toHaveLength(1);
    setStore(state, { coins: 100 });
    const revision = state.revision;
    run(state, { type: 'inviteResident', typeId: 'invite' });
    expect(state.inventory['coins']).toBe(100 - (buildingType('invite')?.cost['coins'] ?? 0));
    expect(state.revision).toBe(revision + 1);
    const guest = state.residents.at(-1) as Resident;
    expect(guest.home).toBe(house);
    expect(guest.job).toBeNull();
    expect(guest.doing).toBe('boat');
    const boat = state.boats.find((b) => b.passenger === guest.id);
    expect(boat).toBeDefined();
    expect(state.world.tiles[boat?.at ?? 0]).toBe('water');

    const sim = new Simulation(state);
    let landed = false;
    let rested = false;
    for (let i = 0; i < 1200 && !rested; i += 1) {
      tick(sim);
      const now = sim.state.residents.find((r) => r.id === guest.id);
      landed ||= now?.doing !== 'boat';
      rested ||= now !== undefined && activityOf(now) === 'rest';
      expectSound(sim.state);
    }
    expect(landed).toBe(true);
    expect(rested).toBe(true);
    const home = sim.state.buildings.find((b) => b.id === house);
    expect(home && sim.state.residents.find((r) => r.id === guest.id)?.at).toBe(home && doorOf(sim.state, home));
    // The boat sails away and is gone.
    tick(sim, 300);
    expect(sim.state.boats).toEqual([]);
  });

  it('ignoriert eine Einladung mit einem falschen Artikel', () => {
    const state = village();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 6, y: 10 });
    const before = structuredClone(state);
    run(state, { type: 'inviteResident', typeId: 'house-red' }, { type: 'inviteResident', typeId: 'nope' });
    expect(state).toEqual(before);
  });

  it('ist voll bei der Höchstzahl an Bewohnern', () => {
    const state = village();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 6, y: 10 });
    const template = state.residents[0] as Resident;
    state.residents = Array.from({ length: MAX_RESIDENTS }, (_, i) => ({ ...template, id: i + 10, job: null, home: null }));
    expect(checkInvite(state, 'invite').result).toBe('full');
  });

  it('gibt jedem einen anderen Namen, solange es geht, und dann mit einer Zahl', () => {
    const state = seaState(40);
    setStore(state, { coins: 99999, wood: 9999 });
    for (let y = 4; y <= 32; y += 4) {
      for (let x = 4; x <= 32; x += 4) {
        run(state, { type: 'placeBuilding', buildingType: 'house-big', x, y });
      }
    }
    expect(housing(state).capacity).toBeGreaterThan(RESIDENT_NAMES.length + 3);
    for (let i = 0; i < RESIDENT_NAMES.length + 3; i += 1) {
      run(state, { type: 'inviteResident', typeId: 'invite' });
    }
    expect(state.residents.length).toBe(RESIDENT_NAMES.length + 3);
    const names = state.residents.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.slice(0, RESIDENT_NAMES.length).every((name) => RESIDENT_NAMES.includes(name))).toBe(true);
    expect(names.slice(RESIDENT_NAMES.length).every((name) => / 2$/.test(name))).toBe(true);
  });
});

describe('Bewegung', () => {
  it('ist stetig: die Zeichnung zwischen zwei Ticks führt genau zur Lage im nächsten Tick', () => {
    const state = village();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 10 }, { type: 'placeBuilding', buildingType: 'berry-garden', x: 10, y: 10 });
    const sim = new Simulation(state);
    let compared = 0;
    for (let i = 0; i < 1500; i += 1) {
      const before = new Map(sim.state.residents.map((r) => [r.id, residentPoint(sim.state, r, 1)]));
      const half = new Map(sim.state.residents.map((r) => [r.id, residentPoint(sim.state, r, 0.5)]));
      tick(sim);
      for (const resident of sim.state.residents) {
        const end = before.get(resident.id);
        const now = residentPoint(sim.state, resident, 0);
        const middle = half.get(resident.id);
        if (end && now && middle && resident.doing === 'walk') {
          expect(Math.hypot(end.x - now.x, end.y - now.y)).toBeLessThan(0.21);
          expect(Math.hypot(middle.x - now.x, middle.y - now.y)).toBeLessThanOrEqual(0.21);
          compared += 1;
        }
      }
    }
    expect(compared).toBeGreaterThan(100);
  });

  it('wer gerade läuft, springt nicht, wenn sein Ziel verschoben wird – er läuft zur neuen Tür', () => {
    const state = village();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 10 }, { type: 'placeBuilding', buildingType: 'berry-garden', x: 10, y: 10 });
    const sim = new Simulation(state);
    const garden = idOf(sim.state as SimState, 'berry-garden', 10, 10);
    let moved = false;
    for (let i = 0; i < 2000 && !moved; i += 1) {
      tick(sim);
      const worker = sim.state.residents.find((r) => r.job === garden);
      if (worker && worker.doing === 'walk' && worker.goal === 'work' && worker.step > 0 && worker.route.length > 2) {
        const before = residentPoint(sim.state, worker, 0);
        sim.send({ type: 'moveBuilding', id: garden, x: 12, y: 13 });
        tick(sim);
        const after = sim.state.residents.find((r) => r.id === worker.id);
        const point = after && residentPoint(sim.state, after, 0);
        expect(point && before && Math.hypot(point.x - before.x, point.y - before.y)).toBeLessThan(0.25);
        const building = sim.state.buildings.find((b) => b.id === garden);
        expect(after?.route.at(-1)).toBe(building && doorOf(sim.state, building));
        moved = true;
      }
    }
    expect(moved).toBe(true);
  });

  it('kommt auch ohne Weg ans Ziel (langsamer, über die Wiese)', () => {
    const state = seaState();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 5 }, { type: 'placeBuilding', buildingType: 'market', x: 14, y: 14 }, { type: 'inviteResident', typeId: 'invite' });
    const sim = new Simulation(state);
    let rested = false;
    for (let i = 0; i < 3000 && !rested; i += 1) {
      tick(sim);
      rested = sim.state.residents.some((r) => r.job === null && activityOf(r) === 'rest');
    }
    expect(rested).toBe(true);
  });

  it('steht während der Pause still', () => {
    const state = village();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 10 }, { type: 'placeBuilding', buildingType: 'berry-garden', x: 10, y: 10 });
    const sim = new Simulation(state);
    tick(sim, 60);
    sim.send({ type: 'setPaused', paused: true });
    tick(sim);
    const frozen = structuredClone(sim.state.residents);
    const boats = structuredClone(sim.state.boats);
    tick(sim, 200);
    expect(sim.state.residents).toEqual(frozen);
    expect(sim.state.boats).toEqual(boats);
  });

  it('ein Boot zeigt seine Lage stetig zwischen den Ticks', () => {
    const state = village();
    run(state, { type: 'placeBuilding', buildingType: 'berry-garden', x: 6, y: 10 });
    const sim = new Simulation(state);
    const boat = sim.state.boats[0];
    expect(boat).toBeDefined();
    if (!boat) {
      return;
    }
    const a = boatPoint(sim.state, boat, 0.5);
    const b = boatPoint(sim.state, boat, 1);
    tick(sim);
    const after = sim.state.boats[0];
    const c = after && boatPoint(sim.state, after, 0);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0);
    expect(c && Math.hypot(b.x - c.x, b.y - c.y)).toBeLessThan(0.01);
  });
});

describe('Nichts hängt', () => {
  it('neues Land im Weg des Boots: der Bewohner steigt an der nächsten Küste aus; Land unter dem Boot: er steigt dort aus', () => {
    const state = village();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 6, y: 10 }, { type: 'inviteResident', typeId: 'invite' });
    const boat = state.boats.find((b) => b.passenger === state.residents.at(-1)?.id);
    expect(boat).toBeDefined();
    if (!boat) {
      return;
    }
    // Fill the last tile before the shore (it touches land).
    const last = boat.route.at(-1) ?? boat.at;
    state.world.tiles[last] = 'sand';
    settleResidents(state);
    expect(state.boats.find((b) => b.id === boat.id)?.route.includes(last)).toBe(false);
    const sim = new Simulation(state);
    tick(sim, 200);
    expect(sim.state.residents.every((r) => r.doing !== 'boat')).toBe(true);

    const second = village();
    run(second, { type: 'placeBuilding', buildingType: 'house-red', x: 6, y: 10 }, { type: 'inviteResident', typeId: 'invite' });
    const guest = second.residents.at(-1);
    const at = second.boats.find((b) => b.passenger === guest?.id)?.at ?? 0;
    second.world.tiles[at] = 'sand';
    settleResidents(second);
    expect(second.boats.some((b) => b.id === guest?.id)).toBe(false);
    expect(second.residents.at(-1)?.at).toBe(at);
    expect(second.residents.at(-1)?.doing).not.toBe('boat');
  });

  it('übersteht wildes Bauen, Verschieben und Abreißen ohne Fehler und ohne hängende Bewohner', () => {
    const state = village();
    setStore(state, { coins: 99999, wood: 9999, stone: 999 });
    fillTerrain(state, 4, 4, 4, 2, 'forest');
    const sim = new Simulation(state);
    const types = ['house-red', 'berry-garden', 'lumberjack', 'bakery', 'market', 'flower', 'house-big'];
    let seed = 7;
    const random = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const stuck = new Map<number, number>();
    for (let i = 0; i < 6000; i += 1) {
      if (i % 25 === 0) {
        const x = 3 + random(18);
        const y = 3 + random(18);
        switch (random(6)) {
          case 0:
          case 1:
            sim.send({ type: 'placeBuilding', buildingType: types[random(types.length)] ?? 'flower', x, y });
            break;
          case 2:
            sim.send({ type: 'demolish', x, y });
            break;
          case 3: {
            const building = sim.state.buildings[random(Math.max(1, sim.state.buildings.length))];
            if (building) {
              sim.send({ type: 'moveBuilding', id: building.id, x, y });
            }
            break;
          }
          case 4:
            sim.send({ type: 'placePaths', tiles: [{ x, y }, { x: x + 1, y }, { x: x + 2, y }] });
            break;
          default:
            sim.send({ type: 'inviteResident', typeId: 'invite' });
        }
      }
      tick(sim);
      expectSound(sim.state);
      for (const resident of sim.state.residents) {
        // Nobody stands still for ever: walking, a stay with a timer, or waiting for a short while.
        const standing = resident.doing === 'wait' || (resident.doing === 'walk' && resident.route.length === 0);
        stuck.set(resident.id, standing ? (stuck.get(resident.id) ?? 0) + 1 : 0);
        expect(stuck.get(resident.id) ?? 0, resident.name).toBeLessThan(3 * RESIDENT_RULES.routine.waitTicks);
        if (resident.doing === 'stay') {
          expect(resident.timer).toBeGreaterThan(0);
        }
      }
    }
    expect(sim.state.residents.length).toBeGreaterThanOrEqual(4);
    expect(sim.state.buildings.length).toBeGreaterThan(5);
  });

  it('Beerengarten und Markt bringen auch ohne Taler immer wieder Geld – mit oder ohne Bewohner', () => {
    for (const keep of [true, false]) {
      const state = createInitialState(1);
      setStore(state, {});
      if (!keep) {
        // Even a village whose residents are all gone (a damaged file) earns: the economy does not wait for anybody.
        state.residents = [];
      }
      const sim = new Simulation(state);
      tick(sim, 1200);
      expect(sim.state.inventory['coins'] ?? 0, keep ? 'mit' : 'ohne').toBeGreaterThan(10);
    }
  });
});
