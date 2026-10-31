import { addBuilding, addPaths, demolishAt, relocateBuilding, type Tile } from './buildings';
import type { SimState } from './state';

/**
 * Commands are the only way for scenes and UI to change the simulation.
 * Each command is a plain object with a `type` discriminator, so it is easy to
 * log, test and – if ever needed – replay.
 *
 * To add a command: extend the union below and handle it in `applyCommand`.
 * The `never` check makes the compiler complain about unhandled commands.
 */
export type Command =
  | SetPausedCommand
  | PlaceBuildingCommand
  | PlacePathsCommand
  | MoveBuildingCommand
  | DemolishCommand;

export interface SetPausedCommand {
  readonly type: 'setPaused';
  readonly paused: boolean;
}

/**
 * Places a house, decoration or production building with its top left tile
 * on (x, y) and takes its cost from the store. Ignored if `canPlace` does not
 * say `ok` (including: too expensive) or the type is unknown.
 */
export interface PlaceBuildingCommand {
  readonly type: 'placeBuilding';
  readonly buildingType: string;
  readonly x: number;
  readonly y: number;
}

/** Lays a path on every listed tile that can take one; the other tiles are skipped. */
export interface PlacePathsCommand {
  readonly type: 'placePaths';
  readonly tiles: readonly Tile[];
}

/** Moves a building so that its top left tile is (x, y); free of charge; ignored if it does not fit there. */
export interface MoveBuildingCommand {
  readonly type: 'moveBuilding';
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

/** Demolishes the building on the tile (x, y) or, if there is none, the path on it. A building gives its whole cost back. */
export interface DemolishCommand {
  readonly type: 'demolish';
  readonly x: number;
  readonly y: number;
}

/**
 * Applies a single command to the state (mutates `state`). Commands with
 * invalid data (unknown type or id, tile outside the map, not allowed there)
 * are ignored – they never throw and never change anything.
 */
export function applyCommand(state: SimState, command: Command): void {
  switch (command.type) {
    case 'setPaused':
      state.paused = command.paused;
      return;
    case 'placeBuilding':
      addBuilding(state, command.buildingType, command.x, command.y);
      return;
    case 'placePaths':
      addPaths(state, command.tiles);
      return;
    case 'moveBuilding':
      relocateBuilding(state, command.id, command.x, command.y);
      return;
    case 'demolish':
      demolishAt(state, command.x, command.y);
      return;
    default:
      return assertNever(command);
  }
}

function assertNever(command: never): never {
  throw new Error(`Unhandled command: ${String((command as { type?: unknown }).type)}`);
}
