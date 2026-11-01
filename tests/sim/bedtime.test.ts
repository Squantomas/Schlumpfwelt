import { describe, expect, it } from 'vitest';
import { BEDTIME_RULES, RESIDENT_RULES } from '../../src/data/residents';
import { activityOf, allAsleep, sleepOf } from '../../src/sim/residents';
import { fromSaveData, toSaveData } from '../../src/sim/saveData';
import { Simulation } from '../../src/sim/simulation';
import { createInitialState, type SimState } from '../../src/sim/state';
import { doorOf } from '../../src/sim/walk';
import { fillTerrain, grassState, run } from './helpers';

/** Runs the simulation `ticks` ticks (10 per second). */
function runTicks(sim: Simulation, ticks: number): void {
  for (let i = 0; i < ticks; i += 1) {
    sim.update(sim.tickMs);
  }
}

/** Runs until `done` is true (at most `max` ticks); returns the ticks it took, or -1. */
function runUntil(sim: Simulation, done: () => boolean, max = 3000): number {
  for (let i = 0; i < max; i += 1) {
    if (done()) {
      return i;
    }
    sim.update(sim.tickMs);
  }
  return done() ? max : -1;
}

/** The start village after a minute of play: the residents are out and about, the market has sold something. */
function playedVillage(): Simulation {
  const sim = new Simulation(createInitialState(1));
  runTicks(sim, 600);
  return sim;
}

describe('Schlafenszeit: alle gehen nach Hause ins Bett (M8)', () => {
  it('wer ein Zuhause hat, geht hin und schläft drinnen; danach schlafen alle', () => {
    const sim = playedVillage();
    sim.send({ type: 'setBedtime', bedtime: true });
    runTicks(sim, 1);
    expect(sim.state.bedtime).toBe(true);
    const took = runUntil(sim, () => allAsleep(sim.state));
    expect(took).toBeGreaterThanOrEqual(0);
    for (const resident of sim.state.residents) {
      expect(sleepOf(sim.state, resident)).toBe('inside');
      expect(activityOf(resident, sim.state)).toBe('sleep');
      const home = sim.state.buildings.find((b) => b.id === resident.home);
      expect(home && resident.at).toBe(home && doorOf(sim.state, home));
      expect(resident.carrying).toBeNull();
    }
  });

  it('nichts wird hergestellt oder verkauft und niemand isst – auch nicht nach langer Zeit', () => {
    const sim = playedVillage();
    sim.send({ type: 'setBedtime', bedtime: true });
    runUntil(sim, () => allAsleep(sim.state));
    const store = { ...sim.state.inventory };
    const earned = sim.state.earnedCoins;
    const meals = sim.state.residents.map((r) => r.meal);
    const progress = sim.state.production.map((p) => p.progress);
    runTicks(sim, 5000);
    expect(sim.state.inventory).toEqual(store);
    expect(sim.state.earnedCoins).toBe(earned);
    expect(sim.state.residents.map((r) => r.meal)).toEqual(meals);
    expect(sim.state.production.map((p) => p.progress)).toEqual(progress);
    expect(sim.state.residents.every((r) => !r.hungry || meals.length === 0)).toBe(true);
    expect(allAsleep(sim.state)).toBe(true);
  });

  it('wer kein Zuhause hat, legt sich da hin, wo er ist (ohne zu springen)', () => {
    const state = grassState(24);
    run(state, { type: 'placePaths', tiles: Array.from({ length: 16 }, (_, i) => ({ x: 4 + i, y: 10 })) });
    run(state, { type: 'placeBuilding', buildingType: 'berry-garden', x: 4, y: 11 }, { type: 'placeBuilding', buildingType: 'market', x: 14, y: 11 });
    // Two workers, no house: both are homeless.
    const sim = new Simulation(state);
    runTicks(sim, 300);
    expect(sim.state.residents.every((r) => r.home === null)).toBe(true);
    const before = sim.state.residents.map((r) => ({ id: r.id, at: r.at, next: r.route[0] }));
    sim.send({ type: 'setBedtime', bedtime: true });
    expect(runUntil(sim, () => allAsleep(sim.state), 200)).toBeGreaterThanOrEqual(0);
    for (const resident of sim.state.residents) {
      expect(sleepOf(sim.state, resident)).toBe('outside');
      const was = before.find((b) => b.id === resident.id);
      // Where they stood, or the tile they were walking to.
      expect([was?.at, was?.next]).toContain(resident.at);
    }
  });

  it('wer gerade mit dem Boot kommt, steigt aus und geht dann ins Bett', () => {
    const state = grassState(24);
    fillTerrain(state, 0, 0, 24, 3, 'water');
    fillTerrain(state, 0, 21, 24, 3, 'water');
    fillTerrain(state, 0, 0, 3, 24, 'water');
    fillTerrain(state, 21, 0, 3, 24, 'water');
    run(state, { type: 'placeBuilding', buildingType: 'house-big', x: 10, y: 10 }, { type: 'inviteResident', typeId: 'invite' });
    const sim = new Simulation(state);
    const guest = sim.state.residents[0];
    expect(guest?.doing).toBe('boat');
    sim.send({ type: 'setBedtime', bedtime: true });
    runTicks(sim, 1);
    expect(allAsleep(sim.state)).toBe(false);
    expect(runUntil(sim, () => allAsleep(sim.state), 3000)).toBeGreaterThan(0);
    expect(sim.state.residents[0] && sleepOf(sim.state, sim.state.residents[0])).toBe('inside');
  });

  it('„sofort“ (Start in der Nacht): alle sind gleich im Bett', () => {
    const sim = playedVillage();
    sim.send({ type: 'setBedtime', bedtime: true, instant: true });
    sim.send({ type: 'setPaused', paused: true });
    runTicks(sim, 1);
    expect(allAsleep(sim.state)).toBe(true);
    const tick = sim.state.tick;
    runTicks(sim, 50);
    expect(sim.state.tick).toBe(tick);
  });

  it('ein neues Produktionsgebäude in der Nacht schickt niemanden zur Arbeit', () => {
    const sim = playedVillage();
    sim.send({ type: 'setBedtime', bedtime: true, instant: true });
    runTicks(sim, 1);
    const cx = Math.floor(sim.state.world.width / 2);
    const cy = Math.floor(sim.state.world.height / 2);
    // The worker comes for free by boat and goes to bed after landing.
    sim.send({ type: 'placeBuilding', buildingType: 'lumberjack', x: cx + 4, y: cy - 4 });
    runTicks(sim, 1);
    expect(sim.state.residents.filter((r) => r.doing !== 'boat').every((r) => sleepOf(sim.state, r) !== 'awake' || r.goal === 'home' || r.goal === 'visit')).toBe(true);
    expect(runUntil(sim, () => allAsleep(sim.state), 4000)).toBeGreaterThanOrEqual(0);
  });

  it('am Morgen wachen alle nacheinander auf, und das Dorf arbeitet wieder', () => {
    const sim = playedVillage();
    sim.send({ type: 'setBedtime', bedtime: true, instant: true });
    runTicks(sim, 5);
    const earned = sim.state.earnedCoins;
    sim.send({ type: 'setBedtime', bedtime: false });
    runTicks(sim, 1);
    expect(sim.state.bedtime).toBe(false);
    expect(sim.state.residents.every((r) => r.timer <= BEDTIME_RULES.wakeTicks + BEDTIME_RULES.wakeSpreadTicks)).toBe(true);
    runTicks(sim, BEDTIME_RULES.wakeTicks + BEDTIME_RULES.wakeSpreadTicks + 2);
    expect(sim.state.residents.every((r) => activityOf(r, sim.state) !== 'rest' && activityOf(r, sim.state) !== 'sleep')).toBe(true);
    runTicks(sim, 900);
    expect(sim.state.earnedCoins).toBeGreaterThan(earned);
  });

  it('Schlafenszeit gehört nicht zum Dorf: ein Spielstand startet wach', () => {
    const sim = playedVillage();
    sim.send({ type: 'setBedtime', bedtime: true });
    runTicks(sim, 30);
    const loaded = fromSaveData(JSON.parse(JSON.stringify(toSaveData(sim.state))));
    expect(loaded.ok && loaded.state.bedtime).toBe(false);
  });

  it('zweimal „ins Bett“ ändert nichts, „wach“ ohne Nacht auch nicht', () => {
    const state = createInitialState(1);
    const awake: SimState = structuredClone(state);
    run(state, { type: 'setBedtime', bedtime: false });
    expect(state).toEqual(awake);
    run(state, { type: 'setBedtime', bedtime: true });
    const once = structuredClone(state);
    run(state, { type: 'setBedtime', bedtime: true });
    expect(state).toEqual(once);
    expect(state.revision).toBe(awake.revision);
  });

  it('bleibt deterministisch: gleiche Befehle, gleicher Zustand', () => {
    const play = (): SimState => {
      const sim = playedVillage();
      sim.send({ type: 'setBedtime', bedtime: true });
      runTicks(sim, 200);
      sim.send({ type: 'setBedtime', bedtime: false });
      runTicks(sim, 200);
      return structuredClone(sim.state) as SimState;
    };
    expect(play()).toEqual(play());
  });

  it('ruht man zu Hause schon, bleibt man liegen (Zuhause-Ruhe dauert nicht ab)', () => {
    const sim = playedVillage();
    sim.send({ type: 'setBedtime', bedtime: true });
    runUntil(sim, () => allAsleep(sim.state));
    const timers = sim.state.residents.map((r) => r.timer);
    runTicks(sim, RESIDENT_RULES.routine.restTicks * 3);
    expect(sim.state.residents.map((r) => r.timer)).toEqual(timers);
  });
});
