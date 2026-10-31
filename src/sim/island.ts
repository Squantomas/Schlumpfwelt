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
import { buildingType } from '../data/buildings';
import { addAmounts, costOf, takeAmounts } from './economy';
import { canPlace, tileIndex } from './buildings';
import type { DeepReadonly } from './readonly';
import type { SimState } from './state';
import { inBounds, setTerrain, terrainAt, type Terrain } from './world';

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
  return inBounds(state.world, x, y) && state.planted.includes(tileIndex(state.world, x, y));
}

/**
 * Applies an island item on the tile (x, y) if the rules allow it and takes its
 * cost. Returns whether anything changed.
 */
export function placeIslandItem(state: SimState, typeId: string, x: number, y: number): boolean {
  const result = islandResult(typeId);
  if (result === undefined || canPlace(state, typeId, x, y) !== 'ok') {
    return false;
  }
  takeAmounts(state.inventory, costOf(typeId));
  setTerrain(state.world, x, y, result);
  if (result === 'forest' || result === 'rock') {
    const index = tileIndex(state.world, x, y);
    if (!state.planted.includes(index)) {
      state.planted.push(index);
      state.planted.sort((a, b) => a - b);
    }
  }
  state.revision += 1;
  return true;
}

/** The type of item whose cost a planted tile gives back (`tree` for forest, `rock` for rock). */
export function plantedTypeAt(state: PlantedView, x: number, y: number): string | undefined {
  if (!isPlanted(state, x, y)) {
    return undefined;
  }
  switch (terrainAt(state.world, x, y)) {
    case 'forest':
      return 'tree';
    case 'rock':
      return 'rock';
    case 'water':
    case 'sand':
    case 'grass':
      return undefined;
  }
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
  state.planted = state.planted.filter((planted) => planted !== index);
  setTerrain(state.world, x, y, 'grass');
  state.revision += 1;
  return true;
}

/**
 * Brings a list of planted tiles into the form the state needs (whole
 * non-negative numbers, ascending, no duplicates) and keeps only tiles that
 * are still forest or rock. For loading saved games (M5).
 */
export function normalizePlanted(raw: unknown, world: Pick<SimState['world'], 'width' | 'height' | 'tiles'>): number[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const valid = (raw as unknown[]).filter(
    (index): index is number =>
      typeof index === 'number' &&
      Number.isInteger(index) &&
      index >= 0 &&
      index < world.width * world.height &&
      (world.tiles[index] === 'forest' || world.tiles[index] === 'rock'),
  );
  return [...new Set(valid)].sort((a, b) => a - b);
}
