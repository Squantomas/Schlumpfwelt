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
/** Existing path tiles are cheaper, but not free: a long detour over old paths must not beat the straight line. */
const EXISTING_TILE_COST = 0.4;
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
 * Finds the cheapest route from `from` to `to` (both included) that has at
 * most `maxLength` tiles. The length is part of the search (a state is tile,
 * direction and tiles used so far), so a long route over old paths can not
 * hide a short direct one, and states that can no longer reach the goal in
 * time are dropped early. Fails with `startBlocked` / `endBlocked` if an end
 * tile can not carry a path, `noRoute` if there is no way at all, `tooLong`
 * if there is one, but none within `maxLength` tiles.
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

  // A search state is a tile, the direction we came in with (4 = start, no direction yet) and the tiles used so far.
  const layers = maxLength + 1;
  const stateCount = world.width * world.height * 5 * layers;
  const encode = (tile: number, direction: number, used: number): number => (tile * 5 + direction) * layers + used;
  const best = new Float64Array(stateCount).fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(stateCount).fill(-1);
  const heap = new Heap();
  let order = 0;
  const startState = encode(tileIndex(world, from.x, from.y), 4, 1);
  best[startState] = 0;
  if (maxLength >= 1) {
    heap.push({ cost: 0, order: order++, state: startState });
  }

  let goal = -1;
  while (heap.size > 0) {
    const entry = heap.pop();
    if (!entry) {
      break;
    }
    if (entry.cost > (best[entry.state] ?? Number.POSITIVE_INFINITY)) {
      continue;
    }
    const used = entry.state % layers;
    const rest = Math.floor(entry.state / layers);
    const direction = rest % 5;
    const tile = Math.floor(rest / 5);
    const x = tile % world.width;
    const y = Math.floor(tile / world.width);
    if (x === to.x && y === to.y) {
      goal = entry.state;
      break;
    }
    DIRECTIONS.forEach(([dx, dy], next) => {
      const nx = x + dx;
      const ny = y + dy;
      // Even the straight rest of the way would be too long: drop this state.
      if (used + 1 + Math.abs(to.x - nx) + Math.abs(to.y - ny) > maxLength || !passable(nx, ny)) {
        return;
      }
      const step = isPath(state, nx, ny) ? EXISTING_TILE_COST : NEW_TILE_COST;
      const turn = direction !== 4 && direction !== next ? TURN_COST : 0;
      const cost = entry.cost + step + turn;
      const nextState = encode(tileIndex(world, nx, ny), next, used + 1);
      if (cost < (best[nextState] ?? Number.POSITIVE_INFINITY)) {
        best[nextState] = cost;
        previous[nextState] = entry.state;
        heap.push({ cost, order: order++, state: nextState });
      }
    });
  }

  if (goal < 0) {
    return { ok: false, reason: reachable(world, passable, from, to) ? 'tooLong' : 'noRoute' };
  }
  const tiles: Tile[] = [];
  for (let current = goal; current >= 0; current = previous[current] ?? -1) {
    const tile = Math.floor(current / layers / 5);
    tiles.push({ x: tile % world.width, y: Math.floor(tile / world.width) });
  }
  tiles.reverse();
  return { ok: true, tiles };
}

/** Is there any way at all (ignoring the length limit)? Plain flood fill, only run when the limited search failed. */
function reachable(
  world: { readonly width: number; readonly height: number },
  passable: (x: number, y: number) => boolean,
  from: Tile,
  to: Tile,
): boolean {
  const seen = new Uint8Array(world.width * world.height);
  const queue: number[] = [tileIndex(world, from.x, from.y)];
  seen[queue[0] ?? 0] = 1;
  for (let head = 0; head < queue.length; head += 1) {
    const tile = queue[head] ?? 0;
    const x = tile % world.width;
    const y = Math.floor(tile / world.width);
    if (x === to.x && y === to.y) {
      return true;
    }
    for (const [dx, dy] of DIRECTIONS) {
      const nx = x + dx;
      const ny = y + dy;
      if (passable(nx, ny) && seen[tileIndex(world, nx, ny)] === 0) {
        seen[tileIndex(world, nx, ny)] = 1;
        queue.push(tileIndex(world, nx, ny));
      }
    }
  }
  return false;
}
