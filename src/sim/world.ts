/**
 * The map: a rectangular grid of tiles, each with one terrain type.
 * Plain data only, so it can be saved as JSON (M5).
 */

export const TERRAINS = ['water', 'sand', 'grass', 'forest', 'rock'] as const;

export type Terrain = (typeof TERRAINS)[number];

export interface World {
  readonly width: number;
  readonly height: number;
  /** Terrain per tile, row by row: the tile (x, y) is at index `y * width + x`. */
  readonly tiles: Terrain[];
}

/** Read-only view of a world; scenes get this through `DeepReadonly<SimState>`. */
export interface WorldView {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly Terrain[];
}

export function createWorld(width: number, height: number, fill: Terrain = 'water'): World {
  return { width, height, tiles: new Array<Terrain>(width * height).fill(fill) };
}

export function inBounds(world: Pick<WorldView, 'width' | 'height'>, x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < world.width && y < world.height;
}

/** Terrain of the tile (x, y). Everything outside the map is water. */
export function terrainAt(world: WorldView, x: number, y: number): Terrain {
  if (!inBounds(world, x, y)) {
    return 'water';
  }
  return world.tiles[y * world.width + x] ?? 'water';
}

/** Sets the terrain of the tile (x, y); tiles outside the map are ignored. */
export function setTerrain(world: World, x: number, y: number, terrain: Terrain): void {
  if (inBounds(world, x, y)) {
    world.tiles[y * world.width + x] = terrain;
  }
}

/** Everything a building may stand on. Forest and rock must be cleared first. */
export function isBuildable(terrain: Terrain): boolean {
  return terrain === 'grass';
}

export function isLand(terrain: Terrain): boolean {
  return terrain !== 'water';
}

export interface TileBounds {
  readonly minX: number;
  readonly minY: number;
  /** Inclusive. */
  readonly maxX: number;
  readonly maxY: number;
}

/** Smallest rectangle of tiles that contains all land, or `undefined` if there is none. */
export function landBounds(world: WorldView): TileBounds | undefined {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      if (isLand(terrainAt(world, x, y))) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return maxX < minX ? undefined : { minX, minY, maxX, maxY };
}
