import { describe, expect, it } from 'vitest';
import type { Tile } from '../../src/sim/buildings';
import { MAX_ROUTE_LENGTH, findRoute } from '../../src/sim/route';
import { lineTiles } from '../../src/sim/buildings';
import { grassState, run, setTerrainAt } from './helpers';

const key = (tile: Tile): string => `${String(tile.x)},${String(tile.y)}`;

function turns(tiles: readonly Tile[]): number {
  let count = 0;
  for (let i = 2; i < tiles.length; i += 1) {
    const a = tiles[i - 2];
    const b = tiles[i - 1];
    const c = tiles[i];
    if (a && b && c && b.x - a.x !== c.x - b.x) {
      count += 1;
    }
  }
  return count;
}

function expectConnected(tiles: readonly Tile[]): void {
  for (let i = 1; i < tiles.length; i += 1) {
    const a = tiles[i - 1];
    const b = tiles[i];
    expect(a && b && Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
  }
}

describe('findRoute', () => {
  it('liefert für gleichen Start und Ziel eine Kachel', () => {
    expect(findRoute(grassState(), { x: 3, y: 3 }, { x: 3, y: 3 })).toEqual({ ok: true, tiles: [{ x: 3, y: 3 }] });
  });

  it('läuft auf freier Wiese gerade', () => {
    const result = findRoute(grassState(), { x: 2, y: 4 }, { x: 8, y: 4 });
    expect(result.ok && result.tiles).toHaveLength(7);
    expect(result.ok && turns(result.tiles)).toBe(0);
  });

  it('macht auf freier Wiese genau eine Kurve (L) statt einer Treppe', () => {
    const result = findRoute(grassState(), { x: 2, y: 2 }, { x: 9, y: 6 });
    expect(result.ok && result.tiles).toHaveLength(7 + 4 + 1);
    expect(result.ok && turns(result.tiles)).toBe(1);
    expect(result.ok && result.tiles[0]).toEqual({ x: 2, y: 2 });
    expect(result.ok && result.tiles[result.tiles.length - 1]).toEqual({ x: 9, y: 6 });
    if (result.ok) {
      expectConnected(result.tiles);
    }
  });

  it('läuft um ein Haus herum, ohne darauf zu treten', () => {
    const state = run(grassState(), { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 4 });
    const result = findRoute(state, { x: 2, y: 5 }, { x: 9, y: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expectConnected(result.tiles);
      const keys = new Set(result.tiles.map(key));
      for (const covered of ['5,4', '6,4', '5,5', '6,5']) {
        expect(keys.has(covered)).toBe(false);
      }
      // Kurzer Umweg: um das Haus herum, nicht quer über die Insel.
      expect(result.tiles.length).toBeLessThanOrEqual(11);
    }
  });

  it('meidet Wasser, Wald und Fels', () => {
    const state = grassState();
    setTerrainAt(state, 5, 3, 'water');
    setTerrainAt(state, 5, 4, 'forest');
    setTerrainAt(state, 5, 5, 'rock');
    const result = findRoute(state, { x: 2, y: 4 }, { x: 9, y: 4 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const tile of result.tiles) {
        expect(state.world.tiles[tile.y * state.world.width + tile.x]).toBe('grass');
      }
    }
  });

  it('läuft über Strand', () => {
    const state = grassState();
    for (let x = 0; x < 16; x += 1) {
      setTerrainAt(state, x, 4, 'sand');
    }
    const result = findRoute(state, { x: 1, y: 4 }, { x: 12, y: 4 });
    expect(result.ok && result.tiles).toHaveLength(12);
  });

  it('nutzt vorhandene Wegkacheln, statt neu zu bauen', () => {
    const state = run(grassState(), { type: 'placePaths', tiles: [3, 4, 5, 6, 7].map((x) => ({ x, y: 4 })) });
    // Hindernis, das den Umweg über Wiese länger macht als der über den Weg.
    const result = findRoute(state, { x: 3, y: 4 }, { x: 7, y: 4 });
    expect(result.ok && result.tiles.map(key)).toEqual(['3,4', '4,4', '5,4', '6,4', '7,4']);
  });

  it('nimmt für den Anschluss an einen Weg lieber den vorhandenen Weg', () => {
    const state = run(grassState(), { type: 'placePaths', tiles: [2, 3, 4, 5, 6, 7, 8, 9].map((x) => ({ x, y: 8 })) });
    const result = findRoute(state, { x: 2, y: 3 }, { x: 9, y: 8 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const onExisting = result.tiles.filter((tile) => tile.y === 8).length;
      expect(onExisting).toBeGreaterThanOrEqual(2);
      expect(turns(result.tiles)).toBeLessThanOrEqual(2);
    }
  });

  it('meldet fehlende Route, wenn das Ziel eingemauert ist', () => {
    const state = grassState();
    for (const [x, y] of [[5, 4], [7, 4], [6, 3], [6, 5]] as const) {
      setTerrainAt(state, x, y, 'water');
    }
    expect(findRoute(state, { x: 1, y: 1 }, { x: 6, y: 4 })).toEqual({ ok: false, reason: 'noRoute' });
  });

  it('meldet blockierten Start und blockiertes Ziel', () => {
    const state = run(grassState(), { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 5 });
    setTerrainAt(state, 1, 1, 'water');
    expect(findRoute(state, { x: 1, y: 1 }, { x: 3, y: 3 })).toEqual({ ok: false, reason: 'startBlocked' });
    expect(findRoute(state, { x: 3, y: 3 }, { x: 5, y: 5 })).toEqual({ ok: false, reason: 'endBlocked' });
    expect(findRoute(state, { x: 3, y: 3 }, { x: -1, y: 3 })).toEqual({ ok: false, reason: 'endBlocked' });
  });

  it('meldet zu lange Routen', () => {
    const state = grassState(60);
    expect(findRoute(state, { x: 0, y: 0 }, { x: 25, y: 20 })).toEqual({ ok: false, reason: 'tooLong' });
    expect(findRoute(state, { x: 0, y: 0 }, { x: MAX_ROUTE_LENGTH - 1, y: 0 }).ok).toBe(true);
    expect(findRoute(state, { x: 0, y: 0 }, { x: MAX_ROUTE_LENGTH, y: 0 })).toEqual({ ok: false, reason: 'tooLong' });
  });

  it('ist deterministisch und ändert den Zustand nicht', () => {
    const state = run(grassState(), { type: 'placeBuilding', buildingType: 'fountain', x: 6, y: 5 });
    const before = structuredClone(state);
    const first = findRoute(state, { x: 2, y: 2 }, { x: 12, y: 10 });
    const second = findRoute(state, { x: 2, y: 2 }, { x: 12, y: 10 });
    expect(first).toEqual(second);
    expect(state).toEqual(before);
  });

  it('geht nie diagonal und kommt nie zweimal auf dieselbe Kachel', () => {
    const state = run(grassState(), { type: 'placeBuilding', buildingType: 'house-blue', x: 4, y: 4 }, { type: 'placeBuilding', buildingType: 'fountain', x: 8, y: 7 });
    const result = findRoute(state, { x: 1, y: 1 }, { x: 14, y: 12 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expectConnected(result.tiles);
      expect(new Set(result.tiles.map(key)).size).toBe(result.tiles.length);
    }
  });

  it('nimmt die gerade Linie, auch wenn ein langer Umweg über alte Wege „billiger“ wäre (U-Fall)', () => {
    const state = grassState(30);
    const u = [...lineTiles({ x: 5, y: 10 }, { x: 25, y: 10 }), ...lineTiles({ x: 25, y: 10 }, { x: 25, y: 20 }, false), ...lineTiles({ x: 25, y: 20 }, { x: 5, y: 20 })];
    run(state, { type: 'placePaths', tiles: u });
    const result = findRoute(state, { x: 5, y: 11 }, { x: 5, y: 19 });
    expect(result.ok && result.tiles.map(key)).toEqual(['5,11', '5,12', '5,13', '5,14', '5,15', '5,16', '5,17', '5,18', '5,19']);
  });

  it('meldet „zu lang“ nur, wenn es einen Weg gibt, und „keine Route“, wenn nicht', () => {
    const state = grassState(60);
    for (let y = 0; y < 60; y += 1) {
      setTerrainAt(state, 30, y, 'water');
    }
    expect(findRoute(state, { x: 2, y: 2 }, { x: 55, y: 2 })).toEqual({ ok: false, reason: 'noRoute' });
    expect(findRoute(state, { x: 2, y: 2 }, { x: 25, y: 40 })).toEqual({ ok: false, reason: 'tooLong' });
  });

  it('findet einen Weg mit genau der Höchstlänge und keinen mit einer Kachel mehr, auch mit Umweg', () => {
    const state = run(grassState(60), { type: 'placeBuilding', buildingType: 'house-red', x: 10, y: 5 });
    // Das Haus liegt im Weg: der Umweg kostet 2 Kacheln.
    const around = findRoute(state, { x: 8, y: 5 }, { x: 12, y: 5 }, 9);
    expect(around.ok && around.tiles.length).toBeLessThanOrEqual(9);
    expect(findRoute(state, { x: 8, y: 5 }, { x: 12, y: 5 }, 6)).toEqual({ ok: false, reason: 'tooLong' });
  });

  it('ist schnell: im Mittel unter 10 ms pro Aufruf (zu lang, kurz, ohne Route)', () => {
    const state = run(grassState(48), { type: 'placeBuilding', buildingType: 'fountain', x: 12, y: 12 });
    for (let x = 0; x < 48; x += 1) {
      setTerrainAt(state, x, 40, 'water');
    }
    findRoute(state, { x: 2, y: 2 }, { x: 5, y: 5 }); // Puffer anlegen, zählt nicht
    const cases: [Tile, Tile][] = [
      [{ x: 2, y: 2 }, { x: 45, y: 30 }], // zu lang
      [{ x: 2, y: 2 }, { x: 20, y: 18 }], // lange Suche mit Hindernis
      [{ x: 2, y: 2 }, { x: 10, y: 45 }], // keine Route (Wasserwand)
      [{ x: 14, y: 10 }, { x: 14, y: 16 }], // kurz, um den Brunnen
    ];
    const started = performance.now();
    for (let i = 0; i < 20; i += 1) {
      const [from, to] = cases[i % cases.length] ?? [{ x: 2, y: 2 }, { x: 5, y: 5 }];
      findRoute(state, from, to);
    }
    // Großzügige Marge, damit langsame CI-Rechner nicht flackern (gemessen: etwa 1 ms).
    expect((performance.now() - started) / 20).toBeLessThan(10);
  });

  it('liefert dasselbe Ergebnis, egal wie oft und womit vorher gesucht wurde (wiederverwendete Puffer)', () => {
    const state = run(grassState(30), { type: 'placeBuilding', buildingType: 'house-red', x: 10, y: 10 });
    const first = findRoute(state, { x: 2, y: 2 }, { x: 20, y: 18 });
    findRoute(state, { x: 25, y: 3 }, { x: 4, y: 25 });
    findRoute(state, { x: 1, y: 1 }, { x: 28, y: 28 });
    expect(findRoute(state, { x: 2, y: 2 }, { x: 20, y: 18 })).toEqual(first);
  });
});
