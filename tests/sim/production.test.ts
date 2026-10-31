import { describe, expect, it } from 'vitest';
import { goodDef } from '../../src/data/goods';
import { applyCommand } from '../../src/sim/commands';
import { productionOf } from '../../src/sim/economy';
import { refreshStatuses, sellableAmount, tickProduction } from '../../src/sim/production';
import { Simulation } from '../../src/sim/simulation';
import { createInitialState, type SimState } from '../../src/sim/state';
import { buildConnected, fillTerrain, grassState, producerOf, run, setStore, setTerrainAt, tickN } from './helpers';

/** The length of one round of a type, from the data (so balancing does not break the tests). */
function interval(typeId: string): number {
  const rules = productionOf(typeId);
  if (!rules) {
    throw new Error(typeId);
  }
  return rules.intervalTicks;
}

/** A grass map with a forest to the east and a rock patch to the south, an empty store, and no buildings. */
function island(): SimState {
  const state = grassState(24);
  fillTerrain(state, 12, 2, 3, 4, 'forest');
  fillTerrain(state, 2, 14, 3, 3, 'rock');
  setStore(state);
  return state;
}

describe('Erzeugung in festen Ticks', () => {
  it('Holzfällerhütte: nach genau einer Runde ein Holz, danach alle Runden eins; der Wald bleibt', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 10 });
    const id = buildConnected(state, 'lumberjack', 9, 3);
    setStore(state);
    const forestBefore = state.world.tiles.filter((t) => t === 'forest').length;
    const n = interval('lumberjack');
    tickN(state, n - 1);
    expect(state.inventory['wood']).toBe(0);
    expect(producerOf(state, id).status).toBe('working');
    tickN(state, 1);
    expect(state.inventory['wood']).toBe(1);
    tickN(state, 3 * n);
    expect(state.inventory['wood']).toBe(4);
    expect(state.world.tiles.filter((t) => t === 'forest').length).toBe(forestBefore);
    expect(producerOf(state, id).delivered).toBe(4);
  });

  it('Beerengarten: Beeren ohne Zutaten und ohne Wald in der Nähe', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 10 });
    const id = buildConnected(state, 'berry-garden', 4, 3);
    setStore(state);
    tickN(state, interval('berry-garden'));
    expect(state.inventory['berries']).toBe(1);
    expect(producerOf(state, id).status).toBe('working');
  });

  it('Steinbruch: Stein, wenn Fels in der Nähe ist', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 10 });
    buildConnected(state, 'quarry', 6, 14);
    setStore(state);
    tickN(state, interval('quarry'));
    expect(state.inventory['stone']).toBe(1);
    expect(state.world.tiles.filter((t) => t === 'rock').length).toBe(9);
  });

  it('Schreinerei: nimmt beim Start einer Runde das Holz und macht danach Möbel', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 20, stone: 5 });
    const id = buildConnected(state, 'carpenter', 4, 3);
    const rules = productionOf('carpenter');
    setStore(state, { wood: 7 });
    tickN(state, 1);
    expect(state.inventory['wood']).toBe(7 - (rules?.inputs['wood'] ?? 0));
    tickN(state, interval('carpenter') - 1);
    expect(state.inventory['furniture']).toBe(1);
    expect(producerOf(state, id).progress).toBe(0);
  });

  it('Bäckerei: macht aus Beeren Beerenkuchen', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 20 });
    buildConnected(state, 'bakery', 4, 3);
    const rules = productionOf('bakery');
    setStore(state, { berries: 5 });
    tickN(state, interval('bakery'));
    expect(state.inventory['cake']).toBe(1);
    expect(state.inventory['berries']).toBe(5 - (rules?.inputs['berries'] ?? 0));
  });

  it('Marktplatz: verkauft Möbel und Kuchen zu den Preisen aus goods.json und macht Taler', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 20 });
    const id = buildConnected(state, 'market', 4, 3, 3, 3);
    setStore(state, { furniture: 1, cake: 1 });
    const perCycle = productionOf('market')?.sell?.perCycle ?? 1;
    expect(perCycle).toBe(1);
    tickN(state, interval('market'));
    // Ein Stück pro Runde; verkauft wird das Wertvollste, das da ist (Möbel vor Kuchen).
    expect(state.inventory['coins']).toBe(goodDef('furniture')?.price);
    expect(state.inventory['furniture']).toBe(0);
    expect(producerOf(state, id).lastSale).toBe(goodDef('furniture')?.price);
    tickN(state, interval('market'));
    expect(state.inventory['coins']).toBe((goodDef('furniture')?.price ?? 0) + (goodDef('cake')?.price ?? 0));
    expect(state.inventory['cake']).toBe(0);
  });

  it('verkauft kein Baumaterial: Holz und Stein bleiben im Lager, der Markt ist im Leerlauf', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 20 });
    const id = buildConnected(state, 'market', 4, 3, 3, 3);
    setStore(state, { wood: 9, stone: 9 });
    tickN(state, 3 * interval('market'));
    expect(state.inventory).toEqual({ coins: 0, wood: 9, stone: 9, berries: 0, furniture: 0, cake: 0 });
    expect(producerOf(state, id).status).toBe('idle');
  });

  it('kauft Beeren für wenig Geld, aber nur über der Reserve für die Bäckerei', () => {
    const keep = goodDef('berries')?.keep ?? 0;
    const price = goodDef('berries')?.price ?? 0;
    expect(price).toBeGreaterThan(0);
    const state = island();
    setStore(state, { coins: 100, wood: 20 });
    const id = buildConnected(state, 'market', 4, 3, 3, 3);
    setStore(state, { berries: keep });
    tickN(state, 3 * interval('market'));
    expect(state.inventory['berries']).toBe(keep);
    expect(producerOf(state, id).status).toBe('idle');
    state.inventory['berries'] = keep + 2;
    tickN(state, 2 * interval('market'));
    expect(state.inventory['berries']).toBe(keep);
    expect(state.inventory['coins']).toBe(2 * price);
  });

  it('verkauft Endprodukte vor Beeren, auch wenn mehr Beeren da sind', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 20 });
    buildConnected(state, 'market', 4, 3, 3, 3);
    setStore(state, { furniture: 1, cake: 1, berries: 50 });
    tickN(state, interval('market'));
    expect(state.inventory['furniture']).toBe(0);
    tickN(state, interval('market'));
    expect(state.inventory['cake']).toBe(0);
    expect(state.inventory['berries']).toBe(50);
    tickN(state, interval('market'));
    expect(state.inventory['berries']).toBe(49);
  });

  it('verkauft die wertvollere Ware zuerst (Möbel vor Kuchen), unabhängig von der Menge', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 20 });
    buildConnected(state, 'market', 4, 3, 3, 3);
    setStore(state, { furniture: 1, cake: 3 });
    tickN(state, interval('market'));
    expect(state.inventory['cake']).toBe(3);
    expect(state.inventory['furniture']).toBe(0);
  });

  it('behält mit keepForFood Kuchen im Lager zurück (in M3 ist der Wert 0)', () => {
    const cake = goodDef('cake') as { keepForFood?: number } | undefined;
    expect(cake?.keepForFood).toBe(0);
    const state = island();
    setStore(state, { coins: 100, wood: 20 });
    buildConnected(state, 'market', 4, 3, 3, 3);
    setStore(state, { cake: 4 });
    try {
      if (cake) {
        cake.keepForFood = 3;
      }
      expect(sellableAmount(state.inventory, 'cake')).toBe(1);
      tickN(state, 5 * interval('market'));
      expect(state.inventory['cake']).toBe(3);
      expect(state.inventory['coins']).toBe(goodDef('cake')?.price);
    } finally {
      if (cake) {
        cake.keepForFood = 0;
      }
    }
    expect(sellableAmount(state.inventory, 'cake')).toBe(3);
    expect(sellableAmount(state.inventory, 'wood')).toBe(0);
    expect(sellableAmount({ berries: 7 }, 'berries')).toBe(7 - (goodDef('berries')?.keep ?? 0));
  });
});

describe('Kette Holz → Möbel → Taler', () => {
  it('bringt nach einer Weile Taler, wenn alle drei Gebäude am Weg stehen', () => {
    const state = island();
    setStore(state, { coins: 500, wood: 100, stone: 10 });
    buildConnected(state, 'lumberjack', 9, 3);
    buildConnected(state, 'carpenter', 5, 3);
    buildConnected(state, 'market', 1, 3, 3, 3);
    setStore(state, { coins: 0, wood: 0, stone: 0 });
    const furniturePrice = goodDef('furniture')?.price ?? 0;
    const wood = productionOf('carpenter')?.inputs['wood'] ?? 0;
    const ticks = interval('lumberjack') * wood + interval('carpenter') + interval('market') + 5;
    tickN(state, ticks);
    const coins = state.inventory['coins'] ?? 0;
    expect(coins).toBeGreaterThanOrEqual(furniturePrice);
    expect(coins % furniturePrice).toBe(0);
  });

  it('zahlt Holz → Möbel → Taler genau nach und nach aus (kein Verlust, keine Erzeugung aus dem Nichts)', () => {
    const state = island();
    setStore(state, { coins: 500, wood: 100, stone: 10 });
    buildConnected(state, 'carpenter', 5, 3);
    buildConnected(state, 'market', 1, 3, 3, 3);
    const wood = productionOf('carpenter')?.inputs['wood'] ?? 0;
    setStore(state, { wood: 3 * wood });
    tickN(state, 3 * interval('carpenter') + 3 * interval('market'));
    expect(state.inventory['wood']).toBe(0);
    expect(state.inventory['coins']).toBe(3 * (goodDef('furniture')?.price ?? 0));
    expect(state.inventory['furniture']).toBe(0);
  });
});

describe('Kein Ertrag ohne Weg, ohne Wald im Radius, ohne Zutaten', () => {
  it('Ohne Weg wird nichts erzeugt (noPath); mit Weg läuft die Arbeit an', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 10 });
    run(state, { type: 'placeBuilding', buildingType: 'lumberjack', x: 9, y: 3 });
    setStore(state);
    const id = state.buildings[0]?.id ?? 0;
    tickN(state, 3 * interval('lumberjack'));
    expect(state.inventory['wood']).toBe(0);
    expect(producerOf(state, id)).toMatchObject({ status: 'noPath', progress: 0, delivered: 0 });
    run(state, { type: 'placePaths', tiles: [{ x: 9, y: 5 }] });
    tickN(state, 1);
    expect(producerOf(state, id).status).toBe('working');
    tickN(state, interval('lumberjack'));
    expect(state.inventory['wood']).toBe(1);
  });

  it('Ein Weg nur diagonal am Gebäude zählt nicht', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 10 });
    run(state, { type: 'placeBuilding', buildingType: 'berry-garden', x: 4, y: 3 }, { type: 'placePaths', tiles: [{ x: 6, y: 5 }] });
    tickN(state, 1);
    expect(state.production[0]?.status).toBe('noPath');
  });

  it('Wird der Weg mitten in der Runde abgerissen, hält die Arbeit an und geht danach weiter', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 10 });
    const id = buildConnected(state, 'berry-garden', 4, 3);
    tickN(state, 10);
    expect(producerOf(state, id).progress).toBe(10);
    run(state, { type: 'demolish', x: 4, y: 5 }, { type: 'demolish', x: 5, y: 5 });
    tickN(state, 30);
    expect(producerOf(state, id)).toMatchObject({ status: 'noPath', progress: 10 });
    run(state, { type: 'placePaths', tiles: [{ x: 4, y: 5 }] });
    tickN(state, 1);
    expect(producerOf(state, id)).toMatchObject({ status: 'working', progress: 11 });
  });

  it('Ohne Bäume im Radius wird kein Holz erzeugt (noNearby); mit Bäumen geht es weiter', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 10 });
    const id = buildConnected(state, 'lumberjack', 9, 3);
    setStore(state);
    tickN(state, 10);
    // Der Wald verschwindet (in M3 kann das nur ein Test): kein Ertrag, die Runde hält an.
    fillTerrain(state, 12, 2, 3, 4, 'grass');
    tickN(state, 100);
    expect(state.inventory['wood']).toBe(0);
    expect(producerOf(state, id)).toMatchObject({ status: 'noNearby', progress: 10 });
    setTerrainAt(state, 11, 4, 'forest');
    tickN(state, 1);
    expect(producerOf(state, id).status).toBe('working');
    tickN(state, interval('lumberjack'));
    expect(state.inventory['wood']).toBeGreaterThanOrEqual(1);
  });

  it('Ohne Holz wartet die Schreinerei (waitingInput) und nimmt nichts', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 20, stone: 5 });
    const id = buildConnected(state, 'carpenter', 4, 3);
    const need = productionOf('carpenter')?.inputs['wood'] ?? 0;
    setStore(state, { wood: need - 1 });
    tickN(state, 50);
    expect(state.inventory['wood']).toBe(need - 1);
    expect(producerOf(state, id)).toMatchObject({ status: 'waitingInput', progress: 0 });
    state.inventory['wood'] = need;
    tickN(state, 1);
    expect(producerOf(state, id)).toMatchObject({ status: 'working', progress: 1 });
    expect(state.inventory['wood']).toBe(0);
    // Mitten in der Runde ist das Holz schon genommen: ein leeres Lager stört nicht mehr.
    tickN(state, 5);
    expect(producerOf(state, id).status).toBe('working');
  });

  it('Der Markt ist „idle“, wenn es nichts zu verkaufen gibt, und arbeitet los, sobald es etwas gibt', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 20 });
    const id = buildConnected(state, 'market', 4, 3, 3, 3);
    setStore(state);
    tickN(state, 1);
    expect(producerOf(state, id).status).toBe('idle');
    state.inventory['cake'] = 1;
    tickN(state, 1);
    expect(producerOf(state, id)).toMatchObject({ status: 'working', progress: 1 });
  });

  it('Der Status wechselt in der Reihenfolge Weg → Bäume → Zutaten', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 20, stone: 5 });
    // Eine Schreinerei ohne Weg und ohne Holz: zuerst fehlt der Weg.
    run(state, { type: 'placeBuilding', buildingType: 'carpenter', x: 4, y: 3 });
    setStore(state);
    tickN(state, 1);
    expect(state.production[0]?.status).toBe('noPath');
    run(state, { type: 'placePaths', tiles: [{ x: 4, y: 5 }] });
    tickN(state, 1);
    expect(state.production[0]?.status).toBe('waitingInput');
  });

  it('refreshStatuses ändert den Status ohne Zeit vergehen zu lassen', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 20 });
    const id = buildConnected(state, 'berry-garden', 4, 3);
    refreshStatuses(state);
    expect(producerOf(state, id)).toMatchObject({ status: 'working', progress: 0 });
    run(state, { type: 'demolish', x: 4, y: 5 }, { type: 'demolish', x: 5, y: 5 });
    refreshStatuses(state);
    expect(producerOf(state, id).status).toBe('noPath');
    expect(state.tick).toBe(0);
  });
});

describe('Abreißen während der Arbeit', () => {
  it('erstattet die Zutaten der laufenden Runde und entfernt den Arbeitszustand', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 20, stone: 5 });
    const id = buildConnected(state, 'carpenter', 4, 3);
    const need = productionOf('carpenter')?.inputs['wood'] ?? 0;
    setStore(state, { wood: need });
    tickN(state, 5);
    expect(state.inventory['wood']).toBe(0);
    run(state, { type: 'demolish', x: 4, y: 3 });
    expect(state.inventory['wood']).toBe(need + 8);
    expect(state.production.find((p) => p.buildingId === id)).toBeUndefined();
  });

  it('lässt beim Verschieben die Arbeit weiterlaufen', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 20 });
    const id = buildConnected(state, 'berry-garden', 4, 3);
    tickN(state, 20);
    run(state, { type: 'moveBuilding', id, x: 4, y: 7 }, { type: 'placePaths', tiles: [{ x: 4, y: 9 }] });
    expect(producerOf(state, id).progress).toBe(20);
    tickN(state, 1);
    expect(producerOf(state, id)).toMatchObject({ status: 'working', progress: 21 });
  });
});

describe('Ablauf in der Simulation', () => {
  it('arbeitet nur, solange die Zeit läuft: pausiert gibt es keinen Ertrag', () => {
    const sim = new Simulation(createInitialState(1));
    const berriesAt = (): number => sim.state.inventory['berries'] ?? 0;
    sim.send({ type: 'setPaused', paused: true });
    sim.update(100);
    sim.update(60_000);
    expect(berriesAt()).toBe(0);
    expect(sim.state.tick).toBe(0);
    sim.send({ type: 'setPaused', paused: false });
    sim.update(100);
    expect(sim.state.tick).toBe(1);
  });

  it('holt lange Frames nicht nach (kein Ertrag im Hintergrund)', () => {
    const sim = new Simulation(createInitialState(1));
    sim.update(10 * 60 * 1000);
    // Ein Frame wird auf 250 ms gekappt: höchstens ein paar Ticks, nie Minuten Arbeit.
    expect(sim.state.tick).toBeLessThanOrEqual(3);
    expect(sim.state.inventory['berries']).toBe(0);
  });

  it('erzeugt im Startdorf Beeren, hat dort einen Marktplatz im Leerlauf und meldet Fortschritt', () => {
    const sim = new Simulation(createInitialState(1));
    const garden = sim.state.buildings.find((b) => b.type === 'berry-garden');
    const market = sim.state.buildings.find((b) => b.type === 'market');
    expect(garden && market).toBeTruthy();
    for (let i = 0; i < interval('berry-garden'); i += 1) {
      sim.update(sim.tickMs);
    }
    expect(sim.state.inventory['berries']).toBe(1);
    const producer = sim.state.production.find((p) => p.buildingId === market?.id);
    expect(producer?.status).toBe('idle');
  });
});

describe('Determinismus und Speicherbarkeit', () => {
  const script = (state: SimState): void => {
    setStore(state, { coins: 500, wood: 100, stone: 10 });
    buildConnected(state, 'lumberjack', 9, 3);
    buildConnected(state, 'carpenter', 5, 3);
    buildConnected(state, 'market', 1, 3, 3, 3);
    buildConnected(state, 'berry-garden', 15, 8);
    buildConnected(state, 'bakery', 11, 8);
  };

  it('ergibt bei gleichem Ablauf immer genau denselben Zustand', () => {
    const run1 = island();
    const run2 = island();
    script(run1);
    script(run2);
    tickN(run1, 3000);
    tickN(run2, 3000);
    expect(run1).toEqual(run2);
    expect(run1.inventory['coins']).toBeGreaterThan(0);
  });

  it('lässt sich mitten im Lauf als JSON speichern und laden, ohne dass sich der Verlauf ändert', () => {
    const straight = island();
    script(straight);
    const reloaded = island();
    script(reloaded);
    tickN(straight, 2500);
    tickN(reloaded, 1234);
    const copy = JSON.parse(JSON.stringify(reloaded)) as SimState;
    tickN(copy, 2500 - 1234);
    expect(copy).toEqual(straight);
  });

  it('arbeitet die Gebäude in der Reihenfolge ab, in der sie gebaut wurden', () => {
    const state = island();
    script(state);
    expect(state.production.map((p) => p.buildingId)).toEqual(state.buildings.map((b) => b.id));
  });

  it('ignoriert Arbeitszustände ohne Gebäude', () => {
    const state = island();
    state.production.push({ buildingId: 77, progress: 5, status: 'working', delivered: 0, lastSale: 0 });
    expect(() => {
      tickProduction(state);
    }).not.toThrow();
    expect(state.production[0]?.progress).toBe(5);
  });

  it('wendet Befehle und Arbeit je Tick in dieser Reihenfolge an', () => {
    const state = island();
    setStore(state, { coins: 100, wood: 20 });
    applyCommand(state, { type: 'placeBuilding', buildingType: 'berry-garden', x: 4, y: 3 });
    applyCommand(state, { type: 'placePaths', tiles: [{ x: 4, y: 5 }] });
    tickProduction(state);
    expect(state.production[0]).toMatchObject({ status: 'working', progress: 1 });
  });
});
