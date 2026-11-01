import { describe, expect, it } from 'vitest';
import { FOOD_RULES, MOOD_RULES } from '../../src/data/residents';
import { MAX_RESIDENTS } from '../../src/sim/limits';
import { LONGEST_MEAL, MOODS, eat, firstMeal, mealInterval, moodOf, paceOf, wayToWork, workPaces, workerMood } from '../../src/sim/mood';
import { longestRound, roundTicks, tickProduction } from '../../src/sim/production';
import { tickResidents, type Resident } from '../../src/sim/residents';
import { Simulation } from '../../src/sim/simulation';
import { createInitialState, type SimState } from '../../src/sim/state';
import { doorOf } from '../../src/sim/walk';
import { grassState, run, setStore } from './helpers';

const idOf = (state: SimState, type: string, x: number, y: number): number => {
  const id = state.buildings.find((b) => b.type === type && b.x === x && b.y === y)?.id;
  if (id === undefined) {
    throw new Error(`${type} fehlt`);
  }
  return id;
};

/**
 * A 32×32 meadow: a path along y 10, a berry garden at (4, 11) below it and a small house at (4, 8) above it (the
 * gardener lives there, door to door 0 steps), a second house far away at (24, 8) (20 steps). No decoration.
 */
function meadowVillage(): { state: SimState; garden: number; near: number; far: number; gardener: Resident } {
  const state = grassState(32);
  run(
    state,
    { type: 'placePaths', tiles: Array.from({ length: 28 }, (_, i) => ({ x: 2 + i, y: 10 })) },
    { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 8 },
    { type: 'placeBuilding', buildingType: 'house-blue', x: 24, y: 8 },
    { type: 'placeBuilding', buildingType: 'berry-garden', x: 4, y: 11 },
  );
  const garden = idOf(state, 'berry-garden', 4, 11);
  const gardener = state.residents.find((r) => r.job === garden);
  if (!gardener) {
    throw new Error('kein Gärtner');
  }
  return { state, garden, near: idOf(state, 'house-red', 4, 8), far: idOf(state, 'house-blue', 24, 8), gardener };
}

describe('Stimmung: die Zahlen in residents.json', () => {
  it('traurig bremst nur sanft (mindestens 75 %), fröhlich ist etwas schneller, normal ist 100 %', () => {
    expect(MOOD_RULES.pace.normal).toBe(100);
    expect(MOOD_RULES.pace.sad).toBeGreaterThanOrEqual(75);
    expect(MOOD_RULES.pace.sad).toBeLessThan(100);
    expect(MOOD_RULES.pace.happy).toBeGreaterThan(100);
    expect(MOOD_RULES.pace.happy).toBeLessThanOrEqual(130);
    expect(MOODS.map(paceOf)).toEqual([MOOD_RULES.pace.happy, MOOD_RULES.pace.normal, MOOD_RULES.pace.sad]);
  });

  it('Radius und Weglänge sind ganze Zahlen über 0; Essen sind Kuchen und Beeren', () => {
    for (const value of [MOOD_RULES.decoRadius, MOOD_RULES.farTiles, FOOD_RULES.mealTicks, FOOD_RULES.mealGapTicks, FOOD_RULES.retryTicks]) {
      expect(Number.isInteger(value) && value > 0).toBe(true);
    }
    expect(FOOD_RULES.goods).toEqual(['cake', 'berries']);
  });
});

describe('Stimmung: was fröhlich und traurig macht', () => {
  it('im Startdorf sind beide fröhlich: Deko am Haus und ein kurzer Weg zur Arbeit', () => {
    const state = createInitialState(1);
    expect(state.residents).toHaveLength(2);
    for (const resident of state.residents) {
      expect(moodOf(state, resident)).toEqual({ mood: 'happy', homeless: false, deco: true, far: false, near: true, hungry: false });
    }
  });

  it('ohne Deko und mit kurzem Weg: normal; Deko am Haus macht fröhlich – sofort, im selben Zustand', () => {
    const { state, gardener } = meadowVillage();
    expect(moodOf(state, gardener)).toMatchObject({ mood: 'normal', deco: false, near: true, far: false });
    run(state, { type: 'placeBuilding', buildingType: 'flower', x: 7, y: 8 });
    expect(moodOf(state, gardener)).toMatchObject({ mood: 'happy', deco: true });
    // Abreißen nimmt die Freude wieder.
    run(state, { type: 'demolish', x: 7, y: 8 });
    expect(moodOf(state, gardener).mood).toBe('normal');
  });

  it(`Deko zählt bis ${String(MOOD_RULES.decoRadius)} Kacheln um das Haus herum, weiter weg nicht`, () => {
    const { state, gardener } = meadowVillage();
    // The house covers x 4–5, y 8–9.
    run(state, { type: 'placeBuilding', buildingType: 'bush', x: 5 + MOOD_RULES.decoRadius + 1, y: 7 });
    expect(moodOf(state, gardener).deco).toBe(false);
    run(state, { type: 'placeBuilding', buildingType: 'bench', x: 4, y: 8 - MOOD_RULES.decoRadius });
    expect(moodOf(state, gardener).deco).toBe(true);
  });

  it('nur Deko zählt: ein Haus, Wald oder ein Produktionsgebäude daneben machen nicht fröhlich', () => {
    const { state, gardener } = meadowVillage();
    run(state, { type: 'placeBuilding', buildingType: 'house-yellow', x: 7, y: 8 }, { type: 'plantTree', typeId: 'tree', x: 6, y: 7 });
    expect(moodOf(state, gardener).deco).toBe(false);
  });

  it(`ein weiter Weg (mehr als ${String(MOOD_RULES.farTiles)} Schritte von Tür zu Tür) macht traurig, Deko gleicht ihn aus`, () => {
    const { state, gardener, far, garden } = meadowVillage();
    run(state, { type: 'assignHome', residentId: gardener.id, houseId: far });
    expect(gardener.home).toBe(far);
    expect(wayToWork(state, gardener)).toBe(20);
    expect(moodOf(state, gardener)).toMatchObject({ mood: 'sad', far: true, near: false, deco: false });
    expect(workerMood(state, garden)).toBe('sad');
    run(state, { type: 'placeBuilding', buildingType: 'flower', x: 26, y: 8 });
    expect(moodOf(state, gardener)).toMatchObject({ mood: 'normal', far: true, deco: true });
  });

  it('der Weg zählt von Tür zu Tür: genau an der Grenze ist er noch nah', () => {
    const { state, gardener, garden } = meadowVillage();
    const house = state.buildings.find((b) => b.id === gardener.home);
    const work = state.buildings.find((b) => b.id === garden);
    if (!house || !work) {
      throw new Error('fehlt');
    }
    expect(wayToWork(state, gardener)).toBe(0);
    expect(doorOf(state, house)).toBe(doorOf(state, work));
    // A house exactly farTiles steps along the path from the door of the garden.
    run(state, { type: 'placeBuilding', buildingType: 'house-yellow', x: 4 + MOOD_RULES.farTiles, y: 8 });
    const edge = idOf(state, 'house-yellow', 4 + MOOD_RULES.farTiles, 8);
    run(state, { type: 'assignHome', residentId: gardener.id, houseId: edge });
    expect(wayToWork(state, gardener)).toBe(MOOD_RULES.farTiles);
    expect(moodOf(state, gardener)).toMatchObject({ mood: 'normal', far: false, near: true });
  });

  it('Hunger senkt die Stimmung um genau eine Stufe', () => {
    const { state, gardener, far } = meadowVillage();
    run(state, { type: 'placeBuilding', buildingType: 'flower', x: 7, y: 8 });
    gardener.hungry = true;
    expect(moodOf(state, gardener)).toMatchObject({ mood: 'normal', hungry: true, deco: true });
    run(state, { type: 'demolish', x: 7, y: 8 });
    expect(moodOf(state, gardener).mood).toBe('sad');
    // Far and hungry: still just sad – there is nothing below.
    run(state, { type: 'assignHome', residentId: gardener.id, houseId: far });
    expect(moodOf(state, gardener).mood).toBe('sad');
  });

  it('ohne Zuhause: höchstens normal (traurig nur mit Hunger), nie bestraft', () => {
    const { state, gardener } = meadowVillage();
    run(state, { type: 'placeBuilding', buildingType: 'flower', x: 7, y: 8 });
    run(state, { type: 'demolish', x: 4, y: 8 }, { type: 'demolish', x: 24, y: 8 });
    expect(gardener.home).toBeNull();
    expect(moodOf(state, gardener)).toEqual({ mood: 'normal', homeless: true, deco: false, far: false, near: false, hungry: false });
    gardener.hungry = true;
    expect(moodOf(state, gardener).mood).toBe('sad');
  });

  it('wer keine Arbeit hat, hat keinen Weg: Deko am Haus macht ihn fröhlich', () => {
    const { state, near } = meadowVillage();
    run(state, { type: 'placeBuilding', buildingType: 'flower', x: 7, y: 8 }, { type: 'inviteResident', typeId: 'invite' });
    const guest = state.residents.find((r) => r.job === null);
    expect(guest?.home).toBe(near);
    expect(guest && wayToWork(state, guest)).toBeUndefined();
    expect(guest && moodOf(state, guest)).toMatchObject({ mood: 'happy', near: false, far: false });
  });
});

describe('Stimmung → Arbeitstempo', () => {
  it('eine Runde dauert intervalTicks × 100 / Tempo Ticks, nie unter 1, unsinniges Tempo zählt als 100 %', () => {
    expect(roundTicks(35)).toBe(35);
    expect(roundTicks(35, 100)).toBe(35);
    expect(roundTicks(35, 120)).toBe(29);
    expect(roundTicks(35, 80)).toBe(44);
    expect(roundTicks(30, 120)).toBe(25);
    expect(roundTicks(1, 1000)).toBe(1);
    for (const pace of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(roundTicks(50, pace)).toBe(50);
    }
    expect(longestRound(35)).toBe(roundTicks(35, MOOD_RULES.pace.sad));
    expect(longestRound(35)).toBeGreaterThanOrEqual(35);
  });

  it('jedes Gebäude arbeitet im Tempo seines Arbeiters; ohne Arbeiter mit 100 %', () => {
    const start = createInitialState(1);
    const paces = workPaces(start);
    expect([...paces.values()]).toEqual([MOOD_RULES.pace.happy, MOOD_RULES.pace.happy]);
    expect([...paces.keys()].sort()).toEqual(start.production.map((p) => p.buildingId).sort());
    const { state, garden } = meadowVillage();
    expect(workPaces(state).get(garden)).toBe(100);
    state.residents = [];
    expect(workPaces(state).size).toBe(0);
    expect(workerMood(state, garden)).toBeUndefined();
  });

  it('der Takt folgt dem Tempo: fröhlich schneller, traurig langsamer – aber nie Stillstand', () => {
    const delivered = (pace: number): number => {
      const { state, garden } = meadowVillage();
      for (let i = 0; i < 3000; i += 1) {
        state.tick += 1;
        tickProduction(state, new Map([[garden, pace]]));
      }
      return state.production.find((p) => p.buildingId === garden)?.delivered ?? 0;
    };
    const normal = delivered(100);
    const happy = delivered(MOOD_RULES.pace.happy);
    const sad = delivered(MOOD_RULES.pace.sad);
    expect(normal).toBe(Math.floor(3000 / 35));
    expect(happy).toBe(Math.floor(3000 / roundTicks(35, MOOD_RULES.pace.happy)));
    expect(sad).toBe(Math.floor(3000 / roundTicks(35, MOOD_RULES.pace.sad)));
    expect(happy).toBeGreaterThan(normal);
    expect(sad).toBeLessThan(normal);
    expect(sad).toBeGreaterThanOrEqual(0.75 * normal);
  });

  it('wird ein Arbeiter mitten in der Runde fröhlich, endet eine schon lange Runde sofort', () => {
    const { state, garden } = meadowVillage();
    const producer = state.production.find((p) => p.buildingId === garden);
    if (!producer) {
      throw new Error('fehlt');
    }
    producer.progress = 31;
    tickProduction(state, new Map([[garden, MOOD_RULES.pace.happy]]));
    expect(producer.progress).toBe(0);
    expect(producer.delivered).toBe(1);
  });

  it('in der Simulation: ein trauriger Gärtner bringt weniger Beeren als ein fröhlicher, aber immer welche', () => {
    const berriesAfter = (setUp: (v: ReturnType<typeof meadowVillage>) => void): number => {
      const village = meadowVillage();
      setUp(village);
      setStore(village.state, {});
      const sim = new Simulation(village.state);
      for (let i = 0; i < 1200; i += 1) {
        sim.update(sim.tickMs);
      }
      return sim.state.production.find((p) => p.buildingId === village.garden)?.delivered ?? 0;
    };
    const happy = berriesAfter(({ state }) => run(state, { type: 'placeBuilding', buildingType: 'flower', x: 7, y: 8 }));
    const normal = berriesAfter(() => undefined);
    const sad = berriesAfter(({ state, gardener, far }) => run(state, { type: 'assignHome', residentId: gardener.id, houseId: far }));
    expect(happy).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(sad);
    expect(sad).toBeGreaterThanOrEqual(0.75 * normal);
  });
});

describe('Essen', () => {
  it('die Zeit bis zur nächsten Mahlzeit: mealTicks, bei vielen Bewohnern länger – das Dorf isst höchstens eine Einheit pro mealGapTicks', () => {
    expect(mealInterval(1)).toBe(FOOD_RULES.mealTicks);
    expect(mealInterval(0)).toBe(FOOD_RULES.mealTicks);
    expect(mealInterval(MAX_RESIDENTS)).toBe(Math.max(FOOD_RULES.mealTicks, MAX_RESIDENTS * FOOD_RULES.mealGapTicks));
    for (const count of [1, 2, 10, 18, 19, 40, 200, MAX_RESIDENTS]) {
      expect(count / mealInterval(count)).toBeLessThanOrEqual(1 / FOOD_RULES.mealGapTicks);
    }
    expect(LONGEST_MEAL).toBe(mealInterval(MAX_RESIDENTS));
    // A berry garden makes more than a whole village eats, even with a sad gardener.
    expect(roundTicks(35, MOOD_RULES.pace.sad)).toBeLessThan(FOOD_RULES.mealGapTicks);
  });

  it('die ersten Mahlzeiten nach dem Laden eines alten Dorfs sind über eine Essenszeit verteilt', () => {
    const meals = Array.from({ length: 10 }, (_, i) => firstMeal(i, 10));
    expect(meals[9]).toBe(mealInterval(10));
    expect(new Set(meals).size).toBe(10);
    expect([...meals].sort((a, b) => a - b)).toEqual(meals);
    expect(meals.every((meal) => meal >= 1 && meal <= LONGEST_MEAL)).toBe(true);
    expect(firstMeal(0, 0)).toBeGreaterThanOrEqual(1);
  });

  it('isst Kuchen, sonst Beeren; ohne Essen: hungrig und schaut nach retryTicks wieder', () => {
    const resident = { meal: 0, hungry: false } as Resident;
    const store: Record<string, number> = { cake: 1, berries: 2 };
    eat(store, resident, 2);
    expect(store).toEqual({ cake: 0, berries: 2 });
    expect(resident).toMatchObject({ hungry: false, meal: mealInterval(2) });
    eat(store, resident, 2);
    expect(store).toEqual({ cake: 0, berries: 1 });
    eat(store, resident, 2);
    eat(store, resident, 2);
    expect(store).toEqual({ cake: 0, berries: 0 });
    expect(resident).toMatchObject({ hungry: true, meal: FOOD_RULES.retryTicks });
    store['berries'] = 1;
    eat(store, resident, 2);
    expect(resident.hungry).toBe(false);
    expect(store['berries']).toBe(0);
  });

  it('neue Bewohner kommen satt an; im Startdorf essen beide nach mealTicks je eine Beere', () => {
    const state = createInitialState(1);
    for (const resident of state.residents) {
      expect(resident.hungry).toBe(false);
      expect(resident.meal).toBe(mealInterval(state.residents.length));
    }
    setStore(state, { berries: 5 });
    state.production = [];
    for (let i = 0; i < FOOD_RULES.mealTicks - 1; i += 1) {
      tickResidents(state);
    }
    expect(state.inventory['berries']).toBe(5);
    tickResidents(state);
    expect(state.inventory['berries']).toBe(3);
    expect(state.residents.every((r) => !r.hungry && r.meal === mealInterval(2))).toBe(true);
  });

  it('ohne Essen werden sie hungrig und essen, sobald wieder etwas da ist', () => {
    const state = createInitialState(1);
    setStore(state, {});
    for (const resident of state.residents) {
      resident.meal = 1;
    }
    tickResidents(state);
    expect(state.residents.every((r) => r.hungry && r.meal === FOOD_RULES.retryTicks)).toBe(true);
    expect(state.residents.every((r) => moodOf(state, r).mood === 'normal')).toBe(true);
    state.inventory['cake'] = 2;
    for (let i = 0; i < FOOD_RULES.retryTicks; i += 1) {
      tickResidents(state);
    }
    expect(state.inventory['cake']).toBe(0);
    expect(state.residents.every((r) => !r.hungry)).toBe(true);
  });

  it('auf dem Boot wird nicht gegessen', () => {
    const state = grassState(24);
    for (const [x, y, w, h] of [
      [0, 0, 24, 3],
      [0, 21, 24, 3],
      [0, 0, 3, 24],
      [21, 0, 3, 24],
    ] as const) {
      for (let dy = 0; dy < h; dy += 1) {
        for (let dx = 0; dx < w; dx += 1) {
          state.world.tiles[(y + dy) * 24 + x + dx] = 'water';
        }
      }
    }
    run(state, { type: 'placeBuilding', buildingType: 'house-big', x: 10, y: 10 }, { type: 'inviteResident', typeId: 'invite' });
    const guest = state.residents[0];
    expect(guest?.doing).toBe('boat');
    if (!guest) {
      return;
    }
    guest.meal = 1;
    tickResidents(state);
    expect(guest.doing).toBe('boat');
    expect(guest.meal).toBe(1);
  });

  it('das Startdorf wird in 15 Minuten nie hungrig (der Beerengarten bringt genug)', () => {
    const sim = new Simulation(createInitialState(1));
    let hungry = 0;
    for (let i = 0; i < 9000; i += 1) {
      sim.update(sim.tickMs);
      hungry += sim.state.residents.filter((r) => r.hungry).length;
    }
    expect(hungry).toBe(0);
    expect(sim.state.residents.every((r) => moodOf(sim.state, r).mood === 'happy')).toBe(true);
  });
});
