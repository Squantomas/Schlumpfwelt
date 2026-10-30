import worldData from '../data/world.json';
import { fractalNoise } from './noise';
import { Rng, normalizeSeed } from './random';
import { createWorld, type Terrain, type World } from './world';

/** Tunable numbers of the island generator; the defaults live in `src/data/world.json`. */
export interface WorldParams {
  readonly width: number;
  readonly height: number;
  /** Tiles at the map edge that are always water. */
  readonly borderWater: number;
  readonly island: {
    /** Island radius as a fraction of the room inside the border (0 to 1). */
    readonly radius: number;
    /** Higher = steeper drop from land to sea, rounder island. */
    readonly falloffPower: number;
    /** Size of the coast's bays and bulges in tiles. */
    readonly noiseScale: number;
    readonly noiseOctaves: number;
    /** How much the noise bends the coastline (0 = perfect circle). */
    readonly noiseStrength: number;
    /** Height above which a tile is land. */
    readonly landThreshold: number;
  };
  readonly beach: {
    /** Size of the spots where the beach is two tiles wide. */
    readonly widenNoiseScale: number;
    /** Noise above this makes the beach two tiles wide (1 = never). */
    readonly widenThreshold: number;
  };
  readonly village: {
    /** Tiles around the map centre that are always meadow (room for the village). */
    readonly clearRadius: number;
  };
  readonly forest: TerrainPatchParams;
  readonly rock: TerrainPatchParams;
}

interface TerrainPatchParams {
  readonly noiseScale: number;
  readonly noiseOctaves: number;
  /** Share of the free inland tiles that get this terrain (0 to 1). */
  readonly share: number;
  /** Minimum distance to the sea in tiles (1 = the beach row). */
  readonly minShoreDistance: number;
}

export const DEFAULT_WORLD_PARAMS: WorldParams = worldData;

/** Seeds for the independent noise layers, so forest, rock and coast do not correlate. */
const SALT = { coast: 0x1000, beach: 0x2000, forest: 0x3000, rock: 0x4000 } as const;

const NEIGHBORS_4: readonly (readonly [number, number])[] = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
];
const NEIGHBORS_8: readonly (readonly [number, number])[] = [...NEIGHBORS_4, [-1, -1], [1, -1], [-1, 1], [1, 1]];

/**
 * Generates an island: sea around the edge, beach between sea and meadow,
 * forest and rock patches on the meadow, one single landmass, and a meadow in
 * the middle for the village. Same seed and params give the same island.
 */
export function generateIsland(seed: number, params: WorldParams = DEFAULT_WORLD_PARAMS): World {
  const s = normalizeSeed(seed);
  const { width, height } = params;
  const world = createWorld(width, height);
  const rng = new Rng(s);
  // Random shifts move the noise to a different part of its plane per seed and layer.
  const offsets = {
    coast: [rng.range(0, 1000), rng.range(0, 1000)],
    beach: [rng.range(0, 1000), rng.range(0, 1000)],
    forest: [rng.range(0, 1000), rng.range(0, 1000)],
    rock: [rng.range(0, 1000), rng.range(0, 1000)],
  } as const;
  const noise = (layer: keyof typeof offsets, x: number, y: number, scale: number, octaves: number): number => {
    const [ox = 0, oy = 0] = offsets[layer];
    return fractalNoise(s + SALT[layer], x / scale + ox, y / scale + oy, octaves);
  };

  const centerX = width / 2;
  const centerY = height / 2;
  const index = (x: number, y: number): number => y * width + x;

  // 1. Land where the radial height (high in the middle, falling off to the edge) plus noise is high enough.
  const room = Math.max(1, Math.min(width, height) / 2 - params.borderWater);
  const land = new Array<boolean>(width * height).fill(false);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY) / (room * params.island.radius);
      const radial = 1 - Math.pow(distance, params.island.falloffPower);
      const bump = noise('coast', x, y, params.island.noiseScale, params.island.noiseOctaves) - 0.5;
      land[index(x, y)] = radial + bump * params.island.noiseStrength > params.island.landThreshold;
    }
  }

  // 2. The village meadow in the middle is always land; the map edge is always sea.
  const clearRadius = params.village.clearRadius;
  const nearCenter = (x: number, y: number, radius: number): boolean =>
    Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY) <= radius;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
      if (edge < params.borderWater) {
        land[index(x, y)] = false;
      } else if (nearCenter(x, y, clearRadius + 1)) {
        land[index(x, y)] = true;
      }
    }
  }

  // 3. Keep only the landmass in the middle; small islets and splinters become sea.
  const main = floodFill(width, height, land, Math.floor(centerX), Math.floor(centerY), NEIGHBORS_4);
  for (let i = 0; i < land.length; i += 1) {
    land[i] = main[i] === true;
  }

  // 4. Sea that does not reach the edge (lakes, bays closed by diagonals) becomes land.
  const sea = land.map((isLandTile) => !isLandTile);
  const outerSea = new Array<boolean>(width * height).fill(false);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && sea[index(x, y)] === true && !outerSea[index(x, y)]) {
        const part = floodFill(width, height, sea, x, y, NEIGHBORS_4);
        for (let i = 0; i < part.length; i += 1) {
          outerSea[i] ||= part[i] === true;
        }
      }
    }
  }
  for (let i = 0; i < land.length; i += 1) {
    land[i] = !outerSea[i];
  }

  // 5. Distance from the sea in tiles (8 directions): 0 = sea, 1 = right at the shore.
  const shore = distanceToSea(width, height, land);

  // 6. Terrain: beach along the shore, meadow inland.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = index(x, y);
      if (!land[i]) {
        continue;
      }
      const d = shore[i] ?? 0;
      const wideBeach = d === 2 && noise('beach', x, y, params.beach.widenNoiseScale, 2) > params.beach.widenThreshold;
      world.tiles[i] = d <= 1 || wideBeach ? 'sand' : 'grass';
    }
  }
  // Single meadow tiles that stick out into the beach look like mistakes: give them to the beach.
  const isGrass = (x: number, y: number): boolean => terrainAtIndex(world.tiles, width, height, x, y) === 'grass';
  for (let changed = true; changed; ) {
    changed = false;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (world.tiles[index(x, y)] === 'grass' && NEIGHBORS_4.filter(([dx, dy]) => !isGrass(x + dx, y + dy)).length >= 3) {
          world.tiles[index(x, y)] = 'sand';
          changed = true;
        }
      }
    }
  }
  const inland: number[] = [];
  for (let i = 0; i < world.tiles.length; i += 1) {
    if (world.tiles[i] === 'grass') {
      inland.push(i);
    }
  }

  const villageFree = (i: number): boolean => !nearCenter(i % width, Math.floor(i / width), clearRadius);
  const claim = (terrain: Terrain, layer: 'forest' | 'rock', patch: TerrainPatchParams): void => {
    const candidates = inland.filter(
      (i) => world.tiles[i] === 'grass' && villageFree(i) && (shore[i] ?? 0) >= patch.minShoreDistance,
    );
    const scored = candidates.map((i) => ({
      i,
      score: noise(layer, i % width, Math.floor(i / width), patch.noiseScale, patch.noiseOctaves),
    }));
    // Highest noise first; ties by position, so the result never depends on sort internals.
    scored.sort((a, b) => b.score - a.score || a.i - b.i);
    const count = Math.round(scored.length * patch.share);
    for (const { i } of scored.slice(0, count)) {
      world.tiles[i] = terrain;
    }
  };
  claim('forest', 'forest', params.forest);
  claim('rock', 'rock', params.rock);

  return world;
}

function terrainAtIndex(tiles: readonly Terrain[], width: number, height: number, x: number, y: number): Terrain {
  return x < 0 || y < 0 || x >= width || y >= height ? 'water' : (tiles[y * width + x] ?? 'water');
}

/** Tiles reachable from (startX, startY) over `allowed` tiles. */
function floodFill(
  width: number,
  height: number,
  allowed: readonly boolean[],
  startX: number,
  startY: number,
  neighbors: readonly (readonly [number, number])[],
): boolean[] {
  const reached = new Array<boolean>(width * height).fill(false);
  if (allowed[startY * width + startX] !== true) {
    return reached;
  }
  const stack = [startY * width + startX];
  reached[stack[0] ?? 0] = true;
  while (stack.length > 0) {
    const i = stack.pop() ?? 0;
    const x = i % width;
    const y = Math.floor(i / width);
    for (const [dx, dy] of neighbors) {
      const nx = x + dx;
      const ny = y + dy;
      const ni = ny * width + nx;
      if (nx >= 0 && ny >= 0 && nx < width && ny < height && allowed[ni] === true && !reached[ni]) {
        reached[ni] = true;
        stack.push(ni);
      }
    }
  }
  return reached;
}

/** For every tile the number of steps (8 directions) to the nearest sea tile; sea itself is 0. */
function distanceToSea(width: number, height: number, land: readonly boolean[]): number[] {
  const distance = new Array<number>(width * height).fill(Number.POSITIVE_INFINITY);
  let frontier: number[] = [];
  for (let i = 0; i < land.length; i += 1) {
    if (!land[i]) {
      distance[i] = 0;
      frontier.push(i);
    }
  }
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const i of frontier) {
      const x = i % width;
      const y = Math.floor(i / width);
      for (const [dx, dy] of NEIGHBORS_8) {
        const nx = x + dx;
        const ny = y + dy;
        const ni = ny * width + nx;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height && distance[ni] === Number.POSITIVE_INFINITY) {
          distance[ni] = (distance[i] ?? 0) + 1;
          next.push(ni);
        }
      }
    }
    frontier = next;
  }
  return distance;
}

/** Counts how many tiles of each terrain the world has. */
export function countTerrains(world: Pick<World, 'tiles'>): Record<Terrain, number> {
  const counts: Record<Terrain, number> = { water: 0, sand: 0, grass: 0, forest: 0, rock: 0 };
  for (const terrain of world.tiles) {
    counts[terrain] += 1;
  }
  return counts;
}
