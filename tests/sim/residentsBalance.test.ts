import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/sim/simulation';
import { createInitialState } from '../../src/sim/state';
import { Bot } from './bot';

/**
 * Balancing vorher/nachher (M6): Die Bewohner tragen die Waren nur sichtbar, das Lager bekommt sie wie in M5 am Ende
 * der Runde. Deshalb müssen dieselben Spielzüge genau dieselben Freischaltzeiten und Taler ergeben wie vor M6. Die
 * Zahlen unten wurden mit M5 (vor den Bewohnern) gemessen – mit demselben Bot und denselben Zügen.
 */

const ALL = ['bakery', 'lumberjack', 'quarry', 'carpenter', 'house-blue', 'house-yellow', 'house-red', 'fence', 'bench', 'flower', 'bush', 'lantern', 'fountain', 'market', 'berry-garden', 'house-big', 'house-garden', 'flowerbed', 'pond', 'tree', 'rock', 'beach', 'meadow'];
const BAKERY_AND_HOUSES = ['bakery', 'house-blue', 'house-yellow', 'house-red'];

/** Freischaltung → Tick, gemessen mit M5 (Seed 1, 15 Spielminuten). */
const M5_UNLOCKS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  all: { bakery: 1, quarry: 23, carpenter: 23, pond: 44, bench: 659, beach: 798, 'house-big': 926, flowerbed: 926, lantern: 1058, meadow: 1251, 'house-garden': 1779, fountain: 2444 },
  bakery: { bakery: 1, 'house-big': 233, flowerbed: 233, bench: 659, beach: 869, lantern: 1289, meadow: 1534, 'house-garden': 2374, fountain: 3529 },
};
const M5_EARNED = { all: 1674, bakery: 840 };
const M5_COINS = { all: 1213, bakery: 835 };

function play(wishes: readonly string[]): { unlockedAt: Map<string, number>; sim: Simulation } {
  const sim = new Simulation(createInitialState(1));
  const bot = new Bot(sim);
  const unlockedAt = new Map<string, number>();
  const note = (): void => {
    for (const id of sim.state.unlocked) {
      if (!unlockedAt.has(id)) {
        unlockedAt.set(id, sim.state.tick);
      }
    }
  };
  for (let i = 0; i < 15 * 600; i += 1) {
    if (i % 20 === 0) {
      bot.connectAll();
      sim.update(sim.tickMs);
      note();
      bot.buildNext(wishes);
    }
    sim.update(sim.tickMs);
    note();
  }
  return { unlockedAt, sim };
}

describe('Balancing mit Bewohnern: genau wie vorher (M5)', () => {
  for (const [name, wishes] of [
    ['all', ALL],
    ['bakery', BAKERY_AND_HOUSES],
  ] as const) {
    it(`gleiche Freischaltzeiten und Taler wie in M5 (${name === 'all' ? 'alles bauen' : 'Bäckerei und Häuser'})`, () => {
      const { unlockedAt, sim } = play(wishes);
      expect(Object.fromEntries(unlockedAt)).toEqual(M5_UNLOCKS[name]);
      expect(sim.state.earnedCoins).toBe(M5_EARNED[name]);
      expect(sim.state.inventory['coins']).toBe(M5_COINS[name]);
      // … und es gibt wirklich Bewohner, die arbeiten.
      expect(sim.state.residents.length).toBeGreaterThan(2);
    });
  }

  it('das Startdorf verdient in den ersten Minuten so viel wie in M5', () => {
    const sim = new Simulation(createInitialState(1));
    const coins: number[] = [];
    for (let second = 1; second <= 300; second += 1) {
      for (let i = 0; i < 10; i += 1) {
        sim.update(sim.tickMs);
      }
      if ([30, 60, 90, 120, 180, 300].includes(second)) {
        coins.push(sim.state.inventory['coins'] ?? 0);
      }
    }
    expect(coins).toEqual([66, 84, 100, 118, 152, 220]);
  });
});
