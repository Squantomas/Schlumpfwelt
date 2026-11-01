import { describe, expect, it } from 'vitest';
import {
  BUILDING_TYPES,
  ISLAND_ACTIONS,
  LOCKED_TYPE_IDS,
  SHOP_CATEGORIES,
  buildingType,
  shopCategoryOf,
  shopItems,
  typesOf,
  unlockOf,
  type BuildingCategory,
  type ShopCategory,
} from '../../src/data/buildings';
import { isItem } from '../../src/data/goods';
import texts from '../../src/data/texts.de.json';

const SHOP_OF: Readonly<Record<Exclude<BuildingCategory, 'path'>, ShopCategory>> = {
  house: 'houses',
  deco: 'deco',
  production: 'production',
  island: 'island',
  resident: 'houses',
};

describe('Shop: Kategorien und Artikel (buildings.json)', () => {
  it('hat die vier Kategorien Häuser, Deko, Gebäude, Insel', () => {
    expect([...SHOP_CATEGORIES]).toEqual(['houses', 'deco', 'production', 'island']);
  });

  it('hat in jeder Kategorie mindestens drei Artikel', () => {
    for (const category of SHOP_CATEGORIES) {
      expect(shopItems(category).length, category).toBeGreaterThanOrEqual(3);
    }
  });

  it('verkauft Häuser (mind. 3 Varianten), alle 6 Produktionsgebäude und Deko mit Blumen, Zaun, Bank, Laterne, Brunnen, Busch', () => {
    expect(shopItems('houses').length).toBeGreaterThanOrEqual(3);
    expect(shopItems('production').map((type) => type.id).sort()).toEqual(['bakery', 'berry-garden', 'carpenter', 'lumberjack', 'market', 'quarry']);
    const deco = shopItems('deco').map((type) => type.id);
    for (const id of ['flower', 'fence', 'bench', 'lantern', 'fountain', 'bush']) {
      expect(deco, id).toContain(id);
    }
  });

  it('hat in der Insel-Kategorie Baum, Fels und Land aufschütten', () => {
    const island = shopItems('island').map((type) => type.id);
    expect(island).toEqual(expect.arrayContaining(['tree', 'rock', 'beach']));
  });

  it('jeder Typ außer dem Weg steht in genau einer Kategorie, passend zu seiner Art; Wege stehen nicht im Shop', () => {
    expect(buildingType('path')?.shop).toBeUndefined();
    expect(shopCategoryOf('path')).toBeUndefined();
    for (const type of BUILDING_TYPES) {
      if (type.category === 'path') {
        continue;
      }
      expect(type.shop?.category, type.id).toBe(SHOP_OF[type.category]);
      expect(shopCategoryOf(type.id), type.id).toBe(SHOP_OF[type.category]);
    }
    const listed = SHOP_CATEGORIES.flatMap((category) => shopItems(category).map((type) => type.id));
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed.length).toBe(BUILDING_TYPES.filter((type) => type.category !== 'path').length);
  });

  it('die Reihenfolge im Shop ist die der Datei', () => {
    const order = BUILDING_TYPES.map((type) => type.id);
    for (const category of SHOP_CATEGORIES) {
      const ids = shopItems(category).map((type) => type.id);
      expect(ids, category).toEqual([...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    }
  });

  it('hat Preise aus bekannten Dingen mit ganzen Mengen; kein Artikel ist gratis', () => {
    for (const type of BUILDING_TYPES.filter((t) => t.shop)) {
      const entries = Object.entries(type.cost);
      expect(entries.length, type.id).toBeGreaterThan(0);
      for (const [id, amount] of entries) {
        expect(isItem(id), `${type.id}: ${id}`).toBe(true);
        expect(Number.isInteger(amount) && amount > 0, `${type.id}: ${id}`).toBe(true);
      }
    }
  });

  it('kostet höchstens vier verschiedene Dinge (so viele zeigt die Kostenzeile einer Karte)', () => {
    for (const type of BUILDING_TYPES) {
      expect(Object.keys(type.cost).length, type.id).toBeLessThanOrEqual(4);
    }
  });

  it('Inselartikel haben eine bekannte Aktion, sonst hat sie niemand', () => {
    for (const type of BUILDING_TYPES) {
      if (type.category === 'island') {
        expect(ISLAND_ACTIONS as readonly string[], type.id).toContain(type.island?.action);
      } else {
        expect(type.island, type.id).toBeUndefined();
      }
    }
    expect(new Set(typesOf('island').map((type) => type.island?.action)).size).toBe(typesOf('island').length);
  });

  it('alle Namen der Artikel und Kategorien haben Texte', () => {
    for (const type of BUILDING_TYPES) {
      expect(Object.keys(texts), type.id).toContain(type.nameKey);
    }
    for (const category of SHOP_CATEGORIES) {
      expect(Object.keys(texts), category).toContain(`shop.${category}`);
    }
  });
});

describe('Shop: Freischaltungen (buildings.json)', () => {
  it('jede Bedingung ist wohlgeformt und zeigt auf einen existierenden Typ', () => {
    for (const type of BUILDING_TYPES) {
      if (type.unlock === undefined) {
        continue;
      }
      const unlock = unlockOf(type.id);
      expect(unlock, `${type.id}: Bedingung kaputt`).toBeDefined();
      expect(unlock, type.id).toEqual(type.unlock);
      if (unlock?.kind === 'count') {
        expect(buildingType(unlock.building), `${type.id} → ${unlock.building}`).toBeDefined();
        expect(unlock.building, `${type.id} wartet auf sich selbst`).not.toBe(type.id);
        expect(unlock.count, type.id).toBeLessThanOrEqual(10);
      }
      if (unlock?.kind === 'houses') {
        expect(unlock.count, type.id).toBeLessThanOrEqual(10);
      }
      if (unlock?.kind === 'earned') {
        // Schnell zu erreichen: höchstens ein paar hundert Taler.
        expect(unlock.coins, type.id).toBeLessThanOrEqual(500);
      }
    }
  });

  it('hat keine Wege und keine Inselartikel als Voraussetzung (die man nicht „stehen“ hat) und keine Kreise', () => {
    const needs = (id: string): string | undefined => {
      const unlock = unlockOf(id);
      return unlock?.kind === 'count' ? unlock.building : undefined;
    };
    for (const id of LOCKED_TYPE_IDS) {
      const seen = new Set<string>([id]);
      let current = needs(id);
      while (current !== undefined) {
        expect(seen.has(current), `Kreis bei ${id}: ${[...seen].join(' → ')} → ${current}`).toBe(false);
        seen.add(current);
        expect(buildingType(current)?.category, `${id} wartet auf ${current}`).not.toBe('island');
        expect(buildingType(current)?.category, `${id} wartet auf ${current}`).not.toBe('path');
        current = needs(current);
      }
    }
  });

  it('alles ist erreichbar: jede Kette endet bei einem Typ ohne Bedingung', () => {
    const free = (id: string): boolean => unlockOf(id) === undefined;
    const reachable = (id: string, depth = 0): boolean => {
      if (depth > 20) {
        return false;
      }
      const unlock = unlockOf(id);
      if (unlock?.kind === 'count') {
        return reachable(unlock.building, depth + 1);
      }
      return true;
    };
    for (const type of BUILDING_TYPES) {
      expect(reachable(type.id), type.id).toBe(true);
    }
    // Häuser zählen: es gibt mindestens ein Haus ohne Bedingung.
    expect(typesOf('house').some((type) => free(type.id))).toBe(true);
    // Taler verdienen: Beerengarten und Markt (die Kette zu Geld) sind frei.
    for (const id of ['berry-garden', 'market', 'lumberjack']) {
      expect(free(id), id).toBe(true);
    }
  });

  it('die Voraussetzung eines Gebäudes ist weniger weit als das Gebäude selbst (man braucht nichts Teureres zuerst)', () => {
    const cost = (id: string): number => buildingType(id)?.cost['coins'] ?? 0;
    for (const id of LOCKED_TYPE_IDS) {
      const unlock = unlockOf(id);
      if (unlock?.kind === 'count') {
        expect(cost(unlock.building), `${id} braucht ${unlock.building}`).toBeLessThanOrEqual(Math.max(cost(id), 40));
      }
    }
  });

  it('alle Sätze für gesperrte Karten haben Texte', () => {
    for (const key of ['unlock.count', 'unlock.houseOne', 'unlock.houses', 'unlock.earned', 'hint.locked', 'shop.newItem', 'shop.and']) {
      expect(Object.keys(texts), key).toContain(key);
    }
  });

  it('der Start ist gut spielbar: Holzfäller, Beerengarten, Markt, Haus, Baum, Fels und die einfache Deko sind frei', () => {
    for (const id of ['lumberjack', 'berry-garden', 'market', 'house-red', 'house-blue', 'house-yellow', 'tree', 'rock', 'flower', 'bush', 'fence']) {
      expect(unlockOf(id), id).toBeUndefined();
    }
    // Und es ist nicht alles frei – es gibt etwas freizuschalten, mit allen drei Arten.
    expect(LOCKED_TYPE_IDS.length).toBeGreaterThanOrEqual(8);
  });
});
