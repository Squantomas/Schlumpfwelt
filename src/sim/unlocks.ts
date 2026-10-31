/**
 * Unlocking: what the shop sells depends on how far the village has come.
 *
 * Rules (M4):
 * - A type without `unlock` in `buildings.json` is free from the start.
 * - Otherwise the village has to reach a simple count (see `UnlockDef`): enough
 *   buildings of one type, enough houses, or enough coins earned by the market.
 *   No second currency and no extra payment – building and earning is all.
 * - Once reached, a type stays unlocked for good (`state.unlocked`), also after
 *   the buildings that unlocked it are demolished.
 * - `checkUnlocks` runs after every tick and every batch of commands; it is
 *   deterministic and only reads the state.
 *
 * Nothing that is needed to get on is behind an unlock: lumberjack, berry
 * garden and market are free, so nobody can get stuck.
 */
import { BUILDING_TYPES, buildingType, unlockOf, type UnlockDef } from '../data/buildings';
import type { DeepReadonly } from './readonly';
import type { SimState } from './state';

/** What the unlock rules read. */
export type UnlockView = DeepReadonly<Pick<SimState, 'buildings' | 'earnedCoins' | 'unlocked'>>;

/** How far the village is on the way to an unlock: `current` of `needed` (current never exceeds needed). */
export interface UnlockProgress {
  readonly current: number;
  readonly needed: number;
}

/** The progress towards a condition. */
export function progressOf(state: Pick<UnlockView, 'buildings' | 'earnedCoins'>, unlock: UnlockDef): UnlockProgress {
  switch (unlock.kind) {
    case 'count':
      return capped(state.buildings.filter((b) => b.type === unlock.building).length, unlock.count);
    case 'houses':
      return capped(state.buildings.filter((b) => buildingType(b.type)?.category === 'house').length, unlock.count);
    case 'earned':
      return capped(state.earnedCoins, unlock.coins);
  }
}

function capped(current: number, needed: number): UnlockProgress {
  return { current: Math.min(current, needed), needed };
}

/** Is this type free to build? True for types without a condition, and for types whose condition was reached once. */
export function isUnlocked(state: Pick<UnlockView, 'unlocked'>, typeId: string): boolean {
  return unlockOf(typeId) === undefined || state.unlocked.includes(typeId);
}

/** The condition of a type that is still locked and how far the village is; `undefined` if the type is free. */
export function lockOf(state: UnlockView, typeId: string): { readonly unlock: UnlockDef; readonly progress: UnlockProgress } | undefined {
  const unlock = unlockOf(typeId);
  if (!unlock || state.unlocked.includes(typeId)) {
    return undefined;
  }
  return { unlock, progress: progressOf(state, unlock) };
}

/** Unlocks every type whose condition is reached now. Returns the ids that were newly unlocked (in the order of the file). */
export function checkUnlocks(state: SimState): string[] {
  const added: string[] = [];
  for (const type of BUILDING_TYPES) {
    const unlock = unlockOf(type.id);
    if (!unlock || state.unlocked.includes(type.id)) {
      continue;
    }
    const progress = progressOf(state, unlock);
    if (progress.current >= progress.needed) {
      state.unlocked.push(type.id);
      added.push(type.id);
    }
  }
  return added;
}

/**
 * Brings a list of unlocked ids into the form the state needs (known types
 * with a condition only, no duplicates, order kept). For loading saved games (M5).
 */
export function normalizeUnlocked(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: string[] = [];
  for (const id of raw as unknown[]) {
    if (typeof id === 'string' && unlockOf(id) !== undefined && !result.includes(id)) {
      result.push(id);
    }
  }
  return result;
}
