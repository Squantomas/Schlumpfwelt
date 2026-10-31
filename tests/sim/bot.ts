import { buildingType } from '../../src/data/buildings';
import { canPlacePath, checkPlacement, footprintTiles, isPath, unconnectedBuildings, type Tile } from '../../src/sim/buildings';
import { canAfford } from '../../src/sim/economy';
import type { Simulation } from '../../src/sim/simulation';

/** How far (in tiles) the bot is willing to lay a path to reach the network. */
const MAX_PATH_DISTANCE = 25;

const key = (tile: Tile): string => `${String(tile.x)},${String(tile.y)}`;

/**
 * A very simple player for the tests: saves up for the things on its list in
 * that order, builds each on the free spot nearest to the middle of the
 * island that can be reached by a path, and lays a free path from the
 * building to the path network. It only uses commands, like the real UI.
 */
export class Bot {
  /** The tick at which each type was ordered. */
  readonly builtAt = new Map<string, number>();
  /** Types for which no place was found. */
  readonly noSpot = new Set<string>();

  constructor(private readonly sim: Simulation) {}

  /**
   * Orders the first thing of `wanted` that was not built yet as soon as it
   * can be paid (things with no free place are skipped). Returns it, or
   * `undefined` if nothing was ordered.
   */
  buildNext(wanted: readonly string[]): string | undefined {
    const state = this.sim.state;
    for (const typeId of wanted) {
      if (this.builtAt.has(typeId) || this.noSpot.has(typeId)) {
        continue;
      }
      if (!canAfford(state, typeId)) {
        return undefined;
      }
      const spot = this.findSpot(typeId);
      if (!spot) {
        this.noSpot.add(typeId);
        continue;
      }
      this.sim.send({ type: 'placeBuilding', buildingType: typeId, x: spot.x, y: spot.y });
      this.builtAt.set(typeId, state.tick);
      return typeId;
    }
    return undefined;
  }

  /** The place nearest to the middle of the map where `typeId` can stand and be reached by a path (the cost is ignored). */
  findSpot(typeId: string): Tile | undefined {
    const state = this.sim.state;
    const type = buildingType(typeId);
    if (!type) {
      return undefined;
    }
    const cx = state.world.width / 2;
    const cy = state.world.height / 2;
    const rich = { ...state, inventory: { coins: 99999, wood: 99999, stone: 99999, berries: 0, furniture: 0, cake: 0 } };
    const candidates: { tile: Tile; distance: number }[] = [];
    for (let y = 0; y < state.world.height; y += 1) {
      for (let x = 0; x < state.world.width; x += 1) {
        if (checkPlacement(rich, typeId, x, y).result === 'ok') {
          candidates.push({ tile: { x, y }, distance: Math.hypot(x - cx, y - cy) });
        }
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    if (!type.needsPath) {
      return candidates[0]?.tile;
    }
    const net = this.network();
    // First a place the path network reaches; if there is none (the middle is walled in), any place will do:
    // a single path stone right next to the building is enough for `isConnected`.
    return (
      candidates.find(({ tile }) => this.routeTo(net, typeId, tile.x, tile.y) !== undefined)?.tile ??
      candidates.find(({ tile }) => this.routeTo(net, typeId, tile.x, tile.y, true) !== undefined)?.tile
    );
  }

  /** Breadth-first distances (and the way back) from every path tile over free tiles a path could be laid on. */
  private network(): { dist: Map<string, number>; from: Map<string, Tile> } {
    const state = this.sim.state;
    const dist = new Map<string, number>();
    const from = new Map<string, Tile>();
    let frontier: Tile[] = state.paths.map((index) => ({ x: index % state.world.width, y: Math.floor(index / state.world.width) }));
    for (const tile of frontier) {
      dist.set(key(tile), 0);
    }
    for (let d = 1; d <= MAX_PATH_DISTANCE && frontier.length > 0; d += 1) {
      const next: Tile[] = [];
      for (const tile of frontier) {
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
          const n = { x: tile.x + dx, y: tile.y + dy };
          if (!dist.has(key(n)) && canPlacePath(state, n.x, n.y) === 'ok') {
            dist.set(key(n), d);
            from.set(key(n), tile);
            next.push(n);
          }
        }
      }
      frontier = next;
    }
    return { dist, from };
  }

  /** The tiles to lay so that a building at (x, y) is next to the network, or `[]` if it is already, or `undefined` if that is not possible. */
  private routeTo(net: { dist: Map<string, number>; from: Map<string, Tile> }, typeId: string, x: number, y: number, isolated = false): Tile[] | undefined {
    const type = buildingType(typeId);
    if (!type) {
      return undefined;
    }
    const inside = new Set(footprintTiles(type, x, y).map(key));
    let best: Tile | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const tile of this.borderTiles(typeId, x, y)) {
      const d = net.dist.get(key(tile));
      if (d !== undefined && d < bestDistance) {
        best = tile;
        bestDistance = d;
      }
    }
    if (net.dist.size === 0 || (isolated && !best)) {
      // No path anywhere yet (or none that can be reached): the first piece goes right next to the building.
      const first = this.borderTiles(typeId, x, y).find((tile) => canPlacePath(this.sim.state, tile.x, tile.y) === 'ok');
      return first ? [first] : undefined;
    }
    if (!best) {
      return undefined;
    }
    const route: Tile[] = [];
    let current: Tile | undefined = best;
    while (current && !isPath(this.sim.state, current.x, current.y)) {
      if (inside.has(key(current))) {
        return undefined;
      }
      route.push(current);
      current = net.from.get(key(current));
    }
    return route;
  }

  private borderTiles(typeId: string, x: number, y: number): Tile[] {
    const type = buildingType(typeId);
    if (!type) {
      return [];
    }
    const own = new Set(footprintTiles(type, x, y).map(key));
    const border: Tile[] = [];
    for (const tile of footprintTiles(type, x, y)) {
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
        const next = { x: tile.x + dx, y: tile.y + dy };
        if (!own.has(key(next))) {
          border.push(next);
        }
      }
    }
    return border;
  }

  /** Lays a path to every building that stands without one. */
  connectAll(): void {
    const state = this.sim.state;
    const unconnected = unconnectedBuildings(state);
    if (unconnected.length === 0) {
      return;
    }
    const net = this.network();
    for (const id of unconnected) {
      const building = state.buildings.find((b) => b.id === id);
      const route = building ? (this.routeTo(net, building.type, building.x, building.y) ?? this.routeTo(net, building.type, building.x, building.y, true)) : undefined;
      if (route && route.length > 0) {
        this.sim.send({ type: 'placePaths', tiles: route });
      }
    }
  }
}
