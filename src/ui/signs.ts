import { buildingType } from '../data/buildings';
import { isConnected, type PlacementView } from '../sim/buildings';
import { productionOf } from '../sim/economy';
import type { DeepReadonly } from '../sim/readonly';
import type { SimState } from '../sim/state';
import { missingInputOf } from './productionInfo';

/**
 * Which sign floats over which building. Exactly one sign per building, by
 * priority: no path > no trees / rocks nearby > a missing material. A building
 * that works (or an idle market) has none.
 *
 * The kind says what the sign shows: `path`, `tree`, `rock` or `good-<id>`.
 */
export type SignKind = string;

export type SignView = PlacementView & DeepReadonly<Pick<SimState, 'production'>>;

/** The sign of one building, or `undefined` if it needs none. */
export function signFor(state: SignView, buildingId: number): SignKind | undefined {
  const building = state.buildings.find((b) => b.id === buildingId);
  const type = building ? buildingType(building.type) : undefined;
  if (!building || !type) {
    return undefined;
  }
  if (type.needsPath && !isConnected(state, building.id)) {
    return 'path';
  }
  const producer = state.production.find((p) => p.buildingId === building.id);
  if (!producer) {
    return undefined;
  }
  if (producer.status === 'noNearby') {
    return productionOf(building.type)?.needsNearby?.terrain === 'rock' ? 'rock' : 'tree';
  }
  if (producer.status === 'waitingInput') {
    const missing = missingInputOf(state, building.id);
    return missing === undefined ? undefined : `good-${missing}`;
  }
  return undefined;
}

/** The signs of all buildings that need one (building id → kind). */
export function signsFor(state: SignView): Map<number, SignKind> {
  const signs = new Map<number, SignKind>();
  for (const building of state.buildings) {
    const kind = signFor(state, building.id);
    if (kind !== undefined) {
      signs.set(building.id, kind);
    }
  }
  return signs;
}
