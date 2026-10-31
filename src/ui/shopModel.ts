import { buildingType, shopItems, type ShopCategory, type UnlockDef } from '../data/buildings';
import { VALUABLE_PRICE, goodDef } from '../data/goods';
import { t, type TextKey, type TextParams } from '../data/texts';
import { costOf, missingFor, productionOf } from '../sim/economy';
import type { DeepReadonly } from '../sim/readonly';
import type { SimState } from '../sim/state';
import { itemName } from './costText';
import { lockOf, type UnlockProgress } from '../sim/unlocks';

/**
 * What the shop shows, without Phaser: one card per item of a tab with its
 * state – can be bought, too expensive (greyed but choosable, as in M3), or
 * locked (a lock and what the village still has to do). Pure and tested; the
 * shop (Phaser) only draws it.
 */

/** What the shop reads. */
export type ShopView = DeepReadonly<Pick<SimState, 'buildings' | 'earnedCoins' | 'unlocked' | 'inventory'>>;

export type CardState = 'ok' | 'dear' | 'locked';

export interface ShopCard {
  readonly typeId: string;
  readonly state: CardState;
  /** What it costs. */
  readonly cost: Readonly<Record<string, number>>;
  /** What is missing for it (empty when it can be paid). */
  readonly missing: Readonly<Record<string, number>>;
  /** For a locked card: the condition and how far the village is. */
  readonly lock?: { readonly unlock: UnlockDef; readonly progress: UnlockProgress };
}

/** The card of one item. */
export function shopCard(state: ShopView, typeId: string): ShopCard {
  const cost = costOf(typeId);
  const missing = missingFor(state, typeId);
  const lock = lockOf(state, typeId);
  if (lock) {
    return { typeId, state: 'locked', cost, missing, lock };
  }
  return { typeId, state: Object.keys(missing).length > 0 ? 'dear' : 'ok', cost, missing };
}

/** The cards of a shop tab, in the order of the file. */
export function shopCards(state: ShopView, category: ShopCategory): ShopCard[] {
  return shopItems(category).map((type) => shopCard(state, type.id));
}

/**
 * The pictures that stand for a condition on the card, in a row before the number: the building to build, a house,
 * or – for money – the market and a coin ("earn it at the market", so "0/40" is not taken for "you own 0").
 */
export function unlockIcons(unlock: UnlockDef): readonly { readonly kind: 'building' | 'coins'; readonly id: string }[] {
  switch (unlock.kind) {
    case 'count':
      return [{ kind: 'building', id: unlock.building }];
    case 'houses':
      return [{ kind: 'building', id: 'house-red' }];
    case 'earned':
      return [
        { kind: 'building', id: 'market' },
        { kind: 'coins', id: 'coins' },
      ];
  }
}

/** The numbers on a locked card: "0/1", "1/2", "40/100". */
export function progressText(progress: UnlockProgress): string {
  return t('shop.progress', { current: progress.current, needed: progress.needed });
}

/** The short sentence for a locked item: "Baue 1× Holzfällerhütte, dann ist das frei." */
export function unlockSentence(unlock: UnlockDef): { readonly key: TextKey; readonly params?: TextParams } {
  switch (unlock.kind) {
    case 'count':
      return { key: 'unlock.count', params: { count: unlock.count, name: t(buildingType(unlock.building)?.nameKey ?? 'build.path') } };
    case 'houses':
      return unlock.count === 1 ? { key: 'unlock.houseOne' } : { key: 'unlock.houses', params: { count: unlock.count } };
    case 'earned':
      return { key: 'unlock.earned', params: { count: unlock.coins } };
  }
}

export function unlockSentenceText(unlock: UnlockDef): string {
  const { key, params } = unlockSentence(unlock);
  return t(key, params);
}

/** Names as a list: "Bank", "Bank und Laterne", "Bank, Laterne und Teich". */
export function nameList(typeIds: readonly string[]): string {
  const names = typeIds.map((id) => t(buildingType(id)?.nameKey ?? 'build.path'));
  const last = names.pop();
  if (last === undefined) {
    return '';
  }
  return names.length === 0 ? last : `${names.join(', ')} ${t('shop.and')} ${last}`;
}

/** At most this many names are named in the "new in the shop" message (it must fit the hint bar of a small phone). */
const MAX_NAMED = 3;

/** The good that one of the new buildings makes and that brings many coins (furniture), if any. */
export function valuableGoodOf(typeIds: readonly string[]): string | undefined {
  for (const id of typeIds) {
    for (const good of Object.keys(productionOf(id)?.outputs ?? {})) {
      if ((goodDef(good)?.price ?? 0) >= VALUABLE_PRICE) {
        return good;
      }
    }
  }
  return undefined;
}

/**
 * The text of the message when things were unlocked, e.g. "Neu im Shop: Bank und Laterne!". Names at most three.
 * If a new building makes something that brings many coins, a second sentence says so ("Möbel bringen viele Taler.").
 */
export function newItemsText(typeIds: readonly string[]): string {
  const base = t('shop.newItem', { list: nameList(typeIds.slice(0, MAX_NAMED)) });
  const good = valuableGoodOf(typeIds);
  return good === undefined ? base : t('shop.newValuableJoin', { news: base, valuable: t('shop.newValuable', { good: itemName(good) }) });
}
