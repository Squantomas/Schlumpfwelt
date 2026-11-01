import { describe, expect, it } from 'vitest';
import { BUILDING_TYPES, LOCKED_TYPE_IDS, buildingType, typesOf } from '../../src/data/buildings';
import { MAX_AMOUNT } from '../../src/data/goods';
import { PRODUCER_STATUSES, canAfford, costOf, productionOf } from '../../src/sim/economy';
import { Rng } from '../../src/sim/random';
import type { DeepReadonly } from '../../src/sim/readonly';
import { Simulation } from '../../src/sim/simulation';
import { isUnlocked } from '../../src/sim/unlocks';
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
  'house-big',
  'house-garden',
  'flowerbed',
  'pond',
  'tree',
  'rock',
  'beach',
  'meadow',
  'invite',
];

/** Alles, was ein Gebäude auf die Karte stellt (Inselartikel verändern nur das Gelände, die Einladung bringt einen Bewohner). */
const BUILDING_WISHES = WISHES.filter((id) => buildingType(id)?.category !== 'island' && buildingType(id)?.category !== 'resident');

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
      for (const id of BUILDING_WISHES) {
        expect(sim.state.buildings.some((b) => b.type === id), `${id} steht`).toBe(true);
      }
      expect(Math.max(...bot.builtAt.values())).toBeLessThan(15 * MINUTE);
      for (const producer of sim.state.production) {
        expect(producer.status, `Gebäude ${String(producer.buildingId)}`).not.toBe('noPath');
      }
      expect(sim.state.inventory['coins']).toBeGreaterThanOrEqual(0);
    });
  }

  it('schaltet beim Spielen alles frei, was eine Bedingung hat – nichts bleibt für immer gesperrt', () => {
    const sim = new Simulation(createInitialState(1));
    const bot = new Bot(sim);
    play(sim, bot, WISHES, 15 * MINUTE);
    for (const id of LOCKED_TYPE_IDS) {
      expect(sim.state.unlocked, id).toContain(id);
    }
  });

  it('hat in den ersten Minuten schon Neues im Shop: die ersten Freischaltungen kommen nach höchstens 3 Spielminuten', () => {
    const sim = new Simulation(createInitialState(1));
    const bot = new Bot(sim);
    const atStart = sim.state.unlocked.length;
    play(sim, bot, WISHES, 3 * MINUTE);
    expect(sim.state.unlocked.length).toBeGreaterThanOrEqual(atStart + 4);
  });

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

describe('Nie festsitzen, auch ohne Abreißen', () => {
  /** Reihenfolge nach dem Verbauen: erst das, was nur Taler kostet (Holzfäller), dann der Rest. */
  const RECOVERY = ['lumberjack', 'bakery', 'quarry', 'carpenter', 'house-blue', 'house-yellow', 'house-red', 'fence', 'bench', 'flower', 'bush', 'lantern', 'fountain', 'market', 'berry-garden'];

  /** Verbaut Geld, Holz und Stein in Häuser und Deko, bis nichts davon mehr bezahlbar ist. Reißt nichts ab. */
  function spendEverything(sim: Simulation, bot: Bot): number {
    const types = [...typesOf('house'), ...typesOf('deco')].map((type) => type.id);
    let built = 0;
    for (let round = 0; round < 200; round += 1) {
      const affordable = types.filter((id) => isUnlocked(sim.state, id) && canAfford(sim.state, id));
      if (affordable.length === 0) {
        break;
      }
      for (const id of affordable) {
        const spot = bot.findSpot(id);
        if (spot && canAfford(sim.state, id)) {
          sim.send({ type: 'placeBuilding', buildingType: id, x: spot.x, y: spot.y });
          sim.update(sim.tickMs);
          built += 1;
        }
      }
      bot.connectAll();
      sim.update(sim.tickMs);
    }
    return built;
  }

  // Findet der Bot in der zugebauten Mitte keinen erreichbaren Platz mehr, legt er einen Wegstein direkt neben das Gebäude
  // (das reicht für `isConnected`) – so läuft auch Seed 2.
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    it(`kommt nach dem Verbauen von allem Geld und Holz ohne Abriss wieder dazu, jeden Typ zu bauen (Seed ${String(seed)})`, () => {
      const sim = new Simulation(createInitialState(seed));
      const spender = new Bot(sim);
      const startBuildings = sim.state.buildings.length;
      const built = spendEverything(sim, spender);
      expect(built).toBeGreaterThan(3);
      // Festgespielt: Haus und Zäune haben alles aufgebraucht, nichts davon ist mehr bezahlbar.
      expect(sim.state.buildings.length).toBeGreaterThan(startBuildings);
      for (const id of [...typesOf('house'), ...typesOf('deco')].map((type) => type.id)) {
        expect(isUnlocked(sim.state, id) && canAfford(sim.state, id), `${id} ist nach dem Verbauen noch bezahlbar`).toBe(false);
      }
      // Das Startdorf steht noch: Beerengarten und Markt.
      expect(sim.state.buildings.some((b) => b.type === 'berry-garden')).toBe(true);
      expect(sim.state.buildings.some((b) => b.type === 'market')).toBe(true);
      const before = sim.state.buildings.length;

      const bot = new Bot(sim);
      play(sim, bot, RECOVERY, 25 * MINUTE);
      sim.update(sim.tickMs);
      for (const id of RECOVERY) {
        expect(bot.builtAt.get(id), `${id} wurde bestellt`).toBeDefined();
      }
      // Es wurde nichts abgerissen: alles Neue steht zusätzlich.
      expect(sim.state.buildings.length).toBeGreaterThanOrEqual(before + RECOVERY.length - 1);
    });
  }

  it('zeigt auch in dieser Lage (nur Beeren und Markt) nach kurzer Zeit die ersten Taler und dann den Holzfäller', () => {
    const sim = new Simulation(createInitialState(1));
    const spender = new Bot(sim);
    spendEverything(sim, spender);
    const coins = sim.state.inventory['coins'] ?? 0;
    expect(canAfford(sim.state, 'lumberjack')).toBe(false);
    play(sim, new Bot(sim), ['lumberjack'], 5 * MINUTE);
    expect(sim.state.buildings.some((b) => b.type === 'lumberjack')).toBe(true);
    expect(coins).toBeLessThan(20);
  });
});

describe('Invarianten bei beliebigen Befehlen', () => {
  function check(state: DeepReadonly<SimState>, label: string): void {
    for (const [id, amount] of Object.entries(state.inventory)) {
      expect(Number.isInteger(amount) && amount >= 0 && amount <= MAX_AMOUNT, `${label}: ${id} = ${String(amount)}`).toBe(true);
    }
    const producing = state.buildings.filter((b) => productionOf(b.type)).map((b) => b.id);
    expect(state.production.map((p) => p.buildingId), label).toEqual(producing);
    // Gepflanzte Kacheln: aufsteigend, ohne Doppelte, und noch Wald oder Fels.
    expect([...state.planted].sort((a, b) => a.index - b.index), label).toEqual(state.planted);
    expect(new Set(state.planted.map((planted) => planted.index)).size, label).toBe(state.planted.length);
    for (const { index, type } of state.planted) {
      expect(['forest', 'rock'], label).toContain(state.world.tiles[index]);
      expect(['tree', 'rock'], label).toContain(type);
    }
    // Freigeschaltet ist nur, was eine Bedingung hat, höchstens einmal; verdiente Taler sind ganz und wachsen nur.
    expect(new Set(state.unlocked).size, label).toBe(state.unlocked.length);
    for (const id of state.unlocked) {
      expect(LOCKED_TYPE_IDS, label).toContain(id);
    }
    expect(Number.isInteger(state.earnedCoins) && state.earnedCoins >= 0, label).toBe(true);
    for (const producer of state.production) {
      const building = state.buildings.find((b) => b.id === producer.buildingId);
      const rules = building ? productionOf(building.type) : undefined;
      expect(PRODUCER_STATUSES, label).toContain(producer.status);
      expect(producer.progress, label).toBeGreaterThanOrEqual(0);
      expect(producer.progress, label).toBeLessThan(rules?.intervalTicks ?? 1);
    }
  }

  /** Wasser, das ans Land grenzt, und Strand: die Kacheln, auf die Strand und Wiese zielen. */
  function coastAndSand(state: DeepReadonly<SimState>): { coast: { x: number; y: number }[]; sand: { x: number; y: number }[] } {
    const coast: { x: number; y: number }[] = [];
    const sand: { x: number; y: number }[] = [];
    const { width, height, tiles } = state.world;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const here = tiles[y * width + x];
        if (here === 'sand') {
          sand.push({ x, y });
        } else if (here === 'water' && [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx = 0, dy = 0]) => {
          const next = tiles[(y + dy) * width + x + dx];
          return next !== undefined && next !== 'water';
        })) {
          coast.push({ x, y });
        }
      }
    }
    return { coast, sand };
  }

  // Zwei Runden: am Start (Strand und Wiese sind noch gesperrt: es darf keiner gelingen) und mit allem freigeschaltet und viel Geld
  // (Strand und Wiese zielen auf Küste und Strand). 2500 Schritte bei 10 Befehlsarten: Setzen, Wege, Verschieben und Abreißen
  // kommen so oft vor wie in M3 (1500 Schritte bei 6 Arten).
  for (const unlocked of [false, true]) {
    it(`hält das Lager ganzzahlig und nie negativ und die Arbeitszustände im Takt mit den Gebäuden (zufällige Befehle, ${unlocked ? 'alles freigeschaltet' : 'wie am Start'})`, () => {
      for (const seed of [1, 4]) {
        const start = createInitialState(seed);
        if (unlocked) {
          start.unlocked = [...LOCKED_TYPE_IDS];
          start.inventory = { coins: 9000, wood: 900, stone: 900, berries: 0, furniture: 0, cake: 0 };
        }
        const sim = new Simulation(start);
        const rng = new Rng(seed * 101 + (unlocked ? 7 : 0));
        const ids = BUILDING_TYPES.map((type) => type.id);
        const changes = { beach: 0, meadow: 0, tree: 0, rock: 0 };
        let before = [...sim.state.world.tiles];
        let targets = coastAndSand(sim.state);
        for (let step = 0; step < 2500; step += 1) {
          const x = 12 + rng.int(24);
          const y = 12 + rng.int(24);
          if (step % 5 === 0) {
            targets = coastAndSand(sim.state);
          }
          const { coast, sand } = targets;
          const shore = coast[rng.int(Math.max(1, coast.length))] ?? { x, y };
          const beach = sand[rng.int(Math.max(1, sand.length))] ?? { x, y };
          switch (rng.int(10)) {
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
            case 6:
              sim.send({ type: 'plantTree', typeId: 'tree', x, y });
              break;
            case 7:
              sim.send({ type: 'placeRock', typeId: 'rock', x, y });
              break;
            case 8:
              sim.send({ type: 'fillLand', typeId: 'beach', x: shore.x, y: shore.y });
              break;
            case 9:
              sim.send({ type: 'makeMeadow', typeId: 'meadow', x: beach.x, y: beach.y });
              break;
            default:
              sim.send({ type: 'placeBuilding', buildingType: 'house-red', x: Number.NaN, y });
          }
          for (let i = rng.int(25); i >= 0; i -= 1) {
            sim.update(sim.tickMs);
          }
          check(sim.state, `Seed ${String(seed)}, Schritt ${String(step)}`);
          // Was hat sich am Gelände geändert? (alle 5 Schritte, wie die Zielliste)
          const after = sim.state.world.tiles;
          for (let tile = 0; step % 5 === 4 && tile < after.length; tile += 1) {
            if (after[tile] !== before[tile]) {
              if (before[tile] === 'water' && after[tile] === 'sand') changes.beach += 1;
              if (before[tile] === 'sand' && after[tile] === 'grass') changes.meadow += 1;
              if (before[tile] === 'grass' && after[tile] === 'forest') changes.tree += 1;
              if (before[tile] === 'grass' && after[tile] === 'rock') changes.rock += 1;
            }
          }
          if (step % 5 === 4) {
            before = [...after];
          }
        }
        expect(sim.state.buildings.length).toBeGreaterThan(3);
        if (unlocked) {
          expect(changes.beach, `Seed ${String(seed)}: Strand aufgeschüttet`).toBeGreaterThanOrEqual(10);
          expect(changes.meadow, `Seed ${String(seed)}: Wiese angelegt`).toBeGreaterThanOrEqual(5);
          expect(changes.tree, `Seed ${String(seed)}: Bäume gepflanzt`).toBeGreaterThanOrEqual(5);
          expect(changes.rock, `Seed ${String(seed)}: Felsen gesetzt`).toBeGreaterThanOrEqual(5);
        } else {
          // Gesperrt, solange nicht genug Taler verdient sind: höchstens, was nach der Freischaltung gelang.
          expect(changes.beach === 0 || sim.state.unlocked.includes('beach'), `Seed ${String(seed)}: Strand trotz Sperre`).toBe(true);
          expect(changes.meadow === 0 || sim.state.unlocked.includes('meadow'), `Seed ${String(seed)}: Wiese trotz Sperre`).toBe(true);
        }
      }
    }, 60_000);
  }

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
