import { describe, expect, it } from 'vitest';
import { BUILDING_TYPES, LOCKED_TYPE_IDS, buildingType, unlockOf } from '../../src/data/buildings';
import { goodDef } from '../../src/data/goods';
import { costOf, productionOf } from '../../src/sim/economy';
import { Simulation } from '../../src/sim/simulation';
import { createInitialState } from '../../src/sim/state';
import { Bot } from './bot';
import { run } from './helpers';

const SECOND = 10;

/**
 * Lässt den Bot `ticks` Ticks lang spielen, genau ein Tick pro Durchlauf: alle zwei Sekunden verbindet er Gebäude, einen Tick
 * später bestellt er das Nächste (die Befehle gelten jeweils zu Beginn des nächsten Ticks). `onTick` sieht den Stand nach jedem Tick.
 */
function playBot(sim: Simulation, bot: Bot, wishes: readonly string[], ticks: number, onTick?: (tick: number) => void): void {
  for (let i = 0; i < ticks; i += 1) {
    if (i % 20 === 0) {
      bot.connectAll();
    } else if (i % 20 === 1) {
      bot.buildNext(wishes);
    }
    sim.update(sim.tickMs);
    onTick?.(sim.state.tick);
  }
}

/** Taler, die das Startdorf ohne jede Hilfe nach `seconds` Sekunden gesammelt hat. */
function coinsAfter(sim: Simulation, seconds: number): number {
  for (let i = 0; i < seconds * SECOND; i += 1) {
    sim.update(sim.tickMs);
  }
  return sim.state.inventory['coins'] ?? 0;
}

describe('Einkommen am Start (Korrekturrunde 1, T2)', () => {
  it('das Startdorf allein (nichts gebaut) bringt etwa 0,5 bis 0,8 Taler pro Sekunde', () => {
    const sim = new Simulation(createInitialState(1));
    const at30 = coinsAfter(sim, 30);
    const at150 = coinsAfter(sim, 120);
    const rate = (at150 - at30) / 120;
    expect(rate).toBeGreaterThanOrEqual(0.45);
    expect(rate).toBeLessThanOrEqual(0.8);
  });

  /** Sekunden, bis das Dorf 40 Taler zusätzlich zum Start hat. */
  function secondsFor40(state: ReturnType<typeof createInitialState>): number {
    const sim = new Simulation(state);
    const start = sim.state.inventory['coins'] ?? 0;
    let seconds = 0;
    while ((sim.state.inventory['coins'] ?? 0) < start + 40 && seconds < 300) {
      coinsAfter(sim, 1);
      seconds += 1;
    }
    return seconds;
  }

  it('nach 80 bis 95 Sekunden sind 40 Taler zusätzlich zum Start verdient – das zweite Haus kommt auch ohne Startgeld in dieser Zeit', () => {
    // Bei normaler Stimmung (M7: ohne die Deko am Haus) wie bis M6 (dort gemessen: 87 s).
    const plain = createInitialState(1);
    const cx = Math.floor(plain.world.width / 2);
    const cy = Math.floor(plain.world.height / 2);
    run(plain, { type: 'demolish', x: cx - 4, y: cy - 1 }, { type: 'demolish', x: cx - 1, y: cy - 3 });
    const seconds = secondsFor40(plain);
    expect(seconds).toBeGreaterThanOrEqual(80);
    expect(seconds).toBeLessThanOrEqual(95);
    // Im Startdorf selbst sind beide fröhlich (Blume und Busch am Haus): etwas schneller, aber kein Geschenk (M7: 72 s).
    const happy = secondsFor40(createInitialState(1));
    expect(happy).toBeLessThan(seconds);
    expect(happy).toBeGreaterThanOrEqual(65);
  });

  it('das Holz für das zweite Haus liegt im Startlager', () => {
    const sim = new Simulation(createInitialState(1));
    expect(sim.state.inventory['wood'] ?? 0).toBeGreaterThanOrEqual(costOf('house-blue')['wood'] ?? 0);
    expect(sim.state.inventory['coins'] ?? 0).toBeGreaterThanOrEqual(costOf('house-blue')['coins'] ?? 0);
  });

  it('Kuchen lohnt sich deutlich mehr als die rohen Beeren, aus denen er gebacken wird', () => {
    const bakery = productionOf('bakery');
    const berries = bakery?.inputs['berries'] ?? 0;
    const cake = goodDef('cake')?.price ?? 0;
    const raw = (goodDef('berries')?.price ?? 0) * berries;
    expect(cake).toBeGreaterThanOrEqual(1.5 * raw);
    // Und Möbel lohnen mehr als das Holz, das sie brauchen, hat als Beeren-Gegenwert (viele Taler pro Runde).
    expect(goodDef('furniture')?.price ?? 0).toBeGreaterThanOrEqual(10);
  });

  it('mit einer Bäckerei verdient das Dorf deutlich mehr als ohne', () => {
    const plain = new Simulation(createInitialState(1));
    const chain = new Simulation(createInitialState(1));
    const bot = new Bot(chain);
    playBot(chain, bot, ['bakery'], 240 * SECOND);
    coinsAfter(plain, 240);
    expect(chain.state.earnedCoins).toBeGreaterThan(plain.state.earnedCoins * 1.25);
  });
});

describe('Freischaltung über verdiente Taler (T2)', () => {
  it('ist auch für jemanden erreichbar, der nur Bäckerei und Häuser baut: erste nach 2 Minuten, die letzte zwischen 5 und 15 Minuten', () => {
    const sim = new Simulation(createInitialState(1));
    const bot = new Bot(sim);
    const wishes = ['bakery', 'house-blue', 'house-yellow', 'house-red'];
    const at = new Map<string, number>();
    playBot(sim, bot, wishes, 15 * 600, (tick) => {
      for (const id of sim.state.unlocked) {
        if (!at.has(id)) {
          at.set(id, tick / 600);
        }
      }
    });
    const earned = LOCKED_TYPE_IDS.filter((id) => unlockOf(id)?.kind === 'earned');
    expect(earned.length).toBeGreaterThanOrEqual(5);
    for (const id of earned) {
      expect(at.has(id), `${id} wurde frei`).toBe(true);
    }
    const times = earned.map((id) => at.get(id) ?? Number.POSITIVE_INFINITY);
    expect(Math.min(...times)).toBeLessThanOrEqual(2);
    expect(Math.max(...times)).toBeGreaterThanOrEqual(5);
    expect(Math.max(...times)).toBeLessThanOrEqual(15);
  });

  it('auch ohne etwas zu bauen sind die ersten Neuigkeiten nach 2 Minuten da', () => {
    const sim = new Simulation(createInitialState(1));
    const before = sim.state.unlocked.length;
    coinsAfter(sim, 120);
    expect(sim.state.unlocked.length).toBeGreaterThan(before);
  });

  it('keine Bedingung verlangt mehr als 500 Taler', () => {
    for (const type of BUILDING_TYPES) {
      const unlock = unlockOf(type.id);
      if (unlock?.kind === 'earned') {
        expect(unlock.coins, type.id).toBeLessThanOrEqual(500);
        expect(buildingType(type.id)?.shop, type.id).toBeDefined();
      }
    }
  });
});
