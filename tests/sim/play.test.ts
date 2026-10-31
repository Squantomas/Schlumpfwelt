import { describe, expect, it } from 'vitest';
import { BUILDING_TYPES, typesOf } from '../../src/data/buildings';
import { MAX_AMOUNT } from '../../src/data/goods';
import { PRODUCER_STATUSES, canAfford, costOf, productionOf } from '../../src/sim/economy';
import { Rng } from '../../src/sim/random';
import type { DeepReadonly } from '../../src/sim/readonly';
import { Simulation } from '../../src/sim/simulation';
import { createInitialState, type SimState } from '../../src/sim/state';
import { Bot } from './bot';

const MINUTE = 600;

/** The order in which the bot wants to build: the money chain first, then the rest. */
const WISHES = [
  'bakery',
  'lumberjack',
  'quarry',
  'carpenter',
  'house-blue',
  'house-yellow',
  'house-red',
  'fence',
  'bench',
  'flower',
  'bush',
  'lantern',
  'fountain',
  'market',
  'berry-garden',
];

/** Runs the bot for `ticks` ticks: every two seconds it connects buildings and orders the next thing it can pay. */
function play(sim: Simulation, bot: Bot, wanted: readonly string[], ticks: number): void {
  for (let i = 0; i < ticks; i += 1) {
    if (i % 20 === 0) {
      // Paths first, one tick later the next building – so a new building never lands on a path that was just ordered.
      bot.connectAll();
      sim.update(sim.tickMs);
      bot.buildNext(wanted);
    }
    sim.update(sim.tickMs);
  }
}

describe('Der Bot kann nie festsitzen', () => {
  it('wünscht sich jeden Bautyp (außer dem Weg) genau einmal', () => {
    const all = BUILDING_TYPES.filter((type) => type.category !== 'path').map((type) => type.id);
    expect([...WISHES].sort()).toEqual([...all].sort());
  });

  for (const seed of [1, 2, 3, 7, 12]) {
    it(`bezahlt und baut innerhalb von 15 Spielminuten jedes Gebäude einmal (Seed ${String(seed)})`, () => {
      const sim = new Simulation(createInitialState(seed));
      const bot = new Bot(sim);
      play(sim, bot, WISHES, 15 * MINUTE);
      sim.update(sim.tickMs);
      for (const id of WISHES) {
        expect(bot.builtAt.get(id), `${id} wurde bestellt`).toBeDefined();
      }
      // Alles steht auch wirklich, und nichts arbeitet ohne Weg.
      for (const id of WISHES) {
        expect(sim.state.buildings.some((b) => b.type === id), `${id} steht`).toBe(true);
      }
      expect(Math.max(...bot.builtAt.values())).toBeLessThan(15 * MINUTE);
      for (const producer of sim.state.production) {
        expect(producer.status, `Gebäude ${String(producer.buildingId)}`).not.toBe('noPath');
      }
      expect(sim.state.inventory['coins']).toBeGreaterThanOrEqual(0);
    });
  }

  it('verdient sein erstes Geld früh: nach anderthalb Minuten hat die Bäckerei ihre Taler schon fast wieder eingespielt', () => {
    const sim = new Simulation(createInitialState(1));
    const bot = new Bot(sim);
    const start = sim.state.inventory['coins'] ?? 0;
    play(sim, bot, ['bakery'], Math.round(1.5 * MINUTE));
    expect(sim.state.buildings.some((b) => b.type === 'bakery')).toBe(true);
    // Kosten der Bäckerei abgezogen, plus mindestens ein verkaufter Kuchen.
    expect(sim.state.inventory['coins']).toBeGreaterThan(start - (costOf('bakery')['coins'] ?? 0));
  });

  it('kommt auch nach dem Abreißen von allem wieder zu Geld (die Erstattung ist voll)', () => {
    const sim = new Simulation(createInitialState(1));
    const bot = new Bot(sim);
    play(sim, bot, WISHES, 6 * MINUTE);
    const state = sim.state;
    // Alles abreißen, Gebäude und Wege.
    for (const building of state.buildings) {
      sim.send({ type: 'demolish', x: building.x, y: building.y });
    }
    sim.update(sim.tickMs);
    for (const index of state.paths) {
      sim.send({ type: 'demolish', x: index % state.world.width, y: Math.floor(index / state.world.width) });
    }
    sim.update(sim.tickMs);
    expect(sim.state.buildings).toHaveLength(0);
    expect(sim.state.paths).toHaveLength(0);
    expect(sim.state.production).toHaveLength(0);
    // Das Geld-Trio reicht wieder.
    for (const id of ['berry-garden', 'bakery', 'market']) {
      expect(canAfford(sim.state, id), id).toBe(true);
    }
    const coinsBefore = sim.state.inventory['coins'] ?? 0;
    const fresh = new Bot(sim);
    play(sim, fresh, ['berry-garden', 'bakery', 'market'], 6 * MINUTE);
    expect(sim.state.buildings.map((b) => b.type).sort()).toEqual(['bakery', 'berry-garden', 'market']);
    const spentOnTrio = ['berry-garden', 'bakery', 'market'].reduce((sum, id) => sum + (typesOf('production').find((t) => t.id === id)?.cost['coins'] ?? 0), 0);
    expect(sim.state.inventory['coins']).toBeGreaterThan(coinsBefore - spentOnTrio);
  });

  it('bekommt alles zurück, was er für Deko ausgegeben hat – auch wenn er sein ganzes Geld verbaut', () => {
    const sim = new Simulation(createInitialState(1));
    const bot = new Bot(sim);
    const start: Record<string, number> = { ...sim.state.inventory };
    // Die Deko des Startdorfs war gratis; wird sie abgerissen, gibt es ihre Kosten obendrauf.
    const startDeco = sim.state.buildings.filter((b) => typesOf('deco').some((type) => type.id === b.type));
    for (const building of startDeco) {
      for (const [id, amount] of Object.entries(costOf(building.type))) {
        start[id] = (start[id] ?? 0) + amount;
      }
    }
    // Nur Deko: alles verbauen, was geht.
    const deco = typesOf('deco').map((type) => type.id);
    let guard = 0;
    for (let round = 0; round < 40 && guard < 400; round += 1) {
      for (const id of deco) {
        const spot = bot.findSpot(id);
        if (spot && canAfford(sim.state, id)) {
          sim.send({ type: 'placeBuilding', buildingType: id, x: spot.x, y: spot.y });
          sim.update(sim.tickMs);
          guard += 1;
        }
      }
    }
    expect(guard).toBeGreaterThan(5);
    expect(sim.state.inventory).not.toEqual(start);
    for (const building of [...sim.state.buildings]) {
      if (typesOf('deco').some((type) => type.id === building.type)) {
        sim.send({ type: 'demolish', x: building.x, y: building.y });
      }
    }
    sim.update(sim.tickMs);
    // Bis auf das, was in der Zwischenzeit produziert wurde, ist alles wieder da.
    const after = sim.state.inventory;
    expect(after['coins']).toBe(start['coins']);
    expect(after['wood']).toBe(start['wood']);
    expect(after['stone']).toBe(start['stone']);
    expect(canAfford(sim.state, 'bakery')).toBe(true);
  });
});

describe('Invarianten bei beliebigen Befehlen', () => {
  function check(state: DeepReadonly<SimState>, label: string): void {
    for (const [id, amount] of Object.entries(state.inventory)) {
      expect(Number.isInteger(amount) && amount >= 0 && amount <= MAX_AMOUNT, `${label}: ${id} = ${String(amount)}`).toBe(true);
    }
    const producing = state.buildings.filter((b) => productionOf(b.type)).map((b) => b.id);
    expect(state.production.map((p) => p.buildingId), label).toEqual(producing);
    for (const producer of state.production) {
      const building = state.buildings.find((b) => b.id === producer.buildingId);
      const rules = building ? productionOf(building.type) : undefined;
      expect(PRODUCER_STATUSES, label).toContain(producer.status);
      expect(producer.progress, label).toBeGreaterThanOrEqual(0);
      expect(producer.progress, label).toBeLessThan(rules?.intervalTicks ?? 1);
    }
  }

  it('hält das Lager ganzzahlig und nie negativ und die Arbeitszustände im Takt mit den Gebäuden (zufällige Befehle)', () => {
    for (const seed of [1, 4]) {
      const sim = new Simulation(createInitialState(seed));
      const rng = new Rng(seed * 101);
      const ids = BUILDING_TYPES.map((type) => type.id);
      for (let step = 0; step < 1500; step += 1) {
        const x = 12 + rng.int(24);
        const y = 12 + rng.int(24);
        switch (rng.int(6)) {
          case 0:
          case 1:
            sim.send({ type: 'placeBuilding', buildingType: ids[rng.int(ids.length)] ?? 'flower', x, y });
            break;
          case 2:
            sim.send({ type: 'placePaths', tiles: [{ x, y }, { x: x + 1, y }, { x: x + 2, y }] });
            break;
          case 3: {
            const building = sim.state.buildings[rng.int(Math.max(1, sim.state.buildings.length))];
            if (building) {
              sim.send({ type: 'moveBuilding', id: building.id, x, y });
            }
            break;
          }
          case 4:
            sim.send({ type: 'demolish', x, y });
            break;
          default:
            sim.send({ type: 'placeBuilding', buildingType: 'house-red', x: Number.NaN, y });
        }
        for (let i = rng.int(25); i >= 0; i -= 1) {
          sim.update(sim.tickMs);
        }
        check(sim.state, `Seed ${String(seed)}, Schritt ${String(step)}`);
      }
      expect(sim.state.buildings.length).toBeGreaterThan(3);
    }
  });

  it('gibt beim Abreißen nie mehr, als Bauen gekostet hat (kein Geld aus dem Nichts durch Bauen und Abreißen)', () => {
    const sim = new Simulation(createInitialState(1));
    const total = (): number => Object.values(sim.state.inventory).reduce((sum, amount) => sum + amount, 0);
    const bot = new Bot(sim);
    const spot = bot.findSpot('house-blue');
    expect(spot).toBeDefined();
    const before = total();
    for (let i = 0; i < 20; i += 1) {
      sim.send({ type: 'placeBuilding', buildingType: 'house-blue', x: spot?.x ?? 0, y: spot?.y ?? 0 });
      sim.send({ type: 'demolish', x: spot?.x ?? 0, y: spot?.y ?? 0 });
    }
    sim.update(sim.tickMs);
    expect(total()).toBe(before);
  });
});
