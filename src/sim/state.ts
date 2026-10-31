/**
 * Complete simulation state. Plain data only (no classes, no functions), so it
 * can later be saved and loaded as JSON.
 *
 * Only the simulation itself mutates the state. Scenes and UI get a read-only
 * view via `Simulation.state` and change things exclusively by sending
 * commands (see `commands.ts`).
 */
import { addBuilding, addPaths, lineTiles, type PlacedBuilding } from './buildings';
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
  /** Houses and decoration (no paths). */
  buildings: PlacedBuilding[];
  /** Id for the next building; ids are never reused. */
  nextBuildingId: number;
  /** Tiles with a path as tile indices (`y * width + x`), ascending and without duplicates. */
  paths: number[];
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
    revision: 0,
  };
  buildStartVillage(state);
  return state;
}

/**
 * A small start: one house with a path and a few flowers in the middle of the
 * island (the generator keeps it clear and grassy), so a child sees at once
 * what the game is about. Everything can be moved or demolished for free.
 */
function buildStartVillage(state: SimState): void {
  const cx = Math.floor(state.world.width / 2);
  const cy = Math.floor(state.world.height / 2);
  addBuilding(state, 'house-red', cx - 3, cy - 3);
  // Along the front of the house, then down to the south east.
  addPaths(state, lineTiles({ x: cx - 3, y: cy - 1 }, { x: cx + 2, y: cy + 2 }));
  addBuilding(state, 'flower', cx - 4, cy - 1);
  addBuilding(state, 'bush', cx - 1, cy - 3);
  addBuilding(state, 'flower', cx + 3, cy + 2);
  // The start village is part of the initial state, not a change made by someone.
  state.revision = 0;
}
