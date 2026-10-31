import goodsJson from './goods.json';
import type { TextKey } from './texts';

/**
 * Goods and money from `goods.json`.
 *
 * - `material` (wood, stone): used up when building.
 * - `raw` (berries): input of a processing building.
 * - `product` (furniture, cake): the market buys these for coins (`price`).
 *   `keepForFood` is the number of units the market leaves in the store for
 *   food (from M7 on; 0 in M3, so everything is sold).
 *
 * Coins ("Taler") are not a good but their own amount; in the inventory they
 * are stored under {@link COINS} like the goods.
 */

export type GoodCategory = 'material' | 'raw' | 'product';

export interface GoodDef {
  readonly id: string;
  readonly category: GoodCategory;
  /** Text key of the name for one unit ("Stein"). */
  readonly nameKey: TextKey;
  /** Text key of the name for several units ("Steine"). */
  readonly pluralKey: TextKey;
  /** What the market pays for one unit (products only). */
  readonly price?: number;
  /** Units the market keeps back for food. */
  readonly keepForFood?: number;
}

/** Id of the money in inventories and cost lists. */
export const COINS = 'coins';

export const COIN_ITEM = goodsJson.coins as { readonly id: string; readonly nameKey: TextKey; readonly pluralKey: TextKey };

export const GOODS: readonly GoodDef[] = goodsJson.goods as readonly GoodDef[];

/** All things that can be in the inventory, in display order: coins first, then the goods. */
export const ITEM_IDS: readonly string[] = [COINS, ...GOODS.map((good) => good.id)];

/** What the player starts with. */
export const START_INVENTORY: Readonly<Record<string, number>> = goodsJson.startInventory;

/** The most of one item the store holds (generous – nobody gets near it; extra units are not counted). */
export const MAX_AMOUNT: number = goodsJson.storage.max;

const byId = new Map<string, GoodDef>(GOODS.map((good) => [good.id, good]));

export function goodDef(id: string): GoodDef | undefined {
  return byId.get(id);
}

/** Is this the id of coins or of a known good? */
export function isItem(id: string): boolean {
  return id === COINS || byId.has(id);
}

/** Text keys of the name of an item (coins or good), or `undefined` for unknown ids. */
export function itemNames(id: string): { readonly one: TextKey; readonly many: TextKey } | undefined {
  if (id === COINS) {
    return { one: COIN_ITEM.nameKey, many: COIN_ITEM.pluralKey };
  }
  const good = byId.get(id);
  return good ? { one: good.nameKey, many: good.pluralKey } : undefined;
}

/** The products the market buys, in the order of the file. */
export function sellableGoods(): readonly GoodDef[] {
  return GOODS.filter((good) => good.price !== undefined);
}
