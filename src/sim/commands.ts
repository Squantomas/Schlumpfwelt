import { buildingType } from '../data/buildings';
import { addBuilding, addPaths, demolishAt, relocateBuilding, type Tile } from './buildings';
import { demolishPlanted, placeIslandItem } from './island';
import { inviteResident, settleResidents } from './residents';
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
  | DemolishCommand
  | PlantTreeCommand
  | PlaceRockCommand
  | FillLandCommand
  | MakeMeadowCommand
  | InviteResidentCommand;

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
 * The island commands (shop tab "Insel", see `island.ts`): each changes the
 * terrain of the tile (x, y) and takes the cost of its item (`typeId`) from the store.
 * Ignored if `typeId` is not an item with exactly this island action.
 * Ignored if the item is still locked, the tile is not right for it or it
 * is too expensive. They count as a change (`revision`).
 *
 * - `plantTree`: meadow → forest (a tree; demolishing it gives the cost back).
 * - `placeRock`: meadow → rock (demolishing it gives the cost back).
 * - `fillLand`: water that touches land → beach (final, no refund).
 * - `makeMeadow`: beach → meadow (final, no refund).
 */
export interface PlantTreeCommand {
  readonly type: 'plantTree';
  /** The shop item (`buildings.json`) whose `island.action` is this command, e.g. `tree`. */
  readonly typeId: string;
  readonly x: number;
  readonly y: number;
}

export interface PlaceRockCommand {
  readonly type: 'placeRock';
  /** The shop item (`buildings.json`) whose `island.action` is this command, e.g. `tree`. */
  readonly typeId: string;
  readonly x: number;
  readonly y: number;
}

export interface FillLandCommand {
  readonly type: 'fillLand';
  /** The shop item (`buildings.json`) whose `island.action` is this command, e.g. `tree`. */
  readonly typeId: string;
  readonly x: number;
  readonly y: number;
}

export interface MakeMeadowCommand {
  readonly type: 'makeMeadow';
  /** The shop item (`buildings.json`) whose `island.action` is this command, e.g. `tree`. */
  readonly typeId: string;
  readonly x: number;
  readonly y: number;
}

/**
 * Invites a new resident (M6) with the shop item `typeId` (category `resident`): takes its cost, and a boat brings
 * them to the house with room. Ignored if there is no room in any house, the village is full or it is too expensive.
 * Counts as a change (`revision`).
 */
export interface InviteResidentCommand {
  readonly type: 'inviteResident';
  readonly typeId: string;
}

/** The command that puts a shop item on the tile (x, y): a building command, or for island items their own island command. */
export function placementCommand(typeId: string, x: number, y: number): Command {
  switch (buildingType(typeId)?.island?.action) {
    case 'plantTree':
      return { type: 'plantTree', typeId, x, y };
    case 'placeRock':
      return { type: 'placeRock', typeId, x, y };
    case 'fillLand':
      return { type: 'fillLand', typeId, x, y };
    case 'makeMeadow':
      return { type: 'makeMeadow', typeId, x, y };
    case undefined:
      return { type: 'placeBuilding', buildingType: typeId, x, y };
  }
}

/**
 * Applies a single command to the state (mutates `state`). Commands with
 * invalid data (unknown type or id, tile outside the map, not allowed there)
 * are ignored – they never throw and never change anything. Afterwards the
 * residents follow the change (a new workplace gets its worker, a demolished
 * house's residents look for a new one, see `settleResidents`).
 */
export function applyCommand(state: SimState, command: Command): void {
  applyOne(state, command);
  settleResidents(state);
}

function applyOne(state: SimState, command: Command): void {
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
      // A building first, then a path, then a tree or rock the player planted.
      if (!demolishAt(state, command.x, command.y)) {
        demolishPlanted(state, command.x, command.y);
      }
      return;
    case 'plantTree':
    case 'placeRock':
    case 'fillLand':
    case 'makeMeadow':
      placeIslandItem(state, command.typeId, command.x, command.y, command.type);
      return;
    case 'inviteResident':
      inviteResident(state, command.typeId);
      return;
    default:
      return assertNever(command);
  }
}

function assertNever(command: never): never {
  throw new Error(`Unhandled command: ${String((command as { type?: unknown }).type)}`);
}
