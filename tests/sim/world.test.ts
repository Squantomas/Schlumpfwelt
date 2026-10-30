import { describe, expect, it } from 'vitest';
import { TERRAINS, createWorld, inBounds, isBuildable, isLand, landBounds, setTerrain, terrainAt } from '../../src/sim/world';

describe('createWorld', () => {
  it('füllt die Karte mit Wasser', () => {
    const world = createWorld(4, 3);
    expect(world.width).toBe(4);
    expect(world.height).toBe(3);
    expect(world.tiles).toHaveLength(12);
    expect(world.tiles.every((terrain) => terrain === 'water')).toBe(true);
  });

  it('kann mit einem anderen Gelände füllen', () => {
    expect(createWorld(2, 2, 'grass').tiles).toEqual(['grass', 'grass', 'grass', 'grass']);
  });

  it('besteht nur aus JSON-tauglichen Daten', () => {
    const world = createWorld(3, 3, 'sand');
    expect(JSON.parse(JSON.stringify(world))).toEqual(world);
  });
});

describe('terrainAt und setTerrain', () => {
  it('liest und schreibt zeilenweise', () => {
    const world = createWorld(5, 4);
    setTerrain(world, 3, 2, 'rock');
    expect(terrainAt(world, 3, 2)).toBe('rock');
    expect(world.tiles[2 * 5 + 3]).toBe('rock');
    expect(terrainAt(world, 2, 3)).toBe('water');
  });

  it('behandelt alles außerhalb der Karte als Wasser', () => {
    const world = createWorld(3, 3, 'grass');
    expect(terrainAt(world, -1, 0)).toBe('water');
    expect(terrainAt(world, 0, -1)).toBe('water');
    expect(terrainAt(world, 3, 0)).toBe('water');
    expect(terrainAt(world, 0, 3)).toBe('water');
    expect(terrainAt(world, 0.5, 1)).toBe('water');
    expect(terrainAt(world, Number.NaN, 1)).toBe('water');
  });

  it('ignoriert Schreiben außerhalb der Karte', () => {
    const world = createWorld(3, 3);
    setTerrain(world, 3, 0, 'rock');
    setTerrain(world, -1, 0, 'rock');
    expect(world.tiles.every((terrain) => terrain === 'water')).toBe(true);
  });
});

describe('inBounds', () => {
  it('prüft die Ränder', () => {
    const size = { width: 4, height: 2 };
    expect(inBounds(size, 0, 0)).toBe(true);
    expect(inBounds(size, 3, 1)).toBe(true);
    expect(inBounds(size, 4, 1)).toBe(false);
    expect(inBounds(size, 3, 2)).toBe(false);
  });
});

describe('Geländearten', () => {
  it('kennt genau fünf Arten', () => {
    expect([...TERRAINS]).toEqual(['water', 'sand', 'grass', 'forest', 'rock']);
  });

  it('nur Wiese ist baubar', () => {
    expect(TERRAINS.filter(isBuildable)).toEqual(['grass']);
  });

  it('alles außer Wasser ist Land', () => {
    expect(TERRAINS.filter(isLand)).toEqual(['sand', 'grass', 'forest', 'rock']);
  });
});

describe('landBounds', () => {
  it('umschließt alles Land', () => {
    const world = createWorld(10, 8);
    setTerrain(world, 2, 3, 'sand');
    setTerrain(world, 6, 5, 'grass');
    setTerrain(world, 4, 1, 'rock');
    expect(landBounds(world)).toEqual({ minX: 2, minY: 1, maxX: 6, maxY: 5 });
  });

  it('liefert bei reinem Wasser nichts', () => {
    expect(landBounds(createWorld(5, 5))).toBeUndefined();
  });
});
