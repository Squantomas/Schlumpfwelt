import { buildingType } from '../data/buildings';
import { sellableGoods } from '../data/goods';
import type { TextKey, TextParams } from '../data/texts';
import { findBuilding, type PlacementView } from '../sim/buildings';
import { amountOf, missingAmounts, productionOf, type ProducerStatus } from '../sim/economy';
import type { DeepReadonly } from '../sim/readonly';
import type { SimState } from '../sim/state';
import { listText } from './costText';

/**
 * What the info card of a production building says: the pictures "needs →
 * makes", one short sentence about what it is doing, and how far the running
 * round is. Pure; the card (Phaser) only draws it.
 */

/**
 * A picture on the card: a good or coins (`item`, id from `goods.json`) or
 * the thing a building needs nearby (`tree`, `rock`). `amount` is shown when it
 * is more than 1.
 */
export interface InfoItem {
  readonly kind: 'item' | 'nearby';
  readonly id: string;
  readonly amount?: number;
}

export interface ProductionInfo {
  readonly needs: readonly InfoItem[];
  readonly makes: readonly InfoItem[];
}

/** Picture ids for what is needed nearby, by terrain. */
const NEARBY_ICON: Readonly<Record<string, string>> = { forest: 'tree', rock: 'rock' };

/** The pictures of a production type, or `undefined` for other types. */
export function productionInfo(typeId: string): ProductionInfo | undefined {
  const rules = productionOf(typeId);
  if (!rules) {
    return undefined;
  }
  const needs: InfoItem[] = [];
  if (rules.needsNearby) {
    needs.push({ kind: 'nearby', id: NEARBY_ICON[rules.needsNearby.terrain] ?? rules.needsNearby.terrain });
  }
  for (const [id, amount] of Object.entries(rules.inputs)) {
    needs.push({ kind: 'item', id, amount });
  }
  const makes: InfoItem[] = [];
  for (const [id, amount] of Object.entries(rules.outputs)) {
    makes.push({ kind: 'item', id, amount });
  }
  if (rules.sell) {
    // The market takes the products and makes coins.
    for (const good of sellableGoods()) {
      needs.push({ kind: 'item', id: good.id });
    }
    makes.push({ kind: 'item', id: 'coins' });
  }
  return { needs, makes };
}

export interface CardStatus {
  readonly status: ProducerStatus;
  readonly text: TextKey;
  readonly params?: TextParams;
  /** How far the running round is, 0 to 1. */
  readonly progress: number;
}

type CardState = PlacementView & DeepReadonly<Pick<SimState, 'production'>>;

/** The state of a production building for its card, or `undefined` if there is no such building. */
export function cardStatus(state: CardState, buildingId: number): CardStatus | undefined {
  const building = findBuilding(state, buildingId);
  const producer = state.production.find((p) => p.buildingId === buildingId);
  const type = building ? buildingType(building.type) : undefined;
  const rules = building ? productionOf(building.type) : undefined;
  if (!building || !type || !producer || !rules) {
    return undefined;
  }
  const progress = Math.min(1, producer.progress / rules.intervalTicks);
  switch (producer.status) {
    case 'working':
      return { status: 'working', text: 'status.working', progress };
    case 'noPath':
      return { status: 'noPath', text: 'status.noPath', progress };
    case 'noNearby':
      return { status: 'noNearby', text: rules.needsNearby?.terrain === 'rock' ? 'status.noRock' : 'status.noForest', progress };
    case 'waitingInput':
      return { status: 'waitingInput', text: 'status.waitingInput', params: { list: listText(missingAmounts(state.inventory, rules.inputs)) }, progress };
    case 'idle':
      return { status: 'idle', text: 'status.idle', progress };
  }
}

/** The good a building waits for (the first missing input), for the sign above it; `undefined` if nothing is missing. */
export function missingInputOf(state: CardState, buildingId: number): string | undefined {
  const building = findBuilding(state, buildingId);
  const rules = building ? productionOf(building.type) : undefined;
  if (!rules) {
    return undefined;
  }
  return Object.entries(rules.inputs).find(([id, amount]) => amountOf(state.inventory, id) < amount)?.[0];
}
