/**
 * Buildings and paths on the map: placing, moving, demolishing and the rules
 * behind them. Pure functions on plain data (see `SimState`), so scenes can
 * ask the same questions as the commands do (`canPlace` for the preview).
 *
 * Rules (M2):
 * - Houses and decoration only stand on grass, paths on grass and sand
 *   (`terrains` in `buildings.json`). Forest and rock are not buildable yet;
 *   clearing them is a later decision.
 * - Nothing overlaps: buildings do not overlap each other and do not stand on
 *   paths, and a path is not laid under a building.
 * - A building that needs a path (`needsPath`) is connected when at least one
 *   tile right next to its footprint (not diagonal) is a path tile. That the
 *   paths form one connected network is not required in M2.
 */
import { buildingType, type BuildingType } from '../data/buildings';
import type { DeepReadonly } from './readonly';
import type { SimState } from './state';
import { inBounds, terrainAt } from './world';

export interface Tile {
  readonly x: number;
  readonly y: number;
}

/** A building on the map. `x`, `y` is the top left tile of its footprint. */
export interface PlacedBuilding {
  id: number;
  type: string;
  x: number;
  y: number;
}

/**
 * - `ok`: can be placed.
 * - `blocked`: something is in the way (another building or a path).
 * - `terrain`: wrong ground (water, forest, rock, sand for a house …).
 * - `outOfMap`: at least one tile is outside the map.
 */
export type PlacementResult = 'ok' | 'blocked' | 'terrain' | 'outOfMap';

/** What the placement rules need: a read-only view of the state is enough. */
export type PlacementView = DeepReadonly<Pick<SimState, 'world' | 'buildings' | 'paths'>>;

export function tileIndex(world: { readonly width: number }, x: number, y: number): number {
  return y * world.width + x;
}

/** The tiles a building of `type` covers when its top left tile is (x, y). */
export function footprintTiles(type: Pick<BuildingType, 'footprint'>, x: number, y: number): Tile[] {
  const tiles: Tile[] = [];
  for (let dy = 0; dy < type.footprint.h; dy += 1) {
    for (let dx = 0; dx < type.footprint.w; dx += 1) {
      tiles.push({ x: x + dx, y: y + dy });
    }
  }
  return tiles;
}

export function isPath(state: Pick<PlacementView, 'world' | 'paths'>, x: number, y: number): boolean {
  return inBounds(state.world, x, y) && state.paths[tileIndex(state.world, x, y)] === true;
}

/** The building that covers the tile, if any. */
export function buildingAt(state: Pick<PlacementView, 'buildings'>, x: number, y: number): DeepReadonly<PlacedBuilding> | undefined {
  for (const building of state.buildings) {
    const type = buildingType(building.type);
    if (type && x >= building.x && y >= building.y && x < building.x + type.footprint.w && y < building.y + type.footprint.h) {
      return building;
    }
  }
  return undefined;
}

export function findBuilding(state: Pick<PlacementView, 'buildings'>, id: number): DeepReadonly<PlacedBuilding> | undefined {
  return state.buildings.find((building) => building.id === id);
}

/**
 * Can a thing of type `typeId` stand with its top left tile on (x, y)?
 * `ignoreId` leaves one building out of the overlap check – the building that
 * is being moved may overlap its old place.
 *
 * Check order: unknown type → `blocked`, outside the map → `outOfMap`, wrong
 * ground → `terrain`, something in the way → `blocked`.
 */
export function canPlace(state: PlacementView, typeId: string, x: number, y: number, ignoreId?: number): PlacementResult {
  const type = buildingType(typeId);
  if (!type || !Number.isInteger(x) || !Number.isInteger(y)) {
    return type ? 'outOfMap' : 'blocked';
  }
  const tiles = footprintTiles(type, x, y);
  if (tiles.some((tile) => !inBounds(state.world, tile.x, tile.y))) {
    return 'outOfMap';
  }
  if (tiles.some((tile) => !type.terrains.includes(terrainAt(state.world, tile.x, tile.y)))) {
    return 'terrain';
  }
  if (tiles.some((tile) => isPath(state, tile.x, tile.y))) {
    return 'blocked';
  }
  for (const other of state.buildings) {
    const otherType = buildingType(other.type);
    if (!otherType || other.id === ignoreId) {
      continue;
    }
    const overlaps =
      x < other.x + otherType.footprint.w &&
      other.x < x + type.footprint.w &&
      y < other.y + otherType.footprint.h &&
      other.y < y + type.footprint.h;
    if (overlaps) {
      return 'blocked';
    }
  }
  return 'ok';
}

/** Can a path be laid on this tile? Tiles that already are paths count as `blocked`. */
export function canPlacePath(state: PlacementView, x: number, y: number): PlacementResult {
  return canPlace(state, 'path', x, y);
}

/**
 * Is at least one tile right next to the footprint (up, down, left, right –
 * not diagonal) a path? `false` for unknown buildings.
 */
export function isConnected(state: PlacementView, buildingId: number): boolean {
  const building = findBuilding(state, buildingId);
  const type = building ? buildingType(building.type) : undefined;
  if (!building || !type) {
    return false;
  }
  const { w, h } = type.footprint;
  for (let dx = 0; dx < w; dx += 1) {
    if (isPath(state, building.x + dx, building.y - 1) || isPath(state, building.x + dx, building.y + h)) {
      return true;
    }
  }
  for (let dy = 0; dy < h; dy += 1) {
    if (isPath(state, building.x - 1, building.y + dy) || isPath(state, building.x + w, building.y + dy)) {
      return true;
    }
  }
  return false;
}

/** Ids of buildings that need a path but have none next to them. */
export function unconnectedBuildings(state: PlacementView): number[] {
  return state.buildings
    .filter((building) => buildingType(building.type)?.needsPath === true && !isConnected(state, building.id))
    .map((building) => building.id);
}

/** The tiles of an L-shaped path from `from` to `to`: first along x, then along y (or the other way round). */
export function lineTiles(from: Tile, to: Tile, horizontalFirst = true): Tile[] {
  const tiles: Tile[] = [];
  const corner: Tile = horizontalFirst ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
  const walk = (a: Tile, b: Tile): void => {
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    const dx = Math.sign(b.x - a.x);
    const dy = Math.sign(b.y - a.y);
    for (let i = 0; i <= steps; i += 1) {
      const tile = { x: a.x + dx * i, y: a.y + dy * i };
      if (!tiles.some((t) => t.x === tile.x && t.y === tile.y)) {
        tiles.push(tile);
      }
    }
  };
  walk(from, corner);
  walk(corner, to);
  return tiles;
}

// --- Mutations (only called by commands and the start village) ---

/** Places a building if the rules allow it and returns its id. */
export function addBuilding(state: SimState, typeId: string, x: number, y: number): number | undefined {
  // Paths are not buildings: they go through `addPaths`.
  if (buildingType(typeId)?.category === 'path' || canPlace(state, typeId, x, y) !== 'ok') {
    return undefined;
  }
  const id = state.nextBuildingId;
  state.nextBuildingId += 1;
  state.buildings.push({ id, type: typeId, x, y });
  state.revision += 1;
  return id;
}

/** Lays paths on all tiles that can take one; returns how many were laid. Invalid entries are skipped. */
export function addPaths(state: SimState, tiles: readonly Tile[]): number {
  let laid = 0;
  if (!Array.isArray(tiles)) {
    return 0;
  }
  for (const tile of tiles) {
    const x = (tile as Partial<Tile> | null | undefined)?.x;
    const y = (tile as Partial<Tile> | null | undefined)?.y;
    if (typeof x === 'number' && typeof y === 'number' && canPlacePath(state, x, y) === 'ok') {
      state.paths[tileIndex(state.world, x, y)] = true;
      laid += 1;
    }
  }
  if (laid > 0) {
    state.revision += 1;
  }
  return laid;
}

/** Moves a building (it may overlap its own old place). Returns whether anything changed. */
export function relocateBuilding(state: SimState, id: number, x: number, y: number): boolean {
  const building = state.buildings.find((b) => b.id === id);
  if (!building || (building.x === x && building.y === y) || canPlace(state, building.type, x, y, id) !== 'ok') {
    return false;
  }
  building.x = x;
  building.y = y;
  state.revision += 1;
  return true;
}

/** Removes the building on the tile, or else the path on it. Returns whether anything was removed. */
export function demolishAt(state: SimState, x: number, y: number): boolean {
  if (!inBounds(state.world, x, y)) {
    return false;
  }
  const building = buildingAt(state, x, y);
  if (building) {
    state.buildings = state.buildings.filter((b) => b.id !== building.id);
    state.revision += 1;
    return true;
  }
  if (isPath(state, x, y)) {
    state.paths[tileIndex(state.world, x, y)] = false;
    state.revision += 1;
    return true;
  }
  return false;
}
