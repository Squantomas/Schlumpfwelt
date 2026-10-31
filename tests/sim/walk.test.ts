import { describe, expect, it } from 'vitest';
import { RESIDENT_RULES } from '../../src/data/residents';
import { tileIndex } from '../../src/sim/buildings';
import { doorOf, findWalk, isPathIndex, landingFor, seaWays, walkSpeed, wayOut, buildingIdAt, type WalkStats } from '../../src/sim/walk';
import { fillTerrain, grassState, run, setTerrainAt } from './helpers';

const at = (x: number, y: number, width = 16): number => tileIndex({ width }, x, y);
const xy = (index: number, width = 16): [number, number] => [index % width, Math.floor(index / width)];

/** Every tile is right next to the one before (no jumps, no diagonals). */
function expectSteps(from: number, route: readonly number[], width = 16): void {
  let previous = xy(from, width);
  for (const tile of route) {
    const next = xy(tile, width);
    expect(Math.abs(next[0] - previous[0]) + Math.abs(next[1] - previous[1])).toBe(1);
    previous = next;
  }
}

/** What entering a tile costs the search (the goal never counts as a building). */
function enter(state: ReturnType<typeof grassState>, tile: number, goal: number): number {
  const costs = RESIDENT_RULES.walk.cost;
  if (tile !== goal && buildingIdAt(state, tile) !== 0) {
    return costs.building;
  }
  if (isPathIndex(state, tile)) {
    return costs.path;
  }
  const terrain = state.world.tiles[tile];
  return terrain === 'forest' || terrain === 'rock' ? costs.rough : costs.ground;
}

/** What walking the tiles costs, as the search counts it. */
function costOf(state: ReturnType<typeof grassState>, route: readonly number[]): number {
  const goal = route.at(-1) ?? -1;
  return route.reduce((sum, tile) => sum + enter(state, tile, goal), 0);
}

describe('Wegsuche der Bewohner (A*)', () => {
  it('liefert die Kacheln ohne den Start und mit dem Ziel, Schritt für Schritt', () => {
    const state = grassState();
    const route = findWalk(state, at(2, 2), at(6, 4));
    expect(route).toBeDefined();
    expect(route?.at(-1)).toBe(at(6, 4));
    expect(route).not.toContain(at(2, 2));
    expect(route).toHaveLength(6);
    expectSteps(at(2, 2), route ?? []);
  });

  it('ist leer, wenn Start und Ziel gleich sind, und undefined für Wasser oder Unsinn', () => {
    const state = grassState();
    expect(findWalk(state, at(3, 3), at(3, 3))).toEqual([]);
    setTerrainAt(state, 8, 8, 'water');
    expect(findWalk(state, at(3, 3), at(8, 8))).toBeUndefined();
    expect(findWalk(state, -1, at(3, 3))).toBeUndefined();
    expect(findWalk(state, at(3, 3), 16 * 16)).toBeUndefined();
    expect(findWalk(state, 1.5, at(3, 3))).toBeUndefined();
  });

  it('geht nie über Wasser und findet den Weg um einen See herum', () => {
    const state = grassState();
    fillTerrain(state, 5, 0, 1, 14, 'water');
    const route = findWalk(state, at(2, 2), at(9, 2)) ?? [];
    expect(route.length).toBeGreaterThan(7);
    for (const tile of route) {
      expect(state.world.tiles[tile]).not.toBe('water');
    }
    expect(route.some((tile) => xy(tile)[1] >= 14)).toBe(true);
  });

  it('gibt auf, wenn Wasser das Ziel ganz abschneidet', () => {
    const state = grassState();
    fillTerrain(state, 5, 0, 1, 16, 'water');
    expect(findWalk(state, at(2, 2), at(9, 2))).toBeUndefined();
  });

  it('nimmt lieber einen Umweg über den Weg als den geraden Weg über die Wiese', () => {
    const state = grassState();
    // A path in a U: down, along and up again, from (2, 2) to (12, 2).
    run(state, { type: 'placePaths', tiles: [...[2, 3, 4, 5, 6].map((y) => ({ x: 2, y })), ...[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((x) => ({ x, y: 6 })), ...[2, 3, 4, 5].map((y) => ({ x: 12, y }))] });
    const route = findWalk(state, at(2, 2), at(12, 2)) ?? [];
    expect(route.every((tile) => isPathIndex(state, tile))).toBe(true);
    expect(route).toHaveLength(18);
  });

  it('geht durch Wald und Fels, aber teurer als über die Wiese', () => {
    const state = grassState();
    fillTerrain(state, 4, 0, 1, 15, 'forest');
    const around = findWalk(state, at(2, 2), at(6, 2)) ?? [];
    // Through the forest: 4 steps, one of them rough – cheaper than the long way around below.
    expect(around).toHaveLength(4);
    expect(costOf(state, around)).toBe(3 * RESIDENT_RULES.walk.cost.ground + RESIDENT_RULES.walk.cost.rough);
  });

  it('geht um Häuser herum und nur durch ein Haus, wenn es keinen anderen Weg gibt', () => {
    const state = grassState();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 2 });
    const route = findWalk(state, at(3, 3), at(6, 3)) ?? [];
    expect(route.some((tile) => buildingIdAt(state, tile) !== 0)).toBe(false);
    // Walled in by water all around except through the house: then they walk through it.
    const walled = grassState();
    fillTerrain(walled, 0, 0, 16, 16, 'water');
    fillTerrain(walled, 2, 3, 6, 1, 'grass');
    run(walled, { type: 'placeBuilding', buildingType: 'flower', x: 4, y: 3 });
    const through = findWalk(walled, at(2, 3), at(7, 3)) ?? [];
    expect(through).toHaveLength(5);
    expect(through).toContain(at(4, 3));
  });

  it('läuft aus einem Gebäude heraus, auf dem der Bewohner gerade steht, und kann ein Gebäude als Ziel haben', () => {
    const state = grassState();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 4 });
    const out = findWalk(state, at(4, 4), at(10, 10)) ?? [];
    expect(out.at(-1)).toBe(at(10, 10));
    const into = findWalk(state, at(10, 10), at(5, 5)) ?? [];
    expect(into.at(-1)).toBe(at(5, 5));
    expect(costOf(state, into)).toBeLessThan(costOf(state, out) + 2 * RESIDENT_RULES.walk.cost.building);
  });

  it('findet immer den günstigsten Weg (geprüft gegen eine einfache Suche über alle Kacheln)', () => {
    const state = grassState();
    fillTerrain(state, 3, 3, 4, 2, 'forest');
    fillTerrain(state, 9, 6, 2, 5, 'rock');
    setTerrainAt(state, 7, 9, 'water');
    run(state, { type: 'placePaths', tiles: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((x) => ({ x, y: 12 })) }, { type: 'placeBuilding', buildingType: 'house-blue', x: 12, y: 2 });
    for (const [from, to] of [
      [at(0, 0), at(15, 15)],
      [at(4, 4), at(13, 3)],
      [at(1, 12), at(12, 12)],
      [at(15, 0), at(0, 15)],
    ] as const) {
      const route = findWalk(state, from, to) ?? [];
      expectSteps(from, route);
      expect(costOf(state, route), `${String(from)} → ${String(to)}`).toBe(dijkstra(state, from, to));
    }
  });

  it('ist deterministisch und hängt nicht von früheren Suchen ab', () => {
    const state = grassState();
    fillTerrain(state, 6, 2, 1, 10, 'rock');
    const first = findWalk(state, at(1, 7), at(14, 7));
    findWalk(state, at(0, 0), at(15, 15));
    findWalk(state, at(15, 0), at(0, 15));
    expect(findWalk(state, at(1, 7), at(14, 7))).toEqual(first);
  });

  it('merkt Änderungen am Dorf (neue Häuser, Wege) bei der nächsten Suche', () => {
    const state = grassState();
    const before = findWalk(state, at(2, 5), at(10, 5)) ?? [];
    expect(before).toContain(at(6, 5));
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 6, y: 4 });
    const after = findWalk(state, at(2, 5), at(10, 5)) ?? [];
    expect(after).not.toContain(at(6, 5));
    expect(after).not.toContain(at(7, 5));
  });

  it('sucht sparsam: entlang eines Weges kaum mehr Kacheln, als der Weg lang ist, und nie mehr als die Karte hat', () => {
    const state = grassState(48);
    run(state, { type: 'placePaths', tiles: Array.from({ length: 40 }, (_, i) => ({ x: 4 + i, y: 10 })) });
    const stats: WalkStats = { expanded: 0 };
    const route = findWalk(state, tileIndex(state.world, 4, 10), tileIndex(state.world, 43, 10), stats) ?? [];
    expect(route).toHaveLength(39);
    expect(stats.expanded).toBeLessThan(2 * route.length);
    findWalk(state, tileIndex(state.world, 0, 0), tileIndex(state.world, 47, 47), stats);
    expect(stats.expanded).toBeLessThanOrEqual(48 * 48);
  });

  it('ist auf Wegen schneller als daneben', () => {
    const state = grassState();
    run(state, { type: 'placePaths', tiles: [3, 4, 5].map((x) => ({ x, y: 3 })) });
    expect(walkSpeed(state, at(3, 3), at(4, 3))).toBe(RESIDENT_RULES.walk.pathSpeed);
    expect(walkSpeed(state, at(5, 3), at(6, 3))).toBe(RESIDENT_RULES.walk.groundSpeed);
    expect(walkSpeed(state, at(3, 4), at(3, 3))).toBe(RESIDENT_RULES.walk.groundSpeed);
    expect(RESIDENT_RULES.walk.pathSpeed).toBeGreaterThan(RESIDENT_RULES.walk.groundSpeed);
  });
});

/** Plain Dijkstra over the whole grid with the same costs, as a reference. */
function dijkstra(state: ReturnType<typeof grassState>, from: number, to: number): number {
  const { width, height } = state.world;
  const best = new Map<number, number>([[from, 0]]);
  const done = new Set<number>();
  for (;;) {
    let node = -1;
    let cost = Number.POSITIVE_INFINITY;
    for (const [index, value] of best) {
      if (!done.has(index) && value < cost) {
        node = index;
        cost = value;
      }
    }
    if (node === -1) {
      return Number.POSITIVE_INFINITY;
    }
    if (node === to) {
      return cost;
    }
    done.add(node);
    const [x, y] = xy(node, width);
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      const next = ny * width + nx;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height || state.world.tiles[next] === 'water') {
        continue;
      }
      const total = cost + enter(state, next, to);
      if (total < (best.get(next) ?? Number.POSITIVE_INFINITY)) {
        best.set(next, total);
      }
    }
  }
}

describe('Türen der Gebäude', () => {
  it('ist der Weg vor dem Haus (vorne in der Mitte zuerst)', () => {
    const state = grassState();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 4 }, { type: 'placePaths', tiles: [3, 4, 5, 6].map((x) => ({ x, y: 6 })) });
    const house = state.buildings[0];
    expect(house && doorOf(state, house)).toBe(at(4, 6));
  });

  it('nimmt einen Weg an der Seite oder oben, wenn vorne keiner ist', () => {
    const state = grassState();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 4 }, { type: 'placePaths', tiles: [{ x: 4, y: 3 }, { x: 6, y: 5 }] });
    const house = state.buildings[0];
    expect(house && doorOf(state, house)).toBe(at(6, 5));
  });

  it('ohne Weg ist es die freie Wiese vorne, und wenn alles zugebaut ist, die Mitte der vorderen Reihe', () => {
    const state = grassState();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 4 });
    const house = state.buildings[0];
    expect(house && doorOf(state, house)).toBe(at(4, 6));
    const walled = grassState();
    fillTerrain(walled, 0, 0, 16, 16, 'water');
    fillTerrain(walled, 4, 4, 2, 2, 'grass');
    run(walled, { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 4 });
    const lonely = walled.buildings[0];
    expect(lonely && doorOf(walled, lonely)).toBe(at(4, 5));
  });
});

describe('Boote: vom Rand der Karte an die Küste', () => {
  /** A 16×16 map with land in the middle (4 … 11) and sea around it. */
  function island(): ReturnType<typeof grassState> {
    const state = grassState();
    fillTerrain(state, 0, 0, 16, 16, 'water');
    fillTerrain(state, 4, 4, 8, 8, 'grass');
    return state;
  }

  it('kennt für jedes Wasser den nächsten Schritt zum Rand; Land und Seen erreicht kein Boot', () => {
    const state = island();
    // A lake in the middle of the land.
    setTerrainAt(state, 7, 7, 'water');
    const ways = seaWays(state.world);
    expect(ways[at(0, 5)]).toBe(-1);
    expect(ways[at(5, 5)]).toBe(-2);
    expect(ways[at(7, 7)]).toBe(-2);
    const out = wayOut(ways, at(3, 8)) ?? [];
    expect(out.at(-1)).toBe(at(0, 8));
    expectSteps(at(3, 8), out);
    expect(wayOut(ways, at(7, 7))).toBeUndefined();
  });

  it('landet an der Küste, die dem Ziel am nächsten ist, und kommt auf dem kürzesten Weg vom Rand', () => {
    const state = island();
    const landing = landingFor(state, at(10, 6));
    expect(landing).toBeDefined();
    if (!landing) {
      return;
    }
    expect(xy(landing.shore)).toEqual([11, 6]);
    expect(landing.route.at(-1)).toBe(at(12, 6));
    expect(xy(landing.start)).toEqual([15, 6]);
    expectSteps(landing.start, landing.route);
    expect(landing.route.every((tile) => state.world.tiles[tile] === 'water')).toBe(true);
  });

  it('findet keine Landestelle ohne Meer', () => {
    expect(landingFor(grassState(), at(5, 5))).toBeUndefined();
  });
});
