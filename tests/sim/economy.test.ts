import { describe, expect, it } from 'vitest';
import { BUILDING_TYPES } from '../../src/data/buildings';
import { ITEM_IDS, MAX_AMOUNT, START_INVENTORY } from '../../src/data/goods';
import {
  addAmounts,
  canAfford,
  costOf,
  createStartInventory,
  hasNearby,
  missingAmounts,
  missingFor,
  nearbyArea,
  nearbyTiles,
  normalizeInventory,
  productionOf,
  refundFor,
  sanitizeAmounts,
  takeAmounts,
} from '../../src/sim/economy';
import { createInitialState } from '../../src/sim/state';
import { fillTerrain, grassState, setStore } from './helpers';

describe('sanitizeAmounts: fängt kaputte Werte aus der JSON ab', () => {
  it('behält ganze positive Mengen bekannter Dinge', () => {
    expect(sanitizeAmounts({ coins: 20, wood: 5 })).toEqual({ coins: 20, wood: 5 });
  });

  it('wirft unbekannte Waren, Null, negative, gebrochene und kaputte Mengen weg', () => {
    expect(
      sanitizeAmounts({ coins: 10, unicorn: 3, wood: 0, stone: -2, berries: 1.5, cake: Number.NaN, furniture: '3', __proto__: { wood: 9 } }),
    ).toEqual({ coins: 10 });
  });

  it('macht aus Unsinn eine leere Liste', () => {
    for (const bad of [undefined, null, 5, 'wood', [], true]) {
      expect(sanitizeAmounts(bad)).toEqual({});
    }
  });
});

describe('normalizeInventory', () => {
  it('liefert alle bekannten Dinge als ganze Zahlen von 0 bis zur Obergrenze', () => {
    const inventory = normalizeInventory({ coins: 12.9, wood: -4, stone: Number.NaN, berries: 1e12, ghost: 5, cake: Infinity });
    expect(Object.keys(inventory)).toEqual([...ITEM_IDS]);
    expect(inventory).toEqual({ coins: 12, wood: 0, stone: 0, berries: MAX_AMOUNT, furniture: 0, cake: 0 });
  });

  it('macht aus Unsinn ein leeres Lager', () => {
    for (const bad of [undefined, null, 'x', 7]) {
      expect(normalizeInventory(bad)).toEqual({ coins: 0, wood: 0, stone: 0, berries: 0, furniture: 0, cake: 0 });
    }
  });

  it('übernimmt das Startlager aus goods.json', () => {
    const start = createStartInventory();
    for (const id of ITEM_IDS) {
      expect(start[id], id).toBe(START_INVENTORY[id] ?? 0);
    }
    expect(createStartInventory()).not.toBe(start);
  });
});

describe('Mengen rechnen', () => {
  it('berechnet, was fehlt', () => {
    expect(missingAmounts({ coins: 5, wood: 10 }, { coins: 20, wood: 5, stone: 2 })).toEqual({ coins: 15, stone: 2 });
    expect(missingAmounts({ coins: 50 }, { coins: 20 })).toEqual({});
  });

  it('bucht nur ganz oder gar nicht ab', () => {
    const inventory = { coins: 10, wood: 1 };
    expect(takeAmounts(inventory, { coins: 5, wood: 2 })).toBe(false);
    expect(inventory).toEqual({ coins: 10, wood: 1 });
    expect(takeAmounts(inventory, { coins: 5, wood: 1 })).toBe(true);
    expect(inventory).toEqual({ coins: 5, wood: 0 });
  });

  it('zählt über die Obergrenze hinaus nichts mehr, verliert aber sonst nichts', () => {
    const inventory = { coins: MAX_AMOUNT - 1, wood: 3 };
    addAmounts(inventory, { coins: 5, wood: 2 });
    expect(inventory).toEqual({ coins: MAX_AMOUNT, wood: 5 });
  });
});

describe('Kosten der Bauten', () => {
  it('bietet für jeden Typ ganzzahlige Kosten; Wege kosten nichts', () => {
    for (const type of BUILDING_TYPES) {
      const cost = costOf(type.id);
      for (const amount of Object.values(cost)) {
        expect(Number.isInteger(amount) && amount > 0, type.id).toBe(true);
      }
    }
    expect(costOf('path')).toEqual({});
  });

  it('behandelt unbekannte Typen als kostenlos', () => {
    expect(costOf('nope')).toEqual({});
    expect(productionOf('nope')).toBeUndefined();
  });

  it('prüft mit canAfford und missingFor gegen das Lager', () => {
    const state = grassState();
    setStore(state, { coins: 10, wood: 1 });
    expect(canAfford(state, 'flower')).toBe(true);
    expect(canAfford(state, 'lumberjack')).toBe(false);
    expect(missingFor(state, 'lumberjack')).toEqual({ coins: 5, wood: 2 });
    setStore(state, { coins: 100, wood: 100, stone: 100 });
    expect(canAfford(state, 'fountain')).toBe(true);
    expect(missingFor(state, 'fountain')).toEqual({});
  });

  it('nennt für Produktionsgebäude die Regeln mit mindestens einem Tick Dauer', () => {
    for (const type of BUILDING_TYPES.filter((t) => t.category === 'production')) {
      const rules = productionOf(type.id);
      expect(rules, type.id).toBeDefined();
      expect(rules?.intervalTicks, type.id).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('refundFor', () => {
  it('erstattet die vollen Baukosten', () => {
    const state = createInitialState(1);
    for (const building of state.buildings) {
      expect(refundFor(state, building.id), building.type).toEqual(costOf(building.type));
    }
    expect(refundFor(state, 9999)).toEqual({});
  });

  it('erstattet zusätzlich die Zutaten einer laufenden Runde', () => {
    const state = createInitialState(1);
    const garden = state.buildings.find((b) => b.type === 'berry-garden');
    expect(garden).toBeDefined();
    state.buildings.push({ id: 900, type: 'carpenter', x: 0, y: 0 });
    state.production.push({ buildingId: 900, progress: 3, status: 'working', delivered: 0, lastSale: 0 });
    expect(refundFor(state, 900)).toEqual({ coins: 30, wood: 8 + 2, stone: 2 });
    state.production[state.production.length - 1]!.progress = 0;
    expect(refundFor(state, 900)).toEqual({ coins: 30, wood: 8, stone: 2 });
  });
});

describe('Wald und Fels in der Nähe', () => {
  it('rechnet die Fläche um den Grundriss herum und schneidet am Kartenrand ab', () => {
    const world = grassState(16).world;
    const type = { footprint: { w: 2, h: 2 } };
    expect(nearbyArea(world, type, 5, 5, 4)).toEqual({ x0: 1, y0: 1, x1: 10, y1: 10 });
    expect(nearbyArea(world, type, 0, 14, 4)).toEqual({ x0: 0, y0: 10, x1: 5, y1: 15 });
  });

  it('findet Kacheln der Art genau bis zum Radius', () => {
    const state = grassState(16);
    const type = { footprint: { w: 2, h: 2 } };
    fillTerrain(state, 10, 5, 1, 1, 'forest');
    expect(hasNearby(state.world, type, 5, 5, 'forest', 4)).toBe(true);
    expect(hasNearby(state.world, type, 6, 5, 'forest', 4)).toBe(true);
    expect(hasNearby(state.world, type, 4, 5, 'forest', 4)).toBe(false);
    expect(hasNearby(state.world, type, 5, 5, 'forest', 3)).toBe(false);
    expect(hasNearby(state.world, type, 5, 5, 'rock', 4)).toBe(false);
    expect(nearbyTiles(state.world, type, 5, 5, 'forest', 4)).toEqual([{ x: 10, y: 5 }]);
  });
});
