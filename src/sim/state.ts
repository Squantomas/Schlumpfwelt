/**
 * Complete simulation state. Plain data only (no classes, no functions), so it
 * can later be saved and loaded as JSON.
 *
 * Only the simulation itself mutates the state. Scenes and UI get a read-only
 * view via `Simulation.state` and change things exclusively by sending
 * commands (see `commands.ts`).
 */
import { addBuilding, addPaths, lineTiles, type PlacedBuilding } from './buildings';
import { createStartInventory, type Inventory, type ProducerState } from './economy';
import { generateIsland } from './islandGen';
import { refreshStatuses } from './production';
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
  /** Houses, decoration and production buildings (no paths). */
  buildings: PlacedBuilding[];
  /** Id for the next building; ids are never reused. */
  nextBuildingId: number;
  /** Tiles with a path as tile indices (`y * width + x`), ascending and without duplicates. */
  paths: number[];
  /** The store: coins and goods by id, whole numbers (see `economy.ts`). */
  inventory: Inventory;
  /** The working state of every production building, in the order they were built. */
  production: ProducerState[];
  /**
   * Counts every change of buildings or paths. Scenes compare it with the
   * value they last drew and only redraw when it differs.
   */
  revision: number;
}

/** Seed used when nobody picks one (tests, first start); the game itself passes a random seed. */
export const DEFAULT_SEED = 1;

export function createInitialState(seed: number = DEFAULT_SEED): SimState {
  const normalized = normalizeSeed(seed);
  const world = generateIsland(normalized);
  const state: SimState = {
    seed: normalized,
    world,
    tick: 0,
    paused: false,
    buildings: [],
    nextBuildingId: 1,
    paths: [],
    inventory: createStartInventory(),
    production: [],
    revision: 0,
  };
  buildStartVillage(state);
  return state;
}

/**
 * A small start in the middle of the island (the generator keeps it clear and
 * grassy): a house, a berry garden and a market, all along one path, plus a
 * few flowers – so a child sees at once what the game is about, and the
 * berries only need a bakery to turn into coins. Everything can be moved or
 * demolished for free (demolishing gives the cost back). The start village
 * is part of the initial state: it costs nothing and does not count as a
 * change (`revision` stays 0).
 */
function buildStartVillage(state: SimState): void {
  const cx = Math.floor(state.world.width / 2);
  const cy = Math.floor(state.world.height / 2);
  addBuilding(state, 'house-red', cx - 3, cy - 3, false);
  // Along the front of the house, then down to the south east.
  addPaths(state, lineTiles({ x: cx - 3, y: cy - 1 }, { x: cx + 2, y: cy + 2 }));
  // Below the path: the berry garden left, the market right of it, both touching the path.
  addBuilding(state, 'berry-garden', cx - 3, cy, false);
  addBuilding(state, 'market', cx - 1, cy, false);
  addBuilding(state, 'flower', cx - 4, cy - 1, false);
  addBuilding(state, 'bush', cx - 1, cy - 3, false);
  addBuilding(state, 'flower', cx + 3, cy + 2, false);
  refreshStatuses(state);
  state.revision = 0;
}
