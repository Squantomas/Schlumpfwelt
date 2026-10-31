import { describe, expect, it } from 'vitest';
import { BUILDING_TYPES, buildingType, typesOf } from '../../src/data/buildings';
import {
  buildingAt,
  buildingAtPoint,
  canPlace,
  checkPlacement,
  footprintTiles,
  isConnected,
  lineTiles,
  unconnectedBuildings,
} from '../../src/sim/buildings';
import { applyCommand, type Command } from '../../src/sim/commands';
import { createInitialState } from '../../src/sim/state';
import { grassState, pathAt, run, setTerrainAt } from './helpers';

describe('canPlace', () => {
  it('erlaubt ein Haus auf freier Wiese', () => {
    expect(canPlace(grassState(), 'house-red', 3, 3)).toBe('ok');
  });

  it.each(['water', 'sand', 'forest', 'rock'] as const)('verbietet ein Haus auf %s mit „terrain“', (terrain) => {
    const state = grassState();
    setTerrainAt(state, 4, 4, terrain);
    // Ein einziges falsches Feld im Grundriss reicht.
    expect(canPlace(state, 'house-red', 3, 3)).toBe('terrain');
    expect(canPlace(state, 'flower', 4, 4)).toBe('terrain');
  });

  it('meldet „outOfMap“, sobald eine Kachel außerhalb der Karte liegt', () => {
    const state = grassState(10);
    expect(canPlace(state, 'house-red', -1, 3)).toBe('outOfMap');
    expect(canPlace(state, 'house-red', 3, -1)).toBe('outOfMap');
    expect(canPlace(state, 'house-red', 9, 3)).toBe('outOfMap');
    expect(canPlace(state, 'house-red', 3, 9)).toBe('outOfMap');
    expect(canPlace(state, 'house-red', 8, 8)).toBe('ok');
    expect(canPlace(state, 'flower', 10, 0)).toBe('outOfMap');
    expect(canPlace(state, 'flower', 1.5, 2)).toBe('outOfMap');
    expect(canPlace(state, 'flower', Number.NaN, 2)).toBe('outOfMap');
  });

  it('meldet „outOfMap“ vor „terrain“', () => {
    const state = grassState(10);
    setTerrainAt(state, 9, 9, 'water');
    expect(canPlace(state, 'house-red', 9, 9)).toBe('outOfMap');
  });

  it('verbietet Überlappung mit einem Gebäude („blocked“), auch nur an einer Ecke', () => {
    const state = run(grassState(), { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 5 });
    expect(canPlace(state, 'house-blue', 5, 5)).toBe('blocked');
    expect(canPlace(state, 'house-blue', 4, 4)).toBe('blocked');
    expect(canPlace(state, 'house-blue', 6, 6)).toBe('blocked');
    expect(canPlace(state, 'flower', 6, 5)).toBe('blocked');
    expect(canPlace(state, 'house-blue', 7, 5)).toBe('ok');
    expect(canPlace(state, 'house-blue', 3, 5)).toBe('ok');
    expect(canPlace(state, 'flower', 5, 7)).toBe('ok');
  });

  it('verbietet Gebäude auf Wegen („blocked“)', () => {
    const state = run(grassState(), { type: 'placePaths', tiles: [{ x: 4, y: 4 }] });
    expect(canPlace(state, 'house-red', 3, 3)).toBe('blocked');
    expect(canPlace(state, 'flower', 4, 4)).toBe('blocked');
  });

  it('erlaubt Wege auf Wiese und Strand, aber nicht auf Wasser, Wald und Fels', () => {
    const state = grassState();
    setTerrainAt(state, 1, 0, 'sand');
    setTerrainAt(state, 2, 0, 'water');
    setTerrainAt(state, 3, 0, 'forest');
    setTerrainAt(state, 4, 0, 'rock');
    expect(canPlace(state, 'path', 0, 0)).toBe('ok');
    expect(canPlace(state, 'path', 1, 0)).toBe('ok');
    expect(canPlace(state, 'path', 2, 0)).toBe('terrain');
    expect(canPlace(state, 'path', 3, 0)).toBe('terrain');
    expect(canPlace(state, 'path', 4, 0)).toBe('terrain');
    expect(canPlace(state, 'path', -1, 0)).toBe('outOfMap');
  });

  it('verbietet Wege unter Gebäuden und doppelte Wege („blocked“)', () => {
    const state = run(
      grassState(),
      { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 5 },
      { type: 'placePaths', tiles: [{ x: 2, y: 2 }] },
    );
    expect(canPlace(state, 'path', 6, 6)).toBe('blocked');
    expect(canPlace(state, 'path', 2, 2)).toBe('blocked');
  });

  it('lässt ein Gebäude beim Verschieben sich selbst überlappen, wenn „ignoreId“ gesetzt ist', () => {
    const state = run(grassState(), { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 5 });
    const id = state.buildings[0]?.id ?? -1;
    expect(canPlace(state, 'house-red', 6, 5)).toBe('blocked');
    expect(canPlace(state, 'house-red', 6, 5, id)).toBe('ok');
  });

  it('meldet unbekannte Typen als „blocked“', () => {
    expect(canPlace(grassState(), 'castle', 3, 3)).toBe('blocked');
  });

  it('ändert den Zustand nicht', () => {
    const state = grassState();
    const before = structuredClone(state);
    canPlace(state, 'house-red', 3, 3);
    expect(state).toEqual(before);
  });
});

describe('checkPlacement', () => {
  it('nennt den Untergrund, der im Weg ist', () => {
    const state = grassState();
    setTerrainAt(state, 4, 4, 'water');
    setTerrainAt(state, 5, 4, 'forest');
    expect(checkPlacement(state, 'flower', 4, 4)).toEqual({ result: 'terrain', terrain: 'water' });
    expect(checkPlacement(state, 'flower', 5, 4)).toEqual({ result: 'terrain', terrain: 'forest' });
    expect(checkPlacement(state, 'house-red', 4, 3)).toEqual({ result: 'terrain', terrain: 'water' });
    expect(checkPlacement(state, 'flower', 1, 1)).toEqual({ result: 'ok' });
    expect(checkPlacement(state, 'house-red', 15, 15)).toEqual({ result: 'outOfMap' });
  });
});

describe('buildingAtPoint (Tipp auf die Grafik)', () => {
  const T = 64;

  it('trifft ein Haus auch auf dem Dach, über dem Grundriss', () => {
    const state = run(grassState(), { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 5 });
    // Grundriss 320…448 × 320…448, Dach ragt 84 px darüber (bis y = 236).
    expect(buildingAtPoint(state, 6 * T, 5 * T - 40, T)?.id).toBe(1);
    expect(buildingAtPoint(state, 6 * T, 5 * T - 83, T)?.id).toBe(1);
    expect(buildingAtPoint(state, 6 * T, 5 * T - 85, T)).toBeUndefined();
    expect(buildingAtPoint(state, 6 * T, 7 * T + 1, T)).toBeUndefined();
    expect(buildingAtPoint(state, 5 * T - 1, 6 * T, T)).toBeUndefined();
    expect(buildingAtPoint(state, 7 * T + 1, 6 * T, T)).toBeUndefined();
  });

  it('trifft das Dach vor einem Weg auf der Kachel dahinter', () => {
    const state = run(grassState(), { type: 'placePaths', tiles: [{ x: 5, y: 4 }] }, { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 5 });
    expect(buildingAt(state, 5, 4)).toBeUndefined();
    expect(buildingAtPoint(state, 5.5 * T, 4.6 * T, T)?.id).toBe(1);
  });

  it('nimmt bei überlappenden Grafiken das vordere Gebäude', () => {
    const state = run(
      grassState(),
      { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 3 },
      { type: 'placeBuilding', buildingType: 'house-blue', x: 5, y: 5 },
    );
    // Das hintere Haus (id 1) ragt nicht in den Grundriss des vorderen, aber das vordere Dach über das hintere.
    expect(buildingAtPoint(state, 6 * T, 5 * T - 20, T)?.id).toBe(2);
    expect(buildingAtPoint(state, 6 * T, 3.5 * T, T)?.id).toBe(1);
  });

  it('trifft Deko nur an ihrer Grafik und nichts auf leerer Wiese', () => {
    const state = run(grassState(), { type: 'placeBuilding', buildingType: 'lantern', x: 3, y: 3 });
    expect(buildingAtPoint(state, 3.5 * T, 3 * T - 30, T)?.id).toBe(1);
    expect(buildingAtPoint(state, 3.5 * T, 3 * T - 50, T)).toBeUndefined();
    expect(buildingAtPoint(state, 9 * T, 9 * T, T)).toBeUndefined();
  });
});

describe('Wege im Zustand', () => {
  it('stehen sortiert und ohne Doppelte in `paths`', () => {
    const state = run(
      grassState(),
      { type: 'placePaths', tiles: [{ x: 5, y: 5 }, { x: 1, y: 1 }, { x: 9, y: 0 }, { x: 5, y: 5 }, { x: 2, y: 7 }] },
      { type: 'placePaths', tiles: [{ x: 0, y: 3 }] },
      { type: 'demolish', x: 1, y: 1 },
    );
    expect(state.paths).toEqual([9, 3 * 16, 5 * 16 + 5, 7 * 16 + 2].sort((a, b) => a - b));
    expect(JSON.parse(JSON.stringify(state.paths))).toEqual(state.paths);
  });
});

describe('Bautypen (buildings.json)', () => {
  it('enthält den Startumfang', () => {
    const ids = BUILDING_TYPES.map((type) => type.id);
    expect(ids).toEqual(
      expect.arrayContaining(['path', 'house-red', 'house-blue', 'house-yellow', 'flower', 'bush', 'fence', 'bench', 'lantern', 'fountain']),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('hat Pilzhäuser mit 2×2, Brunnen mit 2×2 und sonstige Deko mit 1×1', () => {
    for (const type of typesOf('house')) {
      expect(type.footprint).toEqual({ w: 2, h: 2 });
      expect(type.needsPath).toBe(true);
    }
    expect(buildingType('fountain')?.footprint).toEqual({ w: 2, h: 2 });
    for (const id of ['flower', 'bush', 'fence', 'bench', 'lantern']) {
      expect(buildingType(id)?.footprint).toEqual({ w: 1, h: 1 });
      expect(buildingType(id)?.needsPath).toBe(false);
    }
    expect(typesOf('house')).toHaveLength(3);
    expect(typesOf('deco')).toHaveLength(6);
  });

  it('erlaubt Gebäude nur auf Wiese und Wege auf Wiese und Strand', () => {
    for (const type of BUILDING_TYPES) {
      expect(type.terrains).toEqual(type.category === 'path' ? ['grass', 'sand'] : ['grass']);
    }
  });
});

describe('footprintTiles und buildingAt', () => {
  it('liefert alle Kacheln des Grundrisses', () => {
    const type = buildingType('house-red');
    expect(type && footprintTiles(type, 2, 3)).toEqual([
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 2, y: 4 },
      { x: 3, y: 4 },
    ]);
  });

  it('findet ein Gebäude über jede seiner Kacheln', () => {
    const state = run(grassState(), { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 5 });
    for (const [x, y] of [[5, 5], [6, 5], [5, 6], [6, 6]] as const) {
      expect(buildingAt(state, x, y)?.type).toBe('house-red');
    }
    expect(buildingAt(state, 7, 5)).toBeUndefined();
    expect(buildingAt(state, 4, 4)).toBeUndefined();
  });
});

describe('Befehl placeBuilding', () => {
  it('setzt ein Gebäude mit eindeutiger id und zählt die Revision hoch', () => {
    const state = grassState();
    run(
      state,
      { type: 'placeBuilding', buildingType: 'house-red', x: 2, y: 2 },
      { type: 'placeBuilding', buildingType: 'flower', x: 8, y: 8 },
    );
    expect(state.buildings).toEqual([
      { id: 1, type: 'house-red', x: 2, y: 2 },
      { id: 2, type: 'flower', x: 8, y: 8 },
    ]);
    expect(state.revision).toBe(2);
  });

  it('vergibt ids nie zweimal, auch nach dem Abreißen', () => {
    const state = run(
      grassState(),
      { type: 'placeBuilding', buildingType: 'flower', x: 1, y: 1 },
      { type: 'demolish', x: 1, y: 1 },
      { type: 'placeBuilding', buildingType: 'flower', x: 1, y: 1 },
    );
    expect(state.buildings.map((b) => b.id)).toEqual([2]);
  });

  it('ignoriert verbotene Plätze und ändert dabei nichts', () => {
    const state = grassState(10);
    setTerrainAt(state, 0, 0, 'water');
    run(state, { type: 'placeBuilding', buildingType: 'flower', x: 5, y: 5 });
    const before = structuredClone(state);
    run(
      state,
      { type: 'placeBuilding', buildingType: 'flower', x: 0, y: 0 },
      { type: 'placeBuilding', buildingType: 'flower', x: 5, y: 5 },
      { type: 'placeBuilding', buildingType: 'house-red', x: 9, y: 9 },
    );
    expect(state).toEqual(before);
  });

  it('baut keine Wege über „placeBuilding“', () => {
    const state = run(grassState(), { type: 'placeBuilding', buildingType: 'path', x: 2, y: 2 });
    expect(state.buildings).toEqual([]);
    expect(state.revision).toBe(0);
  });
});

describe('Befehl placePaths', () => {
  it('legt eine L-Linie', () => {
    const state = run(grassState(), { type: 'placePaths', tiles: lineTiles({ x: 2, y: 2 }, { x: 5, y: 4 }) });
    const laid = state.paths.length;
    expect(laid).toBe(6);
    for (const [x, y] of [[2, 2], [3, 2], [4, 2], [5, 2], [5, 3], [5, 4]] as const) {
      expect(pathAt(state, x, y)).toBe(true);
    }
    expect(state.revision).toBe(1);
  });

  it('überspringt verbotene Kacheln und legt die erlaubten', () => {
    const state = grassState();
    setTerrainAt(state, 3, 2, 'water');
    run(
      state,
      { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 5 },
      { type: 'placePaths', tiles: [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 5, y: 5 }, { x: -1, y: 0 }, { x: 4, y: 2 }] },
    );
    expect(pathAt(state, 2, 2)).toBe(true);
    expect(pathAt(state, 3, 2)).toBe(false);
    expect(pathAt(state, 5, 5)).toBe(false);
    expect(pathAt(state, 4, 2)).toBe(true);
    expect(state.paths).toHaveLength(2);
  });

  it('ändert die Revision nicht, wenn nichts gelegt wird (leer, doppelt, nur verbotene Kacheln)', () => {
    const state = run(grassState(), { type: 'placePaths', tiles: [{ x: 2, y: 2 }] });
    const revision = state.revision;
    run(state, { type: 'placePaths', tiles: [] }, { type: 'placePaths', tiles: [{ x: 2, y: 2 }] }, { type: 'placePaths', tiles: [{ x: 99, y: 2 }] });
    expect(state.revision).toBe(revision);
  });

  it('bleibt bei doppelten Kacheln in der Liste bei einem Weg', () => {
    const state = run(grassState(), { type: 'placePaths', tiles: [{ x: 2, y: 2 }, { x: 2, y: 2 }] });
    expect(state.paths).toHaveLength(1);
  });
});

describe('lineTiles', () => {
  it('liefert bei gleichem Start und Ziel eine Kachel', () => {
    expect(lineTiles({ x: 3, y: 3 }, { x: 3, y: 3 })).toEqual([{ x: 3, y: 3 }]);
  });

  it('läuft erst waagerecht, dann senkrecht – oder umgekehrt', () => {
    expect(lineTiles({ x: 1, y: 1 }, { x: 3, y: 2 })).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 2 },
    ]);
    expect(lineTiles({ x: 1, y: 1 }, { x: 3, y: 2 }, false)).toEqual([
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ]);
  });

  it('funktioniert auch nach links und oben, ohne Kachel doppelt', () => {
    const tiles = lineTiles({ x: 4, y: 4 }, { x: 2, y: 1 });
    expect(tiles[0]).toEqual({ x: 4, y: 4 });
    expect(tiles[tiles.length - 1]).toEqual({ x: 2, y: 1 });
    expect(tiles).toHaveLength(6);
    expect(new Set(tiles.map((t) => `${String(t.x)},${String(t.y)}`)).size).toBe(tiles.length);
  });

  it('liefert für eine gerade Linie nur diese Linie', () => {
    expect(lineTiles({ x: 0, y: 5 }, { x: 3, y: 5 })).toHaveLength(4);
    expect(lineTiles({ x: 0, y: 5 }, { x: 0, y: 2 }, false)).toHaveLength(4);
  });
});

describe('Befehl moveBuilding', () => {
  const house = (state: ReturnType<typeof grassState>): number => state.buildings[0]?.id ?? -1;

  it('verschiebt ein Gebäude auf einen freien Platz', () => {
    const state = run(grassState(), { type: 'placeBuilding', buildingType: 'house-red', x: 2, y: 2 });
    run(state, { type: 'moveBuilding', id: house(state), x: 8, y: 9 });
    expect(state.buildings).toEqual([{ id: 1, type: 'house-red', x: 8, y: 9 }]);
    expect(state.revision).toBe(2);
  });

  it('erlaubt, sich selbst teilweise zu überlappen', () => {
    const state = run(grassState(), { type: 'placeBuilding', buildingType: 'house-red', x: 2, y: 2 });
    run(state, { type: 'moveBuilding', id: house(state), x: 3, y: 3 });
    expect(state.buildings[0]).toMatchObject({ x: 3, y: 3 });
  });

  it('verbietet das Verschieben auf andere Gebäude und Wege', () => {
    const state = run(
      grassState(),
      { type: 'placeBuilding', buildingType: 'house-red', x: 2, y: 2 },
      { type: 'placeBuilding', buildingType: 'house-blue', x: 6, y: 2 },
      { type: 'placePaths', tiles: [{ x: 2, y: 8 }] },
    );
    const before = structuredClone(state);
    run(
      state,
      { type: 'moveBuilding', id: 1, x: 5, y: 3 },
      { type: 'moveBuilding', id: 1, x: 7, y: 2 },
      { type: 'moveBuilding', id: 1, x: 1, y: 7 },
    );
    expect(state).toEqual(before);
  });

  it('verbietet das Verschieben auf Wasser und aus der Karte', () => {
    const state = grassState(10);
    setTerrainAt(state, 7, 7, 'water');
    run(state, { type: 'placeBuilding', buildingType: 'flower', x: 1, y: 1 });
    const before = structuredClone(state);
    run(state, { type: 'moveBuilding', id: 1, x: 7, y: 7 }, { type: 'moveBuilding', id: 1, x: -1, y: 1 }, { type: 'moveBuilding', id: 1, x: 10, y: 1 });
    expect(state).toEqual(before);
  });

  it('ändert nichts, wenn das Ziel der alte Platz ist oder die id fehlt', () => {
    const state = run(grassState(), { type: 'placeBuilding', buildingType: 'house-red', x: 2, y: 2 });
    const before = structuredClone(state);
    run(state, { type: 'moveBuilding', id: 1, x: 2, y: 2 }, { type: 'moveBuilding', id: 77, x: 5, y: 5 });
    expect(state).toEqual(before);
  });
});

describe('Befehl demolish', () => {
  it('reißt ein Gebäude über jede seiner Kacheln ab', () => {
    for (const [x, y] of [[5, 5], [6, 5], [5, 6], [6, 6]] as const) {
      const state = run(grassState(), { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 5 }, { type: 'demolish', x, y });
      expect(state.buildings).toEqual([]);
      expect(state.revision).toBe(2);
    }
  });

  it('reißt eine Weg-Kachel ab und lässt die anderen stehen', () => {
    const state = run(grassState(), { type: 'placePaths', tiles: [{ x: 1, y: 1 }, { x: 2, y: 1 }] }, { type: 'demolish', x: 1, y: 1 });
    expect(pathAt(state, 1, 1)).toBe(false);
    expect(pathAt(state, 2, 1)).toBe(true);
  });

  it('ignoriert leere Kacheln und Kacheln außerhalb der Karte', () => {
    const state = run(grassState(), { type: 'placeBuilding', buildingType: 'flower', x: 1, y: 1 });
    const before = structuredClone(state);
    run(state, { type: 'demolish', x: 5, y: 5 }, { type: 'demolish', x: -3, y: 5 }, { type: 'demolish', x: 99, y: 99 }, { type: 'demolish', x: 1.5, y: 1 });
    expect(state).toEqual(before);
  });

  it('gibt den Platz wieder frei', () => {
    const state = run(grassState(), { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 5 }, { type: 'demolish', x: 6, y: 6 });
    expect(canPlace(state, 'house-blue', 5, 5)).toBe('ok');
  });
});

describe('Wegeanschluss', () => {
  const houseState = (): ReturnType<typeof grassState> =>
    run(grassState(), { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 5 });

  it('ist ohne Weg nicht gegeben', () => {
    const state = houseState();
    expect(isConnected(state, 1)).toBe(false);
    expect(unconnectedBuildings(state)).toEqual([1]);
  });

  it.each([
    ['oben links', 5, 4],
    ['oben rechts', 6, 4],
    ['unten links', 5, 7],
    ['unten rechts', 6, 7],
    ['links oben', 4, 5],
    ['links unten', 4, 6],
    ['rechts oben', 7, 5],
    ['rechts unten', 7, 6],
  ])('ist gegeben mit einem Weg an der Seite: %s', (_name, x, y) => {
    const state = run(houseState(), { type: 'placePaths', tiles: [{ x, y }] });
    expect(isConnected(state, 1)).toBe(true);
    expect(unconnectedBuildings(state)).toEqual([]);
  });

  it('zählt diagonale Nachbarn nicht', () => {
    const state = run(houseState(), { type: 'placePaths', tiles: [{ x: 4, y: 4 }, { x: 7, y: 4 }, { x: 4, y: 7 }, { x: 7, y: 7 }] });
    expect(isConnected(state, 1)).toBe(false);
  });

  it('zählt Wege in zweiter Reihe nicht', () => {
    const state = run(houseState(), { type: 'placePaths', tiles: [{ x: 5, y: 3 }, { x: 3, y: 5 }] });
    expect(isConnected(state, 1)).toBe(false);
  });

  it('entfällt, wenn der angrenzende Weg abgerissen wird', () => {
    const state = run(houseState(), { type: 'placePaths', tiles: [{ x: 5, y: 7 }, { x: 6, y: 7 }] }, { type: 'demolish', x: 5, y: 7 });
    expect(isConnected(state, 1)).toBe(true);
    run(state, { type: 'demolish', x: 6, y: 7 });
    expect(isConnected(state, 1)).toBe(false);
  });

  it('wird nach dem Verschieben neu bewertet', () => {
    const state = run(houseState(), { type: 'placePaths', tiles: [{ x: 5, y: 7 }] });
    expect(isConnected(state, 1)).toBe(true);
    run(state, { type: 'moveBuilding', id: 1, x: 10, y: 10 });
    expect(isConnected(state, 1)).toBe(false);
    run(state, { type: 'moveBuilding', id: 1, x: 5, y: 5 });
    expect(isConnected(state, 1)).toBe(true);
  });

  it('wird beim Setzen eines Hauses neben einen vorhandenen Weg sofort erkannt', () => {
    const state = run(grassState(), { type: 'placePaths', tiles: [{ x: 3, y: 3 }] }, { type: 'placeBuilding', buildingType: 'house-blue', x: 4, y: 3 });
    expect(isConnected(state, 1)).toBe(true);
  });

  it('meldet Deko nicht als unverbunden (sie braucht keinen Weg)', () => {
    const state = run(grassState(), { type: 'placeBuilding', buildingType: 'flower', x: 2, y: 2 });
    expect(unconnectedBuildings(state)).toEqual([]);
  });

  it('ist für unbekannte Gebäude falsch', () => {
    expect(isConnected(houseState(), 42)).toBe(false);
  });
});

describe('ungültige Befehle', () => {
  it('stürzen nicht ab und ändern nichts', () => {
    const state = run(grassState(), { type: 'placeBuilding', buildingType: 'house-red', x: 2, y: 2 }, { type: 'placePaths', tiles: [{ x: 5, y: 5 }] });
    const before = structuredClone(state);
    const junk = [
      { type: 'placeBuilding', buildingType: 'castle', x: 1, y: 1 },
      { type: 'placeBuilding', buildingType: 'flower', x: Number.NaN, y: 1 },
      { type: 'placeBuilding', buildingType: 'flower', x: 1, y: Number.POSITIVE_INFINITY },
      { type: 'placeBuilding', buildingType: undefined, x: 1, y: 1 },
      { type: 'placeBuilding', buildingType: 'constructor', x: 1, y: 1 },
      { type: 'placeBuilding', buildingType: '__proto__', x: 1, y: 1 },
      { type: 'placePaths', tiles: undefined },
      { type: 'placePaths', tiles: [null, undefined, {}, { x: 'a', y: 1 }, { x: Number.NaN, y: 0 }, { x: 1.5, y: 2 }] },
      { type: 'moveBuilding', id: Number.NaN, x: 1, y: 1 },
      { type: 'moveBuilding', id: 1, x: Number.NaN, y: 1 },
      { type: 'moveBuilding', id: -5, x: 1, y: 1 },
      { type: 'demolish', x: Number.NaN, y: Number.NaN },
      { type: 'demolish' },
    ] as unknown as Command[];
    for (const command of junk) {
      expect(() => {
        applyCommand(state, command);
      }).not.toThrow();
    }
    expect(state).toEqual(before);
  });
});

describe('Zustand und Determinismus', () => {
  const script: Command[] = [
    { type: 'placePaths', tiles: lineTiles({ x: 2, y: 8 }, { x: 9, y: 11 }) },
    { type: 'placeBuilding', buildingType: 'house-blue', x: 3, y: 9 },
    { type: 'placeBuilding', buildingType: 'fountain', x: 6, y: 5 },
    { type: 'placeBuilding', buildingType: 'bench', x: 6, y: 7 },
    { type: 'moveBuilding', id: 1, x: 3, y: 4 },
    { type: 'demolish', x: 4, y: 8 },
    { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 4 },
  ];

  it('ergibt bei gleicher Befehlsfolge genau denselben Zustand', () => {
    const first = run(grassState(), ...script);
    const second = run(grassState(), ...script);
    expect(first).toEqual(second);
    expect(first.buildings.length).toBeGreaterThan(0);
  });

  it('bleibt komplett als JSON speicherbar', () => {
    const state = run(grassState(), ...script);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('beginnt mit einem Startdorf: ein angeschlossenes Haus plus Deko, bei jedem Seed', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const state = createInitialState(seed);
      expect(state.revision, `Seed ${String(seed)}`).toBe(0);
      const houses = state.buildings.filter((b) => b.type.startsWith('house'));
      expect(houses, `Seed ${String(seed)}`).toHaveLength(1);
      expect(state.buildings.length, `Seed ${String(seed)}`).toBeGreaterThanOrEqual(3);
      expect(unconnectedBuildings(state), `Seed ${String(seed)}`).toEqual([]);
      expect(state.paths.length).toBeGreaterThan(0);
    }
  });

  it('hat ein Startdorf, das sich nicht selbst überlappt', () => {
    const state = createInitialState(7);
    for (const building of state.buildings) {
      expect(canPlace(state, building.type, building.x, building.y, building.id)).toBe('ok');
    }
  });
});
