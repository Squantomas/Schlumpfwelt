/**
 * How residents find their way (M6): A* on the tile grid, pure and
 * deterministic. Paths are cheap, meadow and beach cost more, forest and rock
 * more still, and the footprint of a building is only crossed when there is no
 * other way (`walk.cost` in `residents.json`: so dear that nobody walks over
 * a roof to save a detour). Water can not be walked.
 *
 * So residents use the paths whenever they can, but are never stuck: a house
 * without a path is reached over the meadow (more slowly), and a resident who
 * finds a building put down on top of them simply walks out of it. The island
 * is one piece of land (the generator keeps one landmass, new land is only
 * added at the coast), so between any two tiles of land there is a way. Only
 * a loaded file can bring land cut off by water: every tile knows its
 * landmass (`landOf`), and a way between two landmasses is refused at once,
 * without a search.
 *
 * Also here: where a resident stands to use a building (its "door"), and how a
 * boat finds its way from the open sea to the coast next to the village.
 */
import { buildingType } from '../data/buildings';
import { RESIDENT_RULES } from '../data/residents';
import type { PlacedBuilding } from './buildings';
import type { DeepReadonly } from './readonly';
import type { SimState } from './state';
import type { World } from './world';

/** What the search reads. */
export type WalkView = DeepReadonly<Pick<SimState, 'world' | 'buildings' | 'paths' | 'revision'>>;

/** Optional output of {@link findWalk}: how much work the search did (for tests, instead of timing it). */
export interface WalkStats {
  expanded: number;
}

/** Right, left, down, up – the order decides between equally good ways. */
const DX: readonly number[] = [1, -1, 0, 0];
const DY: readonly number[] = [0, 0, 1, -1];

// --- The grid: which tile is covered by a building, which is a path ---

interface Grid {
  readonly world: object;
  readonly buildings: object;
  readonly paths: object;
  readonly revision: number;
  readonly buildingCount: number;
  readonly pathCount: number;
  /** The id of the building on every tile (0: none). */
  readonly occupied: Int32Array;
  /** 1 where there is a path. */
  readonly path: Uint8Array;
  /** The landmass of every tile: tiles of land joined by land (four sides) share a number from 1; water is 0. */
  readonly land: Int32Array;
}

/**
 * The grid is worked out once per change of the village (`revision`, and the
 * lists themselves, which a loaded village replaces) and then reused by every
 * search. It only caches what follows from the state; the answers never
 * depend on it.
 */
const grids = new WeakMap<object, Grid>();

function gridOf(view: WalkView): Grid {
  const cached = grids.get(view.world);
  if (
    cached &&
    cached.buildings === view.buildings &&
    cached.paths === view.paths &&
    cached.revision === view.revision &&
    cached.buildingCount === view.buildings.length &&
    cached.pathCount === view.paths.length
  ) {
    return cached;
  }
  const { width, height } = view.world;
  const size = width * height;
  const occupied = new Int32Array(size);
  for (const building of view.buildings) {
    const type = buildingType(building.type);
    if (!type) {
      continue;
    }
    for (let dy = 0; dy < type.footprint.h; dy += 1) {
      for (let dx = 0; dx < type.footprint.w; dx += 1) {
        const x = building.x + dx;
        const y = building.y + dy;
        if (x >= 0 && y >= 0 && x < width && y < height) {
          occupied[y * width + x] = building.id;
        }
      }
    }
  }
  const path = new Uint8Array(size);
  for (const index of view.paths) {
    if (index >= 0 && index < size) {
      path[index] = 1;
    }
  }
  const grid: Grid = {
    world: view.world,
    buildings: view.buildings,
    paths: view.paths,
    revision: view.revision,
    buildingCount: view.buildings.length,
    pathCount: view.paths.length,
    occupied,
    path,
    land: landmasses(view.world),
  };
  grids.set(view.world, grid);
  return grid;
}

/** Numbers the landmasses: one breadth-first fill per piece of land (the land changes only with `revision`). */
function landmasses(world: DeepReadonly<World>): Int32Array {
  const { width, height } = world;
  const size = width * height;
  const land = new Int32Array(size);
  const queue = new Int32Array(size);
  let count = 0;
  for (let start = 0; start < size; start += 1) {
    if (land[start] !== 0 || !isWalkable(world, start)) {
      continue;
    }
    count += 1;
    land[start] = count;
    queue[0] = start;
    let head = 0;
    let tail = 1;
    while (head < tail) {
      const index = queue[head] ?? 0;
      head += 1;
      const x = index % width;
      const y = (index - x) / width;
      for (let d = 0; d < 4; d += 1) {
        const nx = x + (DX[d] ?? 0);
        const ny = y + (DY[d] ?? 0);
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
          continue;
        }
        const next = ny * width + nx;
        if (land[next] === 0 && isWalkable(world, next)) {
          land[next] = count;
          queue[tail] = next;
          tail += 1;
        }
      }
    }
  }
  return land;
}

/** The landmass of a tile (from 1), 0 for water and tiles outside the map. */
export function landOf(view: WalkView, index: number): number {
  return gridOf(view).land[index] ?? 0;
}

/**
 * Can a resident on tile `from` walk to tile `to` at all? Both on the same landmass; a resident on water (only after
 * loading) can leave it towards any landmass next to it.
 */
export function canReach(view: WalkView, from: number, to: number): boolean {
  const { land } = gridOf(view);
  const goal = land[to] ?? 0;
  if (goal === 0) {
    return false;
  }
  const start = land[from] ?? 0;
  if (start !== 0) {
    return start === goal;
  }
  const { width, height } = view.world;
  const x = from % width;
  const y = (from - x) / width;
  for (let d = 0; d < 4; d += 1) {
    const nx = x + (DX[d] ?? 0);
    const ny = y + (DY[d] ?? 0);
    if (nx >= 0 && ny >= 0 && nx < width && ny < height && land[ny * width + nx] === goal) {
      return true;
    }
  }
  return false;
}

/** The id of the building that covers the tile (0: none). */
export function buildingIdAt(view: WalkView, index: number): number {
  return gridOf(view).occupied[index] ?? 0;
}

/** Is there a path on the tile (by index)? */
export function isPathIndex(view: WalkView, index: number): boolean {
  return gridOf(view).path[index] === 1;
}

/** Can the tile be walked at all (land inside the map)? */
export function isWalkable(world: DeepReadonly<World>, index: number): boolean {
  const terrain = world.tiles[index];
  return terrain !== undefined && terrain !== 'water';
}

/** What entering the tile costs; `Infinity` for water. The goal tile never counts as a building. */
function enterCost(world: DeepReadonly<World>, grid: Grid, index: number, goal: number): number {
  const terrain = world.tiles[index];
  if (terrain === undefined || terrain === 'water') {
    return Number.POSITIVE_INFINITY;
  }
  const costs = RESIDENT_RULES.walk.cost;
  if (index !== goal && grid.occupied[index] !== 0) {
    return costs.building;
  }
  if (grid.path[index] === 1) {
    return costs.path;
  }
  return terrain === 'forest' || terrain === 'rock' ? costs.rough : costs.ground;
}

// --- Search buffers (reused; a slot counts only when its stamp is the current generation) ---

interface Buffers {
  readonly best: Float64Array;
  readonly previous: Int32Array;
  readonly stamp: Uint32Array;
  readonly closed: Uint32Array;
  generation: number;
  heapNode: Int32Array;
  heapF: Float64Array;
  heapH: Float64Array;
  heapOrder: Int32Array;
}

const bufferCache = new Map<number, Buffers>();

function buffersFor(size: number): Buffers {
  let buffers = bufferCache.get(size);
  if (!buffers) {
    const heapSize = 4 * size + 4;
    buffers = {
      best: new Float64Array(size),
      previous: new Int32Array(size),
      stamp: new Uint32Array(size),
      closed: new Uint32Array(size),
      generation: 0,
      heapNode: new Int32Array(heapSize),
      heapF: new Float64Array(heapSize),
      heapH: new Float64Array(heapSize),
      heapOrder: new Int32Array(heapSize),
    };
    bufferCache.set(size, buffers);
  }
  if (buffers.generation >= 0xfffffffe) {
    buffers.stamp.fill(0);
    buffers.closed.fill(0);
    buffers.generation = 0;
  }
  buffers.generation += 1;
  return buffers;
}

/** A binary min-heap over the buffers: lowest f first, then the one nearer the goal, then the one pushed first. */
class Heap {
  size = 0;
  private order = 0;

  constructor(private readonly b: Buffers) {}

  private less(i: number, j: number): boolean {
    const { heapF: f, heapH: h, heapOrder: o } = this.b;
    const fi = f[i] ?? 0;
    const fj = f[j] ?? 0;
    if (fi !== fj) {
      return fi < fj;
    }
    const hi = h[i] ?? 0;
    const hj = h[j] ?? 0;
    return hi !== hj ? hi < hj : (o[i] ?? 0) < (o[j] ?? 0);
  }

  private swap(i: number, j: number): void {
    const { heapNode: n, heapF: f, heapH: h, heapOrder: o } = this.b;
    const tn = n[i] ?? 0;
    const tf = f[i] ?? 0;
    const th = h[i] ?? 0;
    const to = o[i] ?? 0;
    n[i] = n[j] ?? 0;
    f[i] = f[j] ?? 0;
    h[i] = h[j] ?? 0;
    o[i] = o[j] ?? 0;
    n[j] = tn;
    f[j] = tf;
    h[j] = th;
    o[j] = to;
  }

  push(node: number, f: number, h: number): void {
    const b = this.b;
    if (this.size >= b.heapNode.length) {
      // Never happens with four pushes per tile at most; grow anyway rather than lose a node.
      const grow = <T extends Int32Array | Float64Array>(array: T, make: (n: number) => T): T => {
        const bigger = make(array.length * 2);
        bigger.set(array);
        return bigger;
      };
      b.heapNode = grow(b.heapNode, (n) => new Int32Array(n));
      b.heapF = grow(b.heapF, (n) => new Float64Array(n));
      b.heapH = grow(b.heapH, (n) => new Float64Array(n));
      b.heapOrder = grow(b.heapOrder, (n) => new Int32Array(n));
    }
    let child = this.size;
    this.size += 1;
    b.heapNode[child] = node;
    b.heapF[child] = f;
    b.heapH[child] = h;
    b.heapOrder[child] = this.order;
    this.order += 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (!this.less(child, parent)) {
        break;
      }
      this.swap(child, parent);
      child = parent;
    }
  }

  /** Removes the best entry and returns its node. */
  pop(): number {
    const b = this.b;
    const top = b.heapNode[0] ?? 0;
    this.size -= 1;
    if (this.size > 0) {
      this.swap(0, this.size);
      let parent = 0;
      for (;;) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let smallest = parent;
        if (left < this.size && this.less(left, smallest)) {
          smallest = left;
        }
        if (right < this.size && this.less(right, smallest)) {
          smallest = right;
        }
        if (smallest === parent) {
          break;
        }
        this.swap(parent, smallest);
        parent = smallest;
      }
    }
    return top;
  }
}

/**
 * The cheapest way from tile `from` to tile `to` (tile indices): the tiles to
 * walk, without `from`, ending with `to` (empty when both are the same).
 * `undefined` when there is no way (the goal is water or cut off by water –
 * that is known without a search, see {@link canReach}).
 * The start tile is always left, even when it is water or a building.
 */
export function findWalk(view: WalkView, from: number, to: number, stats?: WalkStats): number[] | undefined {
  const world = view.world;
  const { width } = world;
  const size = width * world.height;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= size || to >= size) {
    return undefined;
  }
  if (from === to) {
    return [];
  }
  if (!isWalkable(world, to)) {
    return undefined;
  }
  if (!canReach(view, from, to)) {
    if (stats) {
      stats.expanded = 0;
    }
    return undefined;
  }
  const grid = gridOf(view);
  const buffers = buffersFor(size);
  const { best, previous, stamp, closed, generation } = buffers;
  const minCost = RESIDENT_RULES.walk.cost.path;
  const goalX = to % width;
  const goalY = (to - goalX) / width;
  const heuristic = (index: number): number => {
    const x = index % width;
    return (Math.abs(x - goalX) + Math.abs((index - x) / width - goalY)) * minCost;
  };

  const heap = new Heap(buffers);
  best[from] = 0;
  previous[from] = -1;
  stamp[from] = generation;
  heap.push(from, heuristic(from), heuristic(from));
  let found = false;
  let expanded = 0;
  while (heap.size > 0) {
    const node = heap.pop();
    if (closed[node] === generation) {
      continue;
    }
    closed[node] = generation;
    expanded += 1;
    if (node === to) {
      found = true;
      break;
    }
    const g = best[node] ?? 0;
    const x = node % width;
    const y = (node - x) / width;
    for (let d = 0; d < 4; d += 1) {
      const nx = x + (DX[d] ?? 0);
      const ny = y + (DY[d] ?? 0);
      if (nx < 0 || ny < 0 || nx >= width || ny >= world.height) {
        continue;
      }
      const next = ny * width + nx;
      if (closed[next] === generation) {
        continue;
      }
      const cost = enterCost(world, grid, next, to);
      if (cost === Number.POSITIVE_INFINITY) {
        continue;
      }
      const total = g + cost;
      if (stamp[next] !== generation || total < (best[next] ?? 0)) {
        stamp[next] = generation;
        best[next] = total;
        previous[next] = node;
        const h = heuristic(next);
        heap.push(next, total + h, h);
      }
    }
  }
  if (stats) {
    stats.expanded = expanded;
  }
  if (!found) {
    return undefined;
  }
  const tiles: number[] = [];
  for (let node = to; node !== from; node = previous[node] ?? from) {
    tiles.push(node);
  }
  return tiles.reverse();
}

/** The steps per tick on the way from tile `a` to the next tile `b`: faster when both are paths. */
export function walkSpeed(view: WalkView, a: number, b: number): number {
  const grid = gridOf(view);
  const walk = RESIDENT_RULES.walk;
  return grid.path[a] === 1 && grid.path[b] === 1 ? walk.pathSpeed : walk.groundSpeed;
}

// --- Doors ---

/**
 * The tiles right next to a footprint in the order a door is looked for: the
 * row below (from the middle outwards: the front of the house), then the left
 * and the right side (from the bottom up), then the row above.
 */
function besideTiles(x: number, y: number, w: number, h: number): [number, number][] {
  const tiles: [number, number][] = [];
  const middle = x + Math.floor((w - 1) / 2);
  const row = (rowY: number): void => {
    for (let offset = 0; offset < 2 * w; offset += 1) {
      const step = offset % 2 === 0 ? offset / 2 : -(offset + 1) / 2;
      const tx = middle + step;
      if (tx >= x && tx < x + w) {
        tiles.push([tx, rowY]);
      }
    }
  };
  row(y + h);
  for (let ty = y + h - 1; ty >= y; ty -= 1) {
    tiles.push([x - 1, ty]);
  }
  for (let ty = y + h - 1; ty >= y; ty -= 1) {
    tiles.push([x + w, ty]);
  }
  row(y - 1);
  return tiles;
}

/**
 * Where a resident stands to use a building (tile index): the first path
 * tile right next to it (the row in front first), else the first free tile
 * of land next to it, else the middle of its front row (they walk in).
 */
export function doorOf(view: WalkView, building: DeepReadonly<PlacedBuilding>): number {
  const { width, height } = view.world;
  const type = buildingType(building.type);
  const w = type?.footprint.w ?? 1;
  const h = type?.footprint.h ?? 1;
  const grid = gridOf(view);
  const beside = besideTiles(building.x, building.y, w, h).filter(([x, y]) => x >= 0 && y >= 0 && x < width && y < height).map(([x, y]) => y * width + x);
  const onPath = beside.find((index) => grid.path[index] === 1);
  if (onPath !== undefined) {
    return onPath;
  }
  const free = beside.find((index) => isWalkable(view.world, index) && grid.occupied[index] === 0);
  if (free !== undefined) {
    return free;
  }
  const x = Math.min(width - 1, Math.max(0, building.x + Math.floor((w - 1) / 2)));
  const y = Math.min(height - 1, Math.max(0, building.y + h - 1));
  return y * width + x;
}

// --- The sea: how a boat comes in from the edge of the map and goes out again ---

/**
 * For every tile of water that is connected to the edge of the map: the next
 * tile on the shortest way to the edge (-1 at the edge itself, -2 for tiles
 * no boat reaches: land, and lakes cut off from the sea). One search from all
 * tiles of water at the edge at once.
 */
export function seaWays(world: DeepReadonly<World>): Int32Array {
  const { width, height } = world;
  const size = width * height;
  const next = new Int32Array(size).fill(-2);
  const queue = new Int32Array(size);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < size; index += 1) {
    const x = index % width;
    const y = (index - x) / width;
    if ((x === 0 || y === 0 || x === width - 1 || y === height - 1) && world.tiles[index] === 'water') {
      next[index] = -1;
      queue[tail] = index;
      tail += 1;
    }
  }
  while (head < tail) {
    const index = queue[head] ?? 0;
    head += 1;
    const x = index % width;
    const y = (index - x) / width;
    for (let d = 0; d < 4; d += 1) {
      const nx = x + (DX[d] ?? 0);
      const ny = y + (DY[d] ?? 0);
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      const neighbour = ny * width + nx;
      if (next[neighbour] === -2 && world.tiles[neighbour] === 'water') {
        next[neighbour] = index;
        queue[tail] = neighbour;
        tail += 1;
      }
    }
  }
  return next;
}

/** The way from a tile of water out to the edge of the map (without the start tile), or `undefined` if it is cut off. */
export function wayOut(ways: Int32Array, from: number): number[] | undefined {
  if ((ways[from] ?? -2) === -2) {
    return undefined;
  }
  const tiles: number[] = [];
  for (let index = ways[from] ?? -1; index >= 0; index = ways[index] ?? -1) {
    tiles.push(index);
  }
  return tiles;
}

export interface Landing {
  /** Where the boat comes into sight: on its way from the edge of the map, at most `boat.approachTiles` tiles before the shore. */
  readonly start: number;
  /** The tiles the boat sails after `start`, ending at the tile of water by the shore. */
  readonly route: number[];
  /** The tile of land the passenger steps onto. */
  readonly shore: number;
}

/**
 * Where a boat lands for someone who wants to go to `target` (a tile index):
 * at the tile of land by the sea that is nearest to it (straight-line steps;
 * a free tile beats one under a building, then the lower index), and how it
 * gets there on the shortest way from the edge of the map – of which it sails
 * only the last `boat.approachTiles` tiles (it comes into sight out at sea, so
 * the arrival is short enough to watch and long enough to see). `undefined`
 * when no shore can be reached from the sea.
 */
export function landingFor(view: WalkView, target: number): Landing | undefined {
  const world = view.world;
  const { width, height } = world;
  const grid = gridOf(view);
  const ways = seaWays(world);
  const tx = target % width;
  const ty = (target - tx) / width;
  let best: { water: number; shore: number; score: number } | undefined;
  for (let water = 0; water < width * height; water += 1) {
    if ((ways[water] ?? -2) === -2) {
      continue;
    }
    const x = water % width;
    const y = (water - x) / width;
    for (let d = 0; d < 4; d += 1) {
      const nx = x + (DX[d] ?? 0);
      const ny = y + (DY[d] ?? 0);
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      const shore = ny * width + nx;
      if (!isWalkable(world, shore)) {
        continue;
      }
      const score = (Math.abs(nx - tx) + Math.abs(ny - ty)) * 2 + (grid.occupied[shore] === 0 ? 0 : 1);
      if (!best || score < best.score) {
        best = { water, shore, score };
      }
    }
  }
  if (!best) {
    return undefined;
  }
  const out = wayOut(ways, best.water) ?? [];
  const start = out.length > 0 ? (out[out.length - 1] ?? best.water) : best.water;
  // The way in is the way out backwards, without the edge tile the boat starts on …
  const full = start === best.water ? [] : [...out.slice(0, -1).reverse(), best.water];
  // … of which it sails only the last tiles.
  const approach = Math.max(1, Math.floor(RESIDENT_RULES.boat.approachTiles));
  if (full.length <= approach) {
    return { start, route: full, shore: best.shore };
  }
  return { start: full[full.length - approach - 1] ?? start, route: full.slice(-approach), shore: best.shore };
}
