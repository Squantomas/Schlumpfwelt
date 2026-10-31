/**
 * The shortest buildable route for a path between two tiles: around houses,
 * trees, rocks and water, over grass and sand. Pure and deterministic.
 *
 * Costs: every new path tile costs 1, a tile that already is a path is almost
 * free (so new paths join old ones), and every turn costs a little extra, so
 * routes run as straight as possible instead of climbing stairs.
 */
import { canPlacePath, isPath, tileIndex, type PlacementView, type Tile } from './buildings';
import { inBounds } from './world';

/** Longest route in tiles (start and end included, existing paths counted). */
export const MAX_ROUTE_LENGTH = 40;

const NEW_TILE_COST = 1;
const EXISTING_TILE_COST = 0.01;
const TURN_COST = 0.4;

export type RouteFailure = 'startBlocked' | 'endBlocked' | 'noRoute' | 'tooLong';

export type RouteResult =
  | { readonly ok: true; readonly tiles: Tile[] }
  | { readonly ok: false; readonly reason: RouteFailure };

/** Right, left, down, up – the order decides between equally good routes (horizontal first). */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

interface Entry {
  readonly cost: number;
  readonly order: number;
  readonly state: number;
}

/** Binary min-heap by cost, then by insertion order (so equal costs stay deterministic). */
class Heap {
  private readonly items: Entry[] = [];

  get size(): number {
    return this.items.length;
  }

  push(entry: Entry): void {
    const items = this.items;
    items.push(entry);
    let child = items.length - 1;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      const a = items[child];
      const b = items[parent];
      if (!a || !b || !less(a, b)) {
        break;
      }
      items[child] = b;
      items[parent] = a;
      child = parent;
    }
  }

  pop(): Entry | undefined {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (top && last && items.length > 0) {
      items[0] = last;
      let parent = 0;
      for (;;) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let smallest = parent;
        const current = items[smallest];
        const l = items[left];
        const r = items[right];
        if (l && current && less(l, current)) {
          smallest = left;
        }
        const best = items[smallest];
        if (r && best && less(r, best)) {
          smallest = right;
        }
        if (smallest === parent) {
          break;
        }
        const a = items[parent];
        const b = items[smallest];
        if (!a || !b) {
          break;
        }
        items[parent] = b;
        items[smallest] = a;
        parent = smallest;
      }
    }
    return top;
  }
}

function less(a: Entry, b: Entry): boolean {
  return a.cost < b.cost || (a.cost === b.cost && a.order < b.order);
}

/**
 * Finds the cheapest route from `from` to `to` (both included). Fails with
 * `startBlocked` / `endBlocked` if an end tile can not carry a path,
 * `noRoute` if there is no way, `tooLong` if the best route has more than
 * `maxLength` tiles.
 */
export function findRoute(state: PlacementView, from: Tile, to: Tile, maxLength: number = MAX_ROUTE_LENGTH): RouteResult {
  const { world } = state;
  const passable = (x: number, y: number): boolean => inBounds(world, x, y) && (isPath(state, x, y) || canPlacePath(state, x, y) === 'ok');
  if (!passable(from.x, from.y)) {
    return { ok: false, reason: 'startBlocked' };
  }
  if (!passable(to.x, to.y)) {
    return { ok: false, reason: 'endBlocked' };
  }

  // A search state is a tile plus the direction we came in with (4 = start, no direction yet).
  const stateCount = world.width * world.height * 5;
  const best = new Float64Array(stateCount).fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(stateCount).fill(-1);
  const heap = new Heap();
  let order = 0;
  const startState = tileIndex(world, from.x, from.y) * 5 + 4;
  best[startState] = 0;
  heap.push({ cost: 0, order: order++, state: startState });

  let goal = -1;
  while (heap.size > 0) {
    const entry = heap.pop();
    if (!entry) {
      break;
    }
    if (entry.cost > (best[entry.state] ?? Number.POSITIVE_INFINITY)) {
      continue;
    }
    const tile = Math.floor(entry.state / 5);
    const direction = entry.state % 5;
    const x = tile % world.width;
    const y = Math.floor(tile / world.width);
    if (x === to.x && y === to.y) {
      goal = entry.state;
      break;
    }
    DIRECTIONS.forEach(([dx, dy], next) => {
      const nx = x + dx;
      const ny = y + dy;
      if (!passable(nx, ny)) {
        return;
      }
      const step = isPath(state, nx, ny) ? EXISTING_TILE_COST : NEW_TILE_COST;
      const turn = direction !== 4 && direction !== next ? TURN_COST : 0;
      const cost = entry.cost + step + turn;
      const nextState = tileIndex(world, nx, ny) * 5 + next;
      if (cost < (best[nextState] ?? Number.POSITIVE_INFINITY)) {
        best[nextState] = cost;
        previous[nextState] = entry.state;
        heap.push({ cost, order: order++, state: nextState });
      }
    });
  }

  if (goal < 0) {
    return { ok: false, reason: 'noRoute' };
  }
  const tiles: Tile[] = [];
  for (let current = goal; current >= 0; current = previous[current] ?? -1) {
    const tile = Math.floor(current / 5);
    tiles.push({ x: tile % world.width, y: Math.floor(tile / world.width) });
  }
  tiles.reverse();
  return tiles.length > maxLength ? { ok: false, reason: 'tooLong' } : { ok: true, tiles };
}
