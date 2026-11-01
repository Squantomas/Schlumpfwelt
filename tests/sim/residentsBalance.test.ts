import { describe, expect, it } from 'vitest';
import { MOOD_RULES } from '../../src/data/residents';
import { canPlace } from '../../src/sim/buildings';
import { moodOf } from '../../src/sim/mood';
import { Simulation } from '../../src/sim/simulation';
import { createInitialState, type SimState } from '../../src/sim/state';
import { Bot } from './bot';
import { run } from './helpers';

/**
 * Balancing vorher/nachher (M7). Bis M6 trugen die Bewohner die Waren nur sichtbar, dieselben Spielzüge ergaben genau
 * die Zahlen von M5. Seit M7 arbeitet ein fröhlicher Arbeiter etwas schneller (120 %), ein trauriger etwas langsamer
 * (80 %, nie Stillstand), und jeder Bewohner isst ab und zu eine Einheit aus dem Lager (Kuchen, sonst Beeren; das
 * ganze Dorf höchstens eine Einheit pro 10 s). Die Zahlen „vorher“ wurden mit M6 gemessen, die Zahlen „nachher“ mit M7 –
 * mit demselben Bot und denselben Zügen:
 *
 * | Messung                                   | vorher (M6)                   | nachher (M7)                  |
 * |-------------------------------------------|-------------------------------|-------------------------------|
 * | Startdorf, Taler nach 30/60/90/120/180/300 s | 66, 84, 100, 118, 152, 220 | 70, 90, 112, 132, 174, 252    |
 * | Bot „alles bauen“, 15 min: verdient/Taler | 1674 / 1213                   | 1904 / 1443                   |
 * | Bot „Bäckerei und Häuser“: verdient/Taler | 840 / 835                     | 950 / 945                     |
 * | Startdorf alle traurig, Taler nach 300 s  | –                             | 189 (verdient 122, normal 156) |
 *
 * Im Startdorf sind beide fröhlich (Blume und Busch am Haus, kurzer Weg zur Arbeit): Es verdient etwas mehr, die
 * Freischaltungen kommen insgesamt früher (beim Bot „alles bauen“ bis zu 2 Minuten; nur das große Haus und das Beet
 * 10 s später, weil die Tischlerei früher steht und Holz verbraucht). Sind alle traurig (Haus weit weg, keine Deko), verdient es immer noch
 * gut drei Viertel – man sitzt nie fest.
 */

const ALL = ['bakery', 'lumberjack', 'quarry', 'carpenter', 'house-blue', 'house-yellow', 'house-red', 'fence', 'bench', 'flower', 'bush', 'lantern', 'fountain', 'market', 'berry-garden', 'house-big', 'house-garden', 'flowerbed', 'pond', 'tree', 'rock', 'beach', 'meadow'];
const BAKERY_AND_HOUSES = ['bakery', 'house-blue', 'house-yellow', 'house-red'];

/** Freischaltung → Tick, gemessen mit M6 (Seed 1, 15 Spielminuten; gleich wie M5). */
const M6_UNLOCKS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  all: { bakery: 1, quarry: 23, carpenter: 23, pond: 44, bench: 659, beach: 798, 'house-big': 926, flowerbed: 926, lantern: 1058, meadow: 1251, 'house-garden': 1779, fountain: 2444 },
  bakery: { bakery: 1, 'house-big': 233, flowerbed: 233, bench: 659, beach: 869, lantern: 1289, meadow: 1534, 'house-garden': 2374, fountain: 3529 },
};
const M6_EARNED = { all: 1674, bakery: 840 };
const M6_COINS = { all: 1213, bakery: 835 };
const M6_START = [66, 84, 100, 118, 152, 220];

/** Dasselbe, gemessen mit M7. */
const M7_UNLOCKS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  all: { bakery: 1, quarry: 23, carpenter: 23, pond: 44, bench: 546, beach: 687, lantern: 915, 'house-big': 1031, flowerbed: 1031, meadow: 1067, 'house-garden': 1546, fountain: 2228 },
  bakery: { bakery: 1, 'house-big': 212, flowerbed: 212, bench: 546, beach: 691, lantern: 1097, meadow: 1300, 'house-garden': 2083, fountain: 3040 },
};
const M7_EARNED = { all: 1904, bakery: 950 };
const M7_COINS = { all: 1443, bakery: 945 };
const M7_START = [70, 90, 112, 132, 174, 252];
const CHECKPOINTS = [30, 60, 90, 120, 180, 300];

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

/** Die Taler des Startdorfs an den Messpunkten (nichts gebaut). */
function startCoins(state: SimState): { coins: number[]; sim: Simulation } {
  const sim = new Simulation(state);
  const coins: number[] = [];
  for (let second = 1; second <= 300; second += 1) {
    for (let i = 0; i < 10; i += 1) {
      sim.update(sim.tickMs);
    }
    if (CHECKPOINTS.includes(second)) {
      coins.push(sim.state.inventory['coins'] ?? 0);
    }
  }
  return { coins, sim };
}

/** Das Startdorf ohne die Deko am Haus (normal gelaunt) – und mit `far` dazu das Haus weit weg von der Arbeit (traurig). */
function plainStart(far: boolean): SimState {
  const state = createInitialState(1);
  const cx = Math.floor(state.world.width / 2);
  const cy = Math.floor(state.world.height / 2);
  run(state, { type: 'demolish', x: cx - 4, y: cy - 1 }, { type: 'demolish', x: cx - 1, y: cy - 3 });
  const house = state.buildings.find((b) => b.type === 'house-red');
  if (far && house) {
    expect(canPlace(state, 'house-red', cx - 8, cy + 6, house.id)).toBe('ok');
    run(state, { type: 'moveBuilding', id: house.id, x: cx - 8, y: cy + 6 });
  }
  return state;
}

describe('Balancing mit Stimmung und Essen (M7) gegen M6', () => {
  for (const [name, wishes] of [
    ['all', ALL],
    ['bakery', BAKERY_AND_HOUSES],
  ] as const) {
    it(`der Bot kommt weiter: die Freischaltungen insgesamt früher, mehr Taler (${name === 'all' ? 'alles bauen' : 'Bäckerei und Häuser'})`, () => {
      const { unlockedAt, sim } = play(wishes);
      const unlocks = Object.fromEntries(unlockedAt);
      expect(unlocks).toEqual(M7_UNLOCKS[name]);
      expect(Object.keys(unlocks).sort()).toEqual(Object.keys(M6_UNLOCKS[name] ?? {}).sort());
      // Fast alles kommt früher. Einzige Ausnahme: Beim Bot „alles bauen“ steht die Tischlerei 13 s früher und verbraucht
      // Holz, dadurch kommt das zweite Haus (und mit ihm großes Haus und Beet) 10 s später – nie mehr als 15 % später.
      let before = 0;
      let after = 0;
      for (const [id, tick] of Object.entries(unlocks)) {
        const old = M6_UNLOCKS[name]?.[id] ?? 0;
        expect(tick, id).toBeLessThanOrEqual(Math.ceil(1.15 * old));
        before += old;
        after += tick;
      }
      expect(after).toBeLessThan(before);
      expect(sim.state.earnedCoins).toBe(M7_EARNED[name]);
      expect(sim.state.inventory['coins']).toBe(M7_COINS[name]);
      expect(sim.state.earnedCoins).toBeGreaterThanOrEqual(M6_EARNED[name]);
      expect(sim.state.inventory['coins']).toBeGreaterThanOrEqual(M6_COINS[name]);
      // … und es gibt wirklich Bewohner, die arbeiten und essen; keiner hungert.
      expect(sim.state.residents.length).toBeGreaterThan(2);
      expect(sim.state.residents.some((r) => !r.hungry && r.meal > 0)).toBe(true);
      expect(sim.state.residents.filter((r) => r.hungry)).toHaveLength(0);
    });
  }

  it('das Startdorf (beide fröhlich) verdient in den ersten Minuten etwas mehr als in M6', () => {
    const { coins, sim } = startCoins(createInitialState(1));
    expect(coins).toEqual(M7_START);
    coins.forEach((value, i) => {
      expect(value).toBeGreaterThanOrEqual(M6_START[i] ?? 0);
      expect(value).toBeLessThanOrEqual(1.2 * (M6_START[i] ?? 0));
    });
    expect(sim.state.residents.map((r) => moodOf(sim.state, r).mood)).toEqual(['happy', 'happy']);
  });

  it('auch wenn alle traurig sind, kommt Geld: jede halbe Minute mehr, mindestens drei Viertel des Normalen', () => {
    const normal = startCoins(plainStart(false));
    const sad = startCoins(plainStart(true));
    expect(normal.sim.state.residents.map((r) => moodOf(normal.sim.state, r).mood)).toEqual(['normal', 'normal']);
    expect(sad.sim.state.residents.map((r) => moodOf(sad.sim.state, r).mood)).toEqual(['sad', 'sad']);
    expect(sad.coins).toEqual([69, 83, 97, 111, 139, 189]);
    for (let i = 1; i < sad.coins.length; i += 1) {
      expect(sad.coins[i] ?? 0).toBeGreaterThan(sad.coins[i - 1] ?? 0);
    }
    expect(sad.sim.state.earnedCoins).toBeGreaterThanOrEqual((MOOD_RULES.pace.sad / 100) * 0.95 * normal.sim.state.earnedCoins);
    expect(sad.sim.state.earnedCoins).toBeLessThan(normal.sim.state.earnedCoins);
  });
});
