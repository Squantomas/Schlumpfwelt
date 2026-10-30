/**
 * Complete simulation state. Plain data only (no classes, no functions), so it
 * can later be saved and loaded as JSON.
 *
 * Only the simulation itself mutates the state. Scenes and UI get a read-only
 * view via `Simulation.state` and change things exclusively by sending
 * commands (see `commands.ts`).
 */
import { generateIsland } from './islandGen';
import { normalizeSeed } from './random';
import type { World } from './world';

export interface SimState {
  /** Seed the island was generated from (32-bit unsigned integer). */
  seed: number;
  /** The map with the terrain of every tile. */
  world: World;
  /** Number of simulated ticks since the start (does not advance while paused). */
  tick: number;
  /** While paused, time stands still: commands are applied, nothing else happens. */
  paused: boolean;
}

/** Seed used when nobody picks one (tests, first start); the game itself passes a random seed. */
export const DEFAULT_SEED = 1;

export function createInitialState(seed: number = DEFAULT_SEED): SimState {
  const normalized = normalizeSeed(seed);
  return {
    seed: normalized,
    world: generateIsland(normalized),
    tick: 0,
    paused: false,
  };
}
