/**
 * Designing the island itself (M4, shop tab "Insel"): the player plants a
 * tree, sets a rock, fills up water at the coast to make a beach, or turns
 * beach into meadow. These items do not add a building, they change the
 * terrain of one tile.
 *
 * Rules:
 * - They use the same check as buildings (`checkPlacement`): unlocked, in the
 *   map (not at the very edge), the right ground, nothing standing on it,
 *   enough coins. A tree or rock needs meadow, a beach needs water that
 *   touches land, a meadow needs beach.
 * - A planted tree is a forest tile and a set rock a rock tile – a lumberjack
 *   or quarry counts them like the natural ones.
 * - Demolishing a **planted** tree or rock gives the cost back and makes the
 *   tile meadow again. Trees and rocks the island grew by itself stay.
 * - Filling up water and making a meadow can not be undone and give nothing
 *   back (they are cheap) – the one exception to "demolishing refunds".
 * - Every change counts as a change (`revision`).
 */
import { buildingType, type IslandAction } from '../data/buildings';
import { addAmounts, costOf, takeAmounts } from './economy';
import { canPlace, tileIndex } from './buildings';
import type { DeepReadonly } from './readonly';
import type { SimState } from './state';
import { inBounds, setTerrain, terrainAt, type Terrain } from './world';

/** A tree or rock the player planted: the tile (`y * width + x`) and the shop item that made it. */
export interface PlantedTile {
  index: number;
  type: string;
}

/** What the questions about planted trees and rocks read. */
export type PlantedView = DeepReadonly<Pick<SimState, 'world' | 'planted'>>;

/** The terrain an island item turns its tile into (`undefined` for other types). */
export function islandResult(typeId: string): Terrain | undefined {
  switch (buildingType(typeId)?.island?.action) {
    case 'plantTree':
      return 'forest';
    case 'placeRock':
      return 'rock';
    case 'fillLand':
      return 'sand';
    case 'makeMeadow':
      return 'grass';
    case undefined:
      return undefined;
  }
}

/** Was the tree or rock on this tile planted by the player? */
export function isPlanted(state: PlantedView, x: number, y: number): boolean {
  return plantedTypeAt(state, x, y) !== undefined;
}

/**
 * Applies an island item on the tile (x, y) if the rules allow it and takes its
 * cost. Returns whether anything changed.
 */
export function placeIslandItem(state: SimState, typeId: string, x: number, y: number, action?: IslandAction): boolean {
  const result = islandResult(typeId);
  if (result === undefined || (action !== undefined && buildingType(typeId)?.island?.action !== action) || canPlace(state, typeId, x, y) !== 'ok') {
    return false;
  }
  takeAmounts(state.inventory, costOf(typeId));
  setTerrain(state.world, x, y, result);
  if (result === 'forest' || result === 'rock') {
    const index = tileIndex(state.world, x, y);
    state.planted = state.planted.filter((planted) => planted.index !== index);
    state.planted.push({ index, type: typeId });
    state.planted.sort((a, b) => a.index - b.index);
  }
  state.revision += 1;
  return true;
}

/**
 * The type of item that planted the tree or rock on this tile (its cost is
 * what demolishing gives back), or `undefined` if the tile has none that the
 * player planted – or the ground is not what that item makes any more.
 */
export function plantedTypeAt(state: PlantedView, x: number, y: number): string | undefined {
  if (!inBounds(state.world, x, y)) {
    return undefined;
  }
  const index = tileIndex(state.world, x, y);
  const entry = state.planted.find((planted) => planted.index === index);
  return entry !== undefined && islandResult(entry.type) === terrainAt(state.world, x, y) ? entry.type : undefined;
}

/** What demolishing the planted tree or rock on this tile gives back (empty if the tile has none). */
export function plantedRefund(state: PlantedView, x: number, y: number): Record<string, number> {
  const typeId = plantedTypeAt(state, x, y);
  return typeId === undefined ? {} : { ...costOf(typeId) };
}

/**
 * Removes the tree or rock the player planted on this tile, gives its cost
 * back and makes the tile meadow. Returns whether anything was removed.
 */
export function demolishPlanted(state: SimState, x: number, y: number): boolean {
  const typeId = plantedTypeAt(state, x, y);
  if (typeId === undefined) {
    return false;
  }
  addAmounts(state.inventory, costOf(typeId));
  const index = tileIndex(state.world, x, y);
  state.planted = state.planted.filter((planted) => planted.index !== index);
  setTerrain(state.world, x, y, 'grass');
  state.revision += 1;
  return true;
}

/**
 * Brings a list of planted tiles into the form the state needs (`{ index, type }`
 * with a whole tile index inside the map, a known island item that makes
 * forest or rock, and ground that still is what the item makes; ascending by
 * index, one entry per tile). For loading saved games (M5).
 */
export function normalizePlanted(raw: unknown, world: Pick<SimState['world'], 'width' | 'height' | 'tiles'>): PlantedTile[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const byIndex = new Map<number, PlantedTile>();
  for (const entry of raw as unknown[]) {
    const { index, type } = (typeof entry === 'object' && entry !== null ? entry : {}) as Partial<PlantedTile>;
    if (
      typeof index === 'number' &&
      Number.isInteger(index) &&
      index >= 0 &&
      index < world.width * world.height &&
      typeof type === 'string' &&
      (islandResult(type) === 'forest' || islandResult(type) === 'rock') &&
      world.tiles[index] === islandResult(type)
    ) {
      byIndex.set(index, { index, type });
    }
  }
  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}
