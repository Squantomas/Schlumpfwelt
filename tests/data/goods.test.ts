import { describe, expect, it } from 'vitest';
import { BUILDING_TYPES, typesOf } from '../../src/data/buildings';
import { COINS, GOODS, ITEM_IDS, MAX_AMOUNT, START_INVENTORY, goodDef, isItem, itemNames, sellableGoods } from '../../src/data/goods';
import texts from '../../src/data/texts.de.json';
import { TERRAINS } from '../../src/sim/world';

const isWhole = (value: unknown): boolean => typeof value === 'number' && Number.isInteger(value);

describe('goods.json', () => {
  it('hat die fünf Waren aus dem Plan und Taler als eigene Größe', () => {
    expect(GOODS.map((good) => good.id)).toEqual(['wood', 'stone', 'berries', 'furniture', 'cake']);
    expect(ITEM_IDS).toEqual([COINS, 'wood', 'stone', 'berries', 'furniture', 'cake']);
    expect(goodDef(COINS)).toBeUndefined();
    expect(isItem(COINS)).toBe(true);
    expect(isItem('unicorn')).toBe(false);
  });

  it('ordnet jede Ware einer Kategorie zu: Baumaterial, Rohstoff oder Endprodukt', () => {
    expect(goodDef('wood')?.category).toBe('material');
    expect(goodDef('stone')?.category).toBe('material');
    expect(goodDef('berries')?.category).toBe('raw');
    expect(goodDef('furniture')?.category).toBe('product');
    expect(goodDef('cake')?.category).toBe('product');
  });

  it('hat für Endprodukte und Beeren einen ganzzahligen Verkaufspreis über 0, für Holz und Stein keinen', () => {
    for (const good of GOODS) {
      if (good.category === 'product' || good.id === 'berries') {
        expect(isWhole(good.price) && (good.price ?? 0) > 0, good.id).toBe(true);
      } else {
        expect(good.price, `${good.id} wird nicht verkauft`).toBeUndefined();
      }
    }
    expect(sellableGoods().map((good) => good.id)).toEqual(['berries', 'furniture', 'cake']);
  });

  it('bewertet Endprodukte höher als Beeren, und die Beeren-Reserve reicht für eine Runde der Bäckerei', () => {
    const berries = goodDef('berries');
    for (const id of ['furniture', 'cake']) {
      expect(goodDef(id)?.price ?? 0, id).toBeGreaterThan(berries?.price ?? 0);
    }
    const bakery = BUILDING_TYPES.find((type) => type.id === 'bakery');
    expect(berries?.keep ?? 0).toBeGreaterThanOrEqual(bakery?.production?.inputs?.['berries'] ?? 0);
  });

  it('hat die Stellschraube keepForFood für Kuchen, in M3 mit 0', () => {
    expect(goodDef('cake')?.keepForFood).toBe(0);
    for (const good of GOODS) {
      expect(good.keepForFood === undefined || (isWhole(good.keepForFood) && good.keepForFood >= 0), good.id).toBe(true);
    }
  });

  it('verweist für Namen (Einzahl und Mehrzahl) auf vorhandene Texte', () => {
    for (const id of ITEM_IDS) {
      const names = itemNames(id);
      expect(names, id).toBeDefined();
      expect(Object.keys(texts), id).toContain(names?.one);
      expect(Object.keys(texts), id).toContain(names?.many);
    }
  });

  it('hat ein Startlager aus bekannten Dingen mit ganzen, nicht negativen Mengen und Taler zum Loslegen', () => {
    for (const [id, amount] of Object.entries(START_INVENTORY)) {
      expect(isItem(id), id).toBe(true);
      expect(isWhole(amount) && amount >= 0, id).toBe(true);
      expect(amount).toBeLessThanOrEqual(MAX_AMOUNT);
    }
    expect(START_INVENTORY[COINS]).toBeGreaterThan(0);
    expect(isWhole(MAX_AMOUNT) && MAX_AMOUNT >= 999).toBe(true);
  });
});

describe('buildings.json: Kosten und Produktion', () => {
  const amountsOk = (amounts: Readonly<Record<string, number>> | undefined): boolean =>
    Object.entries(amounts ?? {}).every(([id, amount]) => isItem(id) && isWhole(amount) && amount > 0);

  it('hat bei jedem Typ ganzzahlige Kosten aus bekannten Dingen; Wege sind kostenlos, alles andere kostet etwas', () => {
    for (const type of BUILDING_TYPES) {
      expect(amountsOk(type.cost), type.id).toBe(true);
      if (type.category === 'path') {
        expect(Object.keys(type.cost), 'Wege kosten nichts, damit man nie festsitzt').toEqual([]);
      } else {
        expect(Object.keys(type.cost).length, type.id).toBeGreaterThan(0);
      }
    }
  });

  it('beschreibt jedes Produktionsgebäude mit Takt, Zutaten und Erzeugnissen aus bekannten Waren', () => {
    const production = typesOf('production');
    expect(production.map((type) => type.id)).toEqual(['lumberjack', 'berry-garden', 'quarry', 'carpenter', 'bakery', 'market']);
    for (const type of production) {
      const def = type.production;
      expect(def, type.id).toBeDefined();
      expect(isWhole(def?.intervalTicks) && (def?.intervalTicks ?? 0) >= 1, type.id).toBe(true);
      expect(amountsOk(def?.inputs), `${type.id} Zutaten`).toBe(true);
      expect(amountsOk(def?.outputs), `${type.id} Erzeugnisse`).toBe(true);
      expect(type.needsPath, `${type.id} braucht einen Weg`).toBe(true);
      expect(type.footprint.w, type.id).toBeGreaterThanOrEqual(2);
      expect(type.footprint.w, type.id).toBeLessThanOrEqual(3);
      if (def?.needsNearby) {
        expect(TERRAINS, type.id).toContain(def.needsNearby.terrain);
        expect(isWhole(def.needsNearby.radius) && def.needsNearby.radius >= 1, type.id).toBe(true);
      }
      // Entweder erzeugt es Waren oder es verkauft.
      expect(Object.keys(def?.outputs ?? {}).length > 0 || def?.sell !== undefined, type.id).toBe(true);
    }
    expect(typesOf('house').every((type) => type.production === undefined)).toBe(true);
  });

  it('erzeugt genau das aus dem Plan: Holz, Beeren, Stein; Möbel aus Holz; Kuchen aus Beeren; Markt verkauft', () => {
    const by = Object.fromEntries(typesOf('production').map((type) => [type.id, type.production]));
    expect(by['lumberjack']).toMatchObject({ outputs: { wood: 1 }, needsNearby: { terrain: 'forest' } });
    expect(by['berry-garden']).toMatchObject({ outputs: { berries: 1 } });
    expect(by['quarry']).toMatchObject({ outputs: { stone: 1 }, needsNearby: { terrain: 'rock' } });
    expect(Object.keys(by['carpenter']?.inputs ?? {})).toEqual(['wood']);
    expect(Object.keys(by['carpenter']?.outputs ?? {})).toEqual(['furniture']);
    expect(Object.keys(by['bakery']?.inputs ?? {})).toEqual(['berries']);
    expect(Object.keys(by['bakery']?.outputs ?? {})).toEqual(['cake']);
    expect(by['market']?.sell?.perCycle).toBeGreaterThanOrEqual(1);
  });

  it('hat höchstens zweistufige Ketten und nichts, was man nirgends herstellen kann', () => {
    const production = typesOf('production');
    const madeBy = (good: string) => production.filter((type) => (type.production?.outputs?.[good] ?? 0) > 0);
    for (const type of production) {
      for (const input of Object.keys(type.production?.inputs ?? {})) {
        const makers = madeBy(input);
        expect(makers.length, `${type.id} braucht ${input}, das niemand herstellt`).toBeGreaterThan(0);
        // Stufe 1 (Holz, Beeren) braucht selbst keine Zutaten: Ketten sind Rohstoff → Endprodukt.
        for (const maker of makers) {
          expect(Object.keys(maker.production?.inputs ?? {}), `${maker.id} ist die erste Stufe`).toEqual([]);
        }
      }
    }
    // Jedes Material, das gebaut werden braucht, und jedes Endprodukt wird hergestellt.
    const needed = new Set(BUILDING_TYPES.flatMap((type) => Object.keys(type.cost)).filter((id) => id !== COINS));
    for (const id of needed) {
      expect(madeBy(id).length, `${id} wird irgendwo hergestellt`).toBeGreaterThan(0);
    }
    for (const good of sellableGoods()) {
      expect(madeBy(good.id).length, good.id).toBeGreaterThan(0);
    }
    // Berries: made by the garden, sold by the market.
  });

  it('lässt den Markt nie Baumaterial verkaufen (Holz und Stein bleiben zum Bauen)', () => {
    expect(sellableGoods().some((good) => good.category === 'material')).toBe(false);
  });

  it('lässt den Holzfäller nur Taler kosten, damit man mit Beeren → Taler immer wieder an Holz kommt', () => {
    const lumberjack = BUILDING_TYPES.find((type) => type.id === 'lumberjack');
    expect(Object.keys(lumberjack?.cost ?? {})).toEqual(['coins']);
  });

  it('hat ein Startlager, das für die Bäckerei reicht, und kostet kein Gebäude mehr als eine Handvoll Minuten Arbeit', () => {
    const bakery = BUILDING_TYPES.find((type) => type.id === 'bakery');
    for (const [id, amount] of Object.entries(bakery?.cost ?? {})) {
      expect(START_INVENTORY[id] ?? 0, id).toBeGreaterThanOrEqual(amount);
    }
  });
});
