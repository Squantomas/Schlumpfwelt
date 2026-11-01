import { buildingType } from '../data/buildings';
import { sellableGoods } from '../data/goods';
import type { TextKey, TextParams } from '../data/texts';
import { findBuilding, type PlacementView } from '../sim/buildings';
import { amountOf, missingAmounts, productionOf, type ProducerStatus } from '../sim/economy';
import { paceOf, workerMood, type Mood } from '../sim/mood';
import { roundTicks } from '../sim/production';
import type { DeepReadonly } from '../sim/readonly';
import type { SimState } from '../sim/state';
import { listText } from './costText';

/**
 * What the info card of a production building says: the pictures "needs →
 * makes", one short sentence about what it is doing, and how far the running
 * round is. Since M7 the sentence of a working building says when its worker
 * is happy (a bit faster) or sad (a bit slower). Pure; the card (Phaser) only
 * draws it.
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
  /** How far the running round is, 0 to 1 (of the round as long as it is at the pace of the worker). */
  readonly progress: number;
  /** How fast it works (percent, from the mood of the worker, M7) and that mood (none without a worker). */
  readonly pace: number;
  readonly mood?: Mood;
}

type CardState = PlacementView & DeepReadonly<Pick<SimState, 'production' | 'residents'>>;

/** The sentence of a working building: with a happy worker it goes faster, with a sad one a bit slower (M7). */
function workingText(mood: Mood | undefined): TextKey {
  return mood === 'happy' ? 'status.workingHappy' : mood === 'sad' ? 'status.workingSad' : 'status.working';
}

/** The state of a production building for its card, or `undefined` if there is no such building. */
export function cardStatus(state: CardState, buildingId: number): CardStatus | undefined {
  const building = findBuilding(state, buildingId);
  const producer = state.production.find((p) => p.buildingId === buildingId);
  const type = building ? buildingType(building.type) : undefined;
  const rules = building ? productionOf(building.type) : undefined;
  if (!building || !type || !producer || !rules) {
    return undefined;
  }
  const mood = workerMood(state, buildingId);
  const pace = mood === undefined ? 100 : paceOf(mood);
  const progress = Math.min(1, producer.progress / roundTicks(rules.intervalTicks, pace));
  const about = { progress, pace, ...(mood === undefined ? {} : { mood }) };
  switch (producer.status) {
    case 'working':
      return { status: 'working', text: workingText(mood), ...about };
    case 'noPath':
      return { status: 'noPath', text: 'status.noPath', ...about };
    case 'noNearby':
      return { status: 'noNearby', text: rules.needsNearby?.terrain === 'rock' ? 'status.noRock' : 'status.noForest', ...about };
    case 'waitingInput':
      return { status: 'waitingInput', text: 'status.waitingInput', params: { list: listText(missingAmounts(state.inventory, rules.inputs)) }, ...about };
    case 'idle':
      return { status: 'idle', text: 'status.idle', ...about };
  }
}

/** The good a building waits for (the first missing input), for the sign above it; `undefined` if nothing is missing. */
export function missingInputOf(state: PlacementView & DeepReadonly<Pick<SimState, 'production'>>, buildingId: number): string | undefined {
  const building = findBuilding(state, buildingId);
  const rules = building ? productionOf(building.type) : undefined;
  if (!rules) {
    return undefined;
  }
  return Object.entries(rules.inputs).find(([id, amount]) => amountOf(state.inventory, id) < amount)?.[0];
}
