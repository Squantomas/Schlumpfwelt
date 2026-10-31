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
 *
 * Rules (M3):
 * - A building with `needsNearby` (lumberjack, quarry) needs trees / rocks
 *   within its radius, otherwise it can not be placed (`noNearby`).
 * - Placing costs what `cost` says (`cost` = something is missing, with the
 *   missing amounts); the cost is taken when the building is placed.
 *   Moving is free (a check with `ignoreId` skips the cost), demolishing
 *   gives the whole cost back (see `economy.ts`).
 */
import { buildingType, type BuildingType } from '../data/buildings';
import { addAmounts, costOf, hasNearby, missingAmounts, newProducer, productionOf, refundFor, takeAmounts } from './economy';
import type { DeepReadonly } from './readonly';
import type { SimState } from './state';
import { inBounds, terrainAt, type Terrain } from './world';

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
 * - `noNearby`: the building needs trees / rocks nearby and there are none.
 * - `cost`: the place is fine, but coins or goods are missing.
 */
export type PlacementResult = 'ok' | 'blocked' | 'terrain' | 'outOfMap' | 'noNearby' | 'cost';

/** What the placement rules need: a read-only view of the state is enough. */
export type PlacementView = DeepReadonly<Pick<SimState, 'world' | 'buildings' | 'paths' | 'revision' | 'inventory'>>;

/**
 * The answer of {@link checkPlacement}: the result and, for `terrain`, the
 * ground that is in the way, for `noNearby` the terrain that is missing
 * nearby, for `cost` what is missing.
 */
export interface PlacementProblem {
  readonly result: PlacementResult;
  readonly terrain?: Terrain;
  readonly missing?: Readonly<Record<string, number>>;
}

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

/**
 * Brings a list of path tile indices into the form the state needs (ascending,
 * no duplicates, whole non-negative numbers only). For loading saved games:
 * `isPath` searches the list by bisection and relies on this order.
 */
export function normalizePaths(indices: readonly number[]): number[] {
  const valid = indices.filter((index) => Number.isInteger(index) && index >= 0);
  return [...new Set(valid)].sort((a, b) => a - b);
}

/** Position of `value` in the ascending list `sorted`, or the position where it would have to go (as `-1 - position`). */
function search(sorted: readonly number[], value: number): number {
  let low = 0;
  let high = sorted.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const current = sorted[middle] ?? 0;
    if (current === value) {
      return middle;
    }
    if (current < value) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return -1 - low;
}

export function isPath(state: Pick<PlacementView, 'world' | 'paths'>, x: number, y: number): boolean {
  return inBounds(state.world, x, y) && search(state.paths, tileIndex(state.world, x, y)) >= 0;
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
 * The building whose picture covers the world point (px), if any. Pictures
 * reach up over the footprint (`look.rise`), so a tap on a roof hits the house
 * although the tile under the finger is behind it. When pictures overlap, the
 * one in front (lower front edge) wins.
 */
export function buildingAtPoint(
  state: Pick<PlacementView, 'buildings'>,
  worldX: number,
  worldY: number,
  tileSize: number,
): DeepReadonly<PlacedBuilding> | undefined {
  let best: DeepReadonly<PlacedBuilding> | undefined;
  let bestFront = Number.NEGATIVE_INFINITY;
  for (const building of state.buildings) {
    const type = buildingType(building.type);
    if (!type) {
      continue;
    }
    const left = building.x * tileSize;
    const front = (building.y + type.footprint.h) * tileSize;
    const top = building.y * tileSize - type.look.rise;
    const hit = worldX >= left && worldX < left + type.footprint.w * tileSize && worldY >= top && worldY < front;
    if (hit && front >= bestFront) {
      best = building;
      bestFront = front;
    }
  }
  return best;
}

/**
 * Can a thing of type `typeId` stand with its top left tile on (x, y)?
 * `ignoreId` leaves one building out of the overlap check – the building that
 * is being moved may overlap its old place.
 *
 * Check order: unknown type → `blocked`, outside the map → `outOfMap`, wrong
 * ground → `terrain` (with the ground that is in the way), something in the
 * way → `blocked`, nothing to work with nearby → `noNearby`, too expensive →
 * `cost` (with the missing amounts). The cost is not checked when `free` is
 * set, which is the default with `ignoreId` (a building is being moved:
 * moving is free).
 */
export function checkPlacement(
  state: PlacementView,
  typeId: string,
  x: number,
  y: number,
  ignoreId?: number,
  free = ignoreId !== undefined,
): PlacementProblem {
  const type = buildingType(typeId);
  if (!type) {
    return { result: 'blocked' };
  }
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return { result: 'outOfMap' };
  }
  const tiles = footprintTiles(type, x, y);
  if (tiles.some((tile) => !inBounds(state.world, tile.x, tile.y))) {
    return { result: 'outOfMap' };
  }
  const wrong = tiles.map((tile) => terrainAt(state.world, tile.x, tile.y)).find((terrain) => !type.terrains.includes(terrain));
  if (wrong !== undefined) {
    return { result: 'terrain', terrain: wrong };
  }
  if (tiles.some((tile) => isPath(state, tile.x, tile.y))) {
    return { result: 'blocked' };
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
      return { result: 'blocked' };
    }
  }
  const nearby = productionOf(typeId)?.needsNearby;
  if (nearby && !hasNearby(state.world, type, x, y, nearby.terrain, nearby.radius)) {
    return { result: 'noNearby', terrain: nearby.terrain };
  }
  if (!free) {
    const missing = missingAmounts(state.inventory, costOf(typeId));
    if (Object.keys(missing).length > 0) {
      return { result: 'cost', missing };
    }
  }
  return { result: 'ok' };
}

export function canPlace(state: PlacementView, typeId: string, x: number, y: number, ignoreId?: number, free?: boolean): PlacementResult {
  return checkPlacement(state, typeId, x, y, ignoreId, free).result;
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
  return touchesPath(state, type, building.x, building.y);
}

/** Would a thing of this type with its top left tile on (x, y) have a path right next to it (not diagonal)? For the preview. */
export function wouldBeConnected(state: PlacementView, typeId: string, x: number, y: number): boolean {
  const type = buildingType(typeId);
  return type !== undefined && touchesPath(state, type, x, y);
}

function touchesPath(state: PlacementView, type: Pick<BuildingType, 'footprint'>, x: number, y: number): boolean {
  const { w, h } = type.footprint;
  for (let dx = 0; dx < w; dx += 1) {
    if (isPath(state, x + dx, y - 1) || isPath(state, x + dx, y + h)) {
      return true;
    }
  }
  for (let dy = 0; dy < h; dy += 1) {
    if (isPath(state, x - 1, y + dy) || isPath(state, x + w, y + dy)) {
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

/**
 * Places a building if the rules allow it, takes its cost from the store and
 * returns its id. `pay = false` skips both the cost check and the payment
 * (only for the start village, which is part of the initial state).
 */
export function addBuilding(state: SimState, typeId: string, x: number, y: number, pay = true): number | undefined {
  // Paths are not buildings: they go through `addPaths`.
  if (buildingType(typeId)?.category === 'path') {
    return undefined;
  }
  if (canPlace(state, typeId, x, y, undefined, !pay) !== 'ok') {
    return undefined;
  }
  if (pay) {
    takeAmounts(state.inventory, costOf(typeId));
  }
  const id = state.nextBuildingId;
  state.nextBuildingId += 1;
  state.buildings.push({ id, type: typeId, x, y });
  if (productionOf(typeId)) {
    state.production.push(newProducer(id));
  }
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
      const index = tileIndex(state.world, x, y);
      state.paths.splice(-1 - search(state.paths, index), 0, index);
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

/**
 * Removes the building on the tile, or else the path on it. A building gives
 * back its whole cost (and the inputs of a running round). Returns whether
 * anything was removed.
 */
export function demolishAt(state: SimState, x: number, y: number): boolean {
  if (!inBounds(state.world, x, y)) {
    return false;
  }
  const building = buildingAt(state, x, y);
  if (building) {
    addAmounts(state.inventory, refundFor(state, building.id));
    state.buildings = state.buildings.filter((b) => b.id !== building.id);
    state.production = state.production.filter((p) => p.buildingId !== building.id);
    state.revision += 1;
    return true;
  }
  if (isPath(state, x, y)) {
    state.paths.splice(search(state.paths, tileIndex(state.world, x, y)), 1);
    state.revision += 1;
    return true;
  }
  return false;
}
