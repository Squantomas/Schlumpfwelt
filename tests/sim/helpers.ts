import { LOCKED_TYPE_IDS } from '../../src/data/buildings';
import { applyCommand, type Command } from '../../src/sim/commands';
import { ITEM_IDS } from '../../src/data/goods';
import { tickProduction } from '../../src/sim/production';
import { createInitialState, type SimState } from '../../src/sim/state';
import type { Terrain } from '../../src/sim/world';

/** A store with plenty of everything, so tests about placing are not stopped by the cost. */
export function richInventory(): Record<string, number> {
  return { coins: 5000, wood: 500, stone: 500, berries: 500, furniture: 0, cake: 0 };
}

/** A 16×16 map of pure grass without any buildings or paths, with a rich store and everything unlocked. */
export function grassState(size = 16): SimState {
  const base = createInitialState(1);
  const tiles = new Array<Terrain>(size * size).fill('grass');
  return {
    ...base,
    world: { width: size, height: size, tiles },
    buildings: [],
    nextBuildingId: 1,
    paths: [],
    inventory: richInventory(),
    production: [],
    earnedCoins: 0,
    unlocked: [...LOCKED_TYPE_IDS],
    planted: [],
    revision: 0,
  };
}

export function setTerrainAt(state: SimState, x: number, y: number, terrain: Terrain): void {
  state.world.tiles[y * state.world.width + x] = terrain;
}

export function run(state: SimState, ...commands: Command[]): SimState {
  for (const command of commands) {
    applyCommand(state, command);
  }
  return state;
}

export function pathAt(state: SimState, x: number, y: number): boolean {
  return state.paths.includes(y * state.world.width + x);
}

/** Sets the store: everything 0 except what is given. */
export function setStore(state: SimState, amounts: Readonly<Record<string, number>> = {}): void {
  for (const id of ITEM_IDS) {
    state.inventory[id] = amounts[id] ?? 0;
  }
}

/** Lets the production buildings work for `count` ticks (no commands in between). */
export function tickN(state: SimState, count: number): void {
  for (let i = 0; i < count; i += 1) {
    state.tick += 1;
    tickProduction(state);
  }
}

/** Marks a rectangle of tiles with a terrain (for forest and rock near a building). */
export function fillTerrain(state: SimState, x: number, y: number, w: number, h: number, terrain: Terrain): void {
  for (let dy = 0; dy < h; dy += 1) {
    for (let dx = 0; dx < w; dx += 1) {
      setTerrainAt(state, x + dx, y + dy, terrain);
    }
  }
}

/**
 * Places a building that is connected to a path right under it (a short path
 * piece along its bottom edge) and returns its id.
 */
export function buildConnected(state: SimState, typeId: string, x: number, y: number, h = 2, w = 2): number {
  run(state, { type: 'placeBuilding', buildingType: typeId, x, y });
  const id = state.buildings.find((b) => b.type === typeId && b.x === x && b.y === y)?.id;
  if (id === undefined) {
    throw new Error(`${typeId} could not be placed at ${String(x)},${String(y)}`);
  }
  run(state, { type: 'placePaths', tiles: Array.from({ length: w }, (_, i) => ({ x: x + i, y: y + h })) });
  return id;
}

export function producerOf(state: SimState, buildingId: number): SimState['production'][number] {
  const producer = state.production.find((p) => p.buildingId === buildingId);
  if (!producer) {
    throw new Error(`no producer for building ${String(buildingId)}`);
  }
  return producer;
}
