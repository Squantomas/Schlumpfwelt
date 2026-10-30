import { describe, expect, it } from 'vitest';
import { DEFAULT_WORLD_PARAMS, countTerrains, generateIsland } from '../../src/sim/islandGen';
import { TERRAINS, isBuildable, isLand, terrainAt, type Terrain, type World } from '../../src/sim/world';

/** 20 verschiedene Seeds für alle Eigenschaften. */
const SEEDS = Array.from({ length: 20 }, (_, i) => i * 7919 + 1);

const NEIGHBORS_8 = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;

function forEachTile(world: World, visit: (x: number, y: number, terrain: Terrain) => void): void {
  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      visit(x, y, terrainAt(world, x, y));
    }
  }
}

function landTiles(world: World): number {
  return world.tiles.filter(isLand).length;
}

/** Number of separate landmasses (4-neighbour connectivity). */
function landmasses(world: World): number {
  const seen = new Set<number>();
  let count = 0;
  for (let start = 0; start < world.tiles.length; start += 1) {
    if (seen.has(start) || !isLand(world.tiles[start] ?? 'water')) {
      continue;
    }
    count += 1;
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const i = stack.pop() ?? 0;
      const x = i % world.width;
      const y = Math.floor(i / world.width);
      for (const [dx, dy] of [
        [0, -1],
        [-1, 0],
        [1, 0],
        [0, 1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        const ni = ny * world.width + nx;
        if (!seen.has(ni) && isLand(terrainAt(world, nx, ny))) {
          seen.add(ni);
          stack.push(ni);
        }
      }
    }
  }
  return count;
}

/** FNV-1a über die Gelände-Nummern aller Kacheln: ändert sich, sobald sich irgendeine Kachel ändert. */
function mapHash(world: World): string {
  let hash = 0x811c9dc5;
  for (const char of world.tiles.map((terrain) => TERRAINS.indexOf(terrain)).join('')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

describe('generateIsland', () => {
  it('liefert feste Referenzkarten (ändert sich der Generator, ändern sich gespeicherte Inseln – bewusst anpassen)', () => {
    expect(mapHash(generateIsland(1))).toBe('2987b40c');
    expect(mapHash(generateIsland(42))).toBe('51383fca');
    expect(mapHash(generateIsland(12345))).toBe('ae5e039f');
  });

  it('hat die Größe aus world.json (48×48)', () => {
    const world = generateIsland(1);
    expect(world.width).toBe(DEFAULT_WORLD_PARAMS.width);
    expect(world.height).toBe(DEFAULT_WORLD_PARAMS.height);
    expect(world.width).toBe(48);
    expect(world.height).toBe(48);
    expect(world.tiles).toHaveLength(48 * 48);
  });

  it('liefert bei gleichem Seed dieselbe Karte', () => {
    for (const seed of SEEDS) {
      expect(generateIsland(seed)).toEqual(generateIsland(seed));
    }
  });

  it('liefert bei anderen Seeds andere Karten', () => {
    const maps = SEEDS.map((seed) => generateIsland(seed).tiles.join());
    expect(new Set(maps).size).toBe(SEEDS.length);
  });

  it('besteht nur aus JSON-tauglichen Daten', () => {
    const world = generateIsland(5);
    expect(JSON.parse(JSON.stringify(world))).toEqual(world);
  });

  it('verwendet nur bekannte Geländearten', () => {
    for (const seed of SEEDS) {
      for (const terrain of generateIsland(seed).tiles) {
        expect(TERRAINS).toContain(terrain);
      }
    }
  });

  it('hat einen Rand aus Wasser', () => {
    for (const seed of SEEDS) {
      const world = generateIsland(seed);
      const border = DEFAULT_WORLD_PARAMS.borderWater;
      expect(border).toBeGreaterThan(0);
      forEachTile(world, (x, y, terrain) => {
        const edge = Math.min(x, y, world.width - 1 - x, world.height - 1 - y);
        if (edge < border) {
          expect(terrain).toBe('water');
        }
      });
    }
  });

  it('hat Strand zwischen Wasser und allem anderen Land', () => {
    for (const seed of SEEDS) {
      const world = generateIsland(seed);
      forEachTile(world, (x, y, terrain) => {
        if (!isLand(terrain)) {
          return;
        }
        const touchesWater = NEIGHBORS_8.some(([dx, dy]) => terrainAt(world, x + dx, y + dy) === 'water');
        if (touchesWater) {
          expect(terrain, `Seed ${seed}, Kachel ${x},${y}`).toBe('sand');
        }
      });
    }
  });

  it('ist eine einzige Landmasse', () => {
    for (const seed of SEEDS) {
      expect(landmasses(generateIsland(seed)), `Seed ${seed}`).toBe(1);
    }
  });

  it('hat keine Seen im Inneren: alles Wasser hängt am Rand', () => {
    for (const seed of SEEDS) {
      const world = generateIsland(seed);
      const seen = new Set<number>();
      const stack: number[] = [0];
      seen.add(0);
      while (stack.length > 0) {
        const i = stack.pop() ?? 0;
        const x = i % world.width;
        const y = Math.floor(i / world.width);
        for (const [dx, dy] of [
          [0, -1],
          [-1, 0],
          [1, 0],
          [0, 1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          const ni = ny * world.width + nx;
          if (nx >= 0 && ny >= 0 && nx < world.width && ny < world.height && !seen.has(ni) && terrainAt(world, nx, ny) === 'water') {
            seen.add(ni);
            stack.push(ni);
          }
        }
      }
      const waterTiles = world.tiles.filter((terrain) => terrain === 'water').length;
      expect(seen.size, `Seed ${seed}`).toBe(waterTiles);
    }
  });

  it('hat keine einzelnen Landkacheln im Strand: jede Nicht-Strand-Kachel hat mindestens zwei Nachbarn mit festem Land', () => {
    const inland = (world: World, x: number, y: number): boolean => {
      const terrain = terrainAt(world, x, y);
      return terrain !== 'water' && terrain !== 'sand';
    };
    for (const seed of SEEDS) {
      const world = generateIsland(seed);
      forEachTile(world, (x, y) => {
        if (inland(world, x, y)) {
          const neighbors = [
            [0, -1],
            [-1, 0],
            [1, 0],
            [0, 1],
          ].filter(([dx = 0, dy = 0]) => inland(world, x + dx, y + dy)).length;
          expect(neighbors, `Seed ${seed}, Kachel ${x},${y}`).toBeGreaterThanOrEqual(2);
        }
      });
    }
  });

  it('hat genug baubare Wiese: mindestens 35 % des Landes', () => {
    for (const seed of SEEDS) {
      const world = generateIsland(seed);
      const grass = world.tiles.filter(isBuildable).length;
      expect(grass / landTiles(world), `Seed ${seed}`).toBeGreaterThanOrEqual(0.35);
    }
  });

  it('hat Wiese in der Mitte als Platz fürs Dorf', () => {
    for (const seed of SEEDS) {
      const world = generateIsland(seed);
      const radius = DEFAULT_WORLD_PARAMS.village.clearRadius;
      const cx = world.width / 2;
      const cy = world.height / 2;
      let checked = 0;
      forEachTile(world, (x, y, terrain) => {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radius) {
          checked += 1;
          expect(terrain, `Seed ${seed}, Kachel ${x},${y}`).toBe('grass');
        }
      });
      expect(checked).toBeGreaterThan(100);
    }
  });

  it('hat alle fünf Geländearten', () => {
    for (const seed of SEEDS) {
      const counts = countTerrains(generateIsland(seed));
      for (const terrain of TERRAINS) {
        expect(counts[terrain], `Seed ${seed}: ${terrain}`).toBeGreaterThan(0);
      }
    }
  });

  it('hat eine Insel von sinnvoller Größe', () => {
    for (const seed of SEEDS) {
      const land = landTiles(generateIsland(seed));
      expect(land).toBeGreaterThan(600);
      expect(land).toBeLessThan(1500);
    }
  });

  it('nimmt Parameter aus der Konfiguration (kleinere Karte)', () => {
    const world = generateIsland(3, { ...DEFAULT_WORLD_PARAMS, width: 32, height: 24 });
    expect(world.width).toBe(32);
    expect(world.height).toBe(24);
    expect(world.tiles).toHaveLength(32 * 24);
    expect(landmasses(world)).toBe(1);
  });

  it('countTerrains zählt alle Kacheln', () => {
    const world = generateIsland(2);
    const counts = countTerrains(world);
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(world.tiles.length);
  });
});
