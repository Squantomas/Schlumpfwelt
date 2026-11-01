/**
 * The working of the production buildings, once per tick.
 *
 * A building works only while it is connected to a path (`noPath` otherwise)
 * and, if it needs trees or rocks, has some within its radius (`noNearby`).
 * Trees and rocks are **not** used up – forest and rock stay, which is the
 * simplest rule for children. A round works like this:
 *
 * 1. At the start of a round the building takes its inputs from the store
 *    (a carpenter: 2 wood). If they are not there it waits (`waitingInput`)
 *    and takes nothing.
 * 2. It works `intervalTicks` ticks (`working`; the progress stands still
 *    while a path or the trees are missing). Since M7 the mood of the worker
 *    makes a round a bit shorter (happy) or longer (sad), see `roundTicks`.
 * 3. At the end the goods go straight into the store. (Walking inhabitants
 *    that carry them come in M6 and change this.)
 *
 * The market has no inputs: at the end of each round it sells up to
 * `perCycle` units from the store for their price in coins, always the most
 * valuable one that is there (furniture, then cake, then berries: finished
 * products come first, so berries are only sold when there is nothing better
 * and never eat into the bakery's supply), and leaves `keep` units (the
 * bakery's reserve of berries) and `keepForFood` units (food) in the store.
 * With nothing to sell it is `idle`. Every sale also counts into
 * `earnedCoins`, the progress of the unlocks that ask for money.
 *
 * Buildings are processed in the order of `state.production` (the order they
 * were built), so the result is the same every time.
 */
import { buildingType } from '../data/buildings';
import { COINS, MAX_AMOUNT, goodDef, sellableGoods } from '../data/goods';
import { addAmounts, amountOf, hasAmounts, hasNearby, productionOf, takeAmounts, type ProducerState, type ProducerStatus, type ProductionView } from './economy';
import { findBuilding, isConnected, type PlacedBuilding } from './buildings';
import { MOODS, paceOf } from './mood';
import type { SimState } from './state';

/** What the production rules read and change. */
export type ProductionState = Pick<SimState, 'world' | 'buildings' | 'paths' | 'revision' | 'inventory' | 'production' | 'earnedCoins' | 'unlocked' | 'planted' | 'nextBuildingId'>;

/** Units of a good the market may sell now (what is there beyond `keep` and `keepForFood`). */
export function sellableAmount(inventory: Readonly<Record<string, number>>, goodId: string): number {
  const good = goodDef(goodId);
  if (!good || good.price === undefined) {
    return 0;
  }
  return Math.max(0, amountOf(inventory, goodId) - (good.keep ?? 0) - (good.keepForFood ?? 0));
}

/** The good the market sells next (the highest price that can be sold, ties by the order of the file), or `undefined` if nothing can be sold. */
function nextProductToSell(inventory: Readonly<Record<string, number>>): string | undefined {
  let best: string | undefined;
  let bestPrice = 0;
  for (const good of sellableGoods()) {
    const price = good.price ?? 0;
    if (price > bestPrice && sellableAmount(inventory, good.id) > 0) {
      best = good.id;
      bestPrice = price;
    }
  }
  return best;
}

/** What a building does now (without changing anything). */
export function statusOf(state: Readonly<ProductionState>, building: Readonly<PlacedBuilding>, producer: Readonly<ProducerState>): ProducerStatus {
  const type = buildingType(building.type);
  const rules = productionOf(building.type);
  if (!type || !rules) {
    return 'working';
  }
  if (type.needsPath && !isConnected(state, building.id)) {
    return 'noPath';
  }
  if (rules.needsNearby && !hasNearby(state.world, type, building.x, building.y, rules.needsNearby.terrain, rules.needsNearby.radius)) {
    return 'noNearby';
  }
  if (producer.progress === 0) {
    if (!hasAmounts(state.inventory, rules.inputs)) {
      return 'waitingInput';
    }
    if (rules.sell && nextProductToSell(state.inventory) === undefined) {
      return 'idle';
    }
  }
  return 'working';
}

/** Updates the status of every production building without letting time pass (for the start and after commands). */
export function refreshStatuses(state: ProductionState): void {
  for (const producer of state.production) {
    const building = findBuilding(state, producer.buildingId);
    if (building && productionOf(building.type)) {
      producer.status = statusOf(state, building, producer);
    }
  }
}

/**
 * How many ticks a round takes at `pace` percent (M7: the mood of the worker, see `mood.ts`; 100 is the normal
 * `intervalTicks`, a happy worker is a bit faster, a sad one a bit slower – never stopped).
 */
export function roundTicks(intervalTicks: number, pace = 100): number {
  const percent = Number.isFinite(pace) && pace > 0 ? pace : 100;
  return Math.max(1, Math.round((intervalTicks * 100) / percent));
}

/** The longest a round can take (with the slowest mood): a saved progress below it is a round still running. */
export function longestRound(intervalTicks: number): number {
  return Math.max(intervalTicks, ...MOODS.map((mood) => roundTicks(intervalTicks, paceOf(mood))));
}

/**
 * Lets every production building work for one tick. `paces` says how fast each one works (building id → percent,
 * from the mood of its worker, `workPaces`); missing ones work at 100 %. A round that is already as long as a faster
 * pace needs (the worker became happy meanwhile) ends at once.
 */
export function tickProduction(state: ProductionState, paces?: ReadonlyMap<number, number>): void {
  for (const producer of state.production) {
    const building = findBuilding(state, producer.buildingId);
    const rules = building ? productionOf(building.type) : undefined;
    if (!building || !rules) {
      continue;
    }
    producer.status = statusOf(state, building, producer);
    if (producer.status !== 'working') {
      continue;
    }
    if (producer.progress === 0) {
      takeAmounts(state.inventory, rules.inputs);
    }
    producer.progress += 1;
    if (producer.progress >= roundTicks(rules.intervalTicks, paces?.get(producer.buildingId))) {
      producer.progress = 0;
      finishRound(state, producer, rules);
    }
  }
}

function finishRound(state: ProductionState, producer: ProducerState, rules: ProductionView): void {
  if (rules.sell) {
    let earned = 0;
    for (let i = 0; i < rules.sell.perCycle; i += 1) {
      const id = nextProductToSell(state.inventory);
      const price = id === undefined ? undefined : goodDef(id)?.price;
      if (id === undefined || price === undefined) {
        break;
      }
      state.inventory[id] = amountOf(state.inventory, id) - 1;
      earned += price;
    }
    if (earned > 0) {
      addAmounts(state.inventory, { [COINS]: earned });
      state.earnedCoins = Math.min(MAX_AMOUNT, state.earnedCoins + earned);
      producer.lastSale = earned;
      producer.delivered += 1;
    }
    return;
  }
  addAmounts(state.inventory, rules.outputs);
  producer.delivered += 1;
}
