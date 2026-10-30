import { applyCommand, type Command } from '../../src/sim/commands';
import { createInitialState, type SimState } from '../../src/sim/state';
import type { Terrain } from '../../src/sim/world';

/** A 16×16 map of pure grass without any buildings or paths. */
export function grassState(size = 16): SimState {
  const base = createInitialState(1);
  const tiles = new Array<Terrain>(size * size).fill('grass');
  return {
    ...base,
    world: { width: size, height: size, tiles },
    buildings: [],
    nextBuildingId: 1,
    paths: new Array<boolean>(size * size).fill(false),
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
  return state.paths[y * state.world.width + x] === true;
}
