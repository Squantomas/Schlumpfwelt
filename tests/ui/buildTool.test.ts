import { describe, expect, it } from 'vitest';
import { applyCommand, type Command } from '../../src/sim/commands';
import type { SimState } from '../../src/sim/state';
import { t } from '../../src/data/texts';
import { BuildTool, TOOLS, TOOL_CATEGORIES, anchorFor, problemHint, type RefundInfo } from '../../src/ui/buildTool';
import { buildConnected, fillTerrain, grassState, pathAt, run, setStore, setTerrainAt } from '../sim/helpers';

/** A tool on a grass map whose commands are applied right away (the real game applies them at the next tick). */
function setup(state: SimState = grassState()): { state: SimState; tool: BuildTool; sent: Command[] } {
  const sent: Command[] = [];
  const tool = new BuildTool(
    () => state,
    (command) => {
      sent.push(command);
      applyCommand(state, command);
    },
  );
  return { state, tool, sent };
}

describe('Werkzeuge', () => {
  it('startet im Anschauen ohne Hinweis und ohne Vorschau', () => {
    const { tool } = setup();
    expect(tool.tool).toBe('view');
    expect(tool.hint).toBeUndefined();
    expect(tool.preview()).toEqual({ kind: 'none' });
    expect(tool.hasPreview).toBe(false);
  });

  it('schaltet ein Werkzeug ein; erneutes Antippen lässt es an (nur exitTool beendet es)', () => {
    const { tool } = setup();
    for (const id of TOOLS) {
      tool.selectTool(id);
      expect(tool.tool).toBe(id);
      tool.selectTool(id);
      expect(tool.tool).toBe(id);
      tool.exitTool();
      expect(tool.tool).toBe('view');
    }
  });

  it('behält beim erneuten Antippen des Werkzeugs die Vorschau', () => {
    const { tool } = setup();
    tool.selectTool('deco');
    tool.tap({ x: 3, y: 3 });
    tool.selectTool('deco');
    expect(tool.hasPreview).toBe(true);
  });

  it('ordnet Werkzeuge ihren Kategorien zu (datengetrieben)', () => {
    expect(TOOL_CATEGORIES).toEqual({ house: 'house', building: 'production', deco: 'deco' });
    const { tool } = setup();
    for (const id of TOOLS) {
      tool.selectTool(id);
      expect(tool.variantCategory).toBe(TOOL_CATEGORIES[id]);
      expect(tool.variant !== undefined).toBe(TOOL_CATEGORIES[id] !== undefined);
    }
  });

  it('wechselt direkt zwischen Werkzeugen und verwirft dabei die Vorschau', () => {
    const { tool } = setup();
    tool.selectTool('house');
    tool.tap({ x: 5, y: 5 });
    expect(tool.hasPreview).toBe(true);
    tool.selectTool('deco');
    expect(tool.tool).toBe('deco');
    expect(tool.hasPreview).toBe(false);
  });

  it('exitTool geht zurück auf Anschauen', () => {
    const { tool } = setup();
    tool.selectTool('path');
    tool.exitTool();
    expect(tool.tool).toBe('view');
  });

  it('bietet Varianten nur für Haus und Deko an, mit der ersten als Vorgabe', () => {
    const { tool } = setup();
    expect(tool.variant).toBeUndefined();
    tool.selectTool('house');
    expect(tool.variantCategory).toBe('house');
    expect(tool.variant).toBe('house-red');
    tool.selectVariant('house-blue');
    expect(tool.variant).toBe('house-blue');
    tool.selectVariant('flower');
    expect(tool.variant).toBe('house-blue');
    tool.selectTool('house');
    tool.selectTool('deco');
    expect(tool.variant).toBe('flower');
    tool.selectVariant('fountain');
    expect(tool.variant).toBe('fountain');
    tool.selectTool('deco');
    tool.selectTool('house');
    expect(tool.variant).toBe('house-blue');
    tool.selectTool('path');
    expect(tool.variantCategory).toBeUndefined();
  });

  it('zeigt zu jedem Werkzeug einen kurzen Hinweis', () => {
    const { tool } = setup();
    const hints = TOOLS.map((id) => {
      tool.exitTool();
      tool.selectTool(id);
      return tool.hint;
    });
    expect(hints.every((hint) => hint !== undefined)).toBe(true);
  });
});

describe('Setzen: Haus und Deko', () => {
  it('zeigt nach dem Antippen eine grüne Vorschau, die untere linke Kachel ist die angetippte', () => {
    const { tool } = setup();
    tool.selectTool('house');
    tool.tap({ x: 5, y: 6 });
    expect(tool.preview()).toEqual({ kind: 'place', typeId: 'house-red', x: 5, y: 5, result: 'ok' });
    expect(tool.canConfirm).toBe(true);
  });

  it('setzt 1×1-Deko genau auf die angetippte Kachel', () => {
    expect(anchorFor('flower', { x: 4, y: 7 })).toEqual({ x: 4, y: 7 });
    expect(anchorFor('house-red', { x: 4, y: 7 })).toEqual({ x: 4, y: 6 });
    expect(anchorFor('unknown', { x: 4, y: 7 })).toEqual({ x: 4, y: 7 });
  });

  it('verschiebt die Vorschau beim erneuten Antippen einer anderen Kachel', () => {
    const { tool } = setup();
    tool.selectTool('deco');
    tool.tap({ x: 2, y: 2 });
    tool.tap({ x: 8, y: 9 });
    expect(tool.preview()).toMatchObject({ kind: 'place', x: 8, y: 9, result: 'ok' });
  });

  it('zeigt rot (nicht bestätigbar) auf Wasser und sendet beim ✓ nichts', () => {
    const state = grassState();
    setTerrainAt(state, 3, 3, 'water');
    const { tool, sent } = setup(state);
    tool.selectTool('deco');
    tool.tap({ x: 3, y: 3 });
    expect(tool.preview()).toMatchObject({ kind: 'place', result: 'terrain' });
    expect(tool.canConfirm).toBe(false);
    expect(tool.confirm()).toBe('hint.water');
    expect(sent).toEqual([]);
    expect(tool.hasPreview).toBe(true);
  });

  it('zeigt „blocked“ auf einem Gebäude und „outOfMap“ am Rand', () => {
    const { state, tool } = setup();
    run(state, { type: 'placeBuilding', buildingType: 'house-blue', x: 4, y: 4 });
    tool.selectTool('deco');
    tool.tap({ x: 4, y: 4 });
    expect(tool.preview()).toMatchObject({ result: 'blocked' });
    tool.selectTool('deco');
    tool.selectTool('house');
    tool.tap({ x: 15, y: 15 });
    expect(tool.preview()).toMatchObject({ result: 'outOfMap' });
  });

  it('baut beim ✓, behält das Werkzeug und löscht die Vorschau – mehrere Blumen nacheinander', () => {
    const { state, tool, sent } = setup();
    tool.selectTool('deco');
    for (const x of [2, 4, 6]) {
      tool.tap({ x, y: 3 });
      expect(tool.confirm()).toBeUndefined();
      expect(tool.tool).toBe('deco');
      expect(tool.hasPreview).toBe(false);
    }
    expect(sent).toHaveLength(3);
    expect(state.buildings.map((b) => [b.type, b.x, b.y])).toEqual([
      ['flower', 2, 3],
      ['flower', 4, 3],
      ['flower', 6, 3],
    ]);
  });

  it('baut die gewählte Variante', () => {
    const { state, tool } = setup();
    tool.selectTool('house');
    tool.selectVariant('house-yellow');
    tool.tap({ x: 6, y: 6 });
    tool.confirm();
    expect(state.buildings).toEqual([{ id: 1, type: 'house-yellow', x: 6, y: 5 }]);
  });

  it('wertet die Vorschau mit der neuen Variante neu aus', () => {
    const { tool } = setup();
    tool.selectTool('deco');
    tool.tap({ x: 15, y: 15 });
    expect(tool.preview()).toMatchObject({ typeId: 'flower', result: 'ok' });
    tool.selectVariant('fountain');
    expect(tool.preview()).toMatchObject({ typeId: 'fountain', result: 'outOfMap' });
  });

  it('bricht beim ✕ ab, ohne etwas zu senden', () => {
    const { tool, sent } = setup();
    tool.selectTool('deco');
    tool.tap({ x: 3, y: 3 });
    tool.cancel();
    expect(tool.hasPreview).toBe(false);
    expect(tool.tool).toBe('deco');
    expect(sent).toEqual([]);
  });

  it('tut beim ✓ ohne Vorschau nichts', () => {
    const { tool, sent } = setup();
    tool.selectTool('deco');
    expect(tool.confirm()).toBeUndefined();
    expect(sent).toEqual([]);
  });
});

describe('Wege', () => {
  it('zeigt nach dem ersten Antippen eine Kachel, nach dem zweiten die L-Linie', () => {
    const { tool } = setup();
    tool.selectTool('path');
    expect(tool.hint).toBe('hint.pathStart');
    tool.tap({ x: 2, y: 2 });
    expect(tool.hint).toBe('hint.pathEnd');
    expect(tool.preview()).toEqual({ kind: 'path', tiles: [{ x: 2, y: 2, status: 'ok' }] });
    tool.tap({ x: 4, y: 3 });
    const preview = tool.preview();
    expect(preview.kind === 'path' && preview.tiles.map((t) => `${String(t.x)},${String(t.y)}`)).toEqual(['2,2', '3,2', '4,2', '4,3']);
  });

  it('versetzt das Ende beim Antippen einer anderen Kachel, auch der alten Endkachel', () => {
    const { tool } = setup();
    tool.selectTool('path');
    tool.tap({ x: 2, y: 2 });
    tool.tap({ x: 4, y: 3 });
    tool.tap({ x: 2, y: 5 });
    const moved = tool.preview();
    expect(moved.kind === 'path' && moved.tiles.map((t) => t.y)).toEqual([2, 3, 4, 5]);
    tool.tap({ x: 2, y: 5 });
    const same = tool.preview();
    expect(same.kind === 'path' && same.tiles).toHaveLength(4);
  });

  it('geht beim Antippen des Anfangs zurück auf eine Kachel', () => {
    const { tool } = setup();
    tool.selectTool('path');
    tool.tap({ x: 2, y: 2 });
    tool.tap({ x: 6, y: 2 });
    tool.tap({ x: 2, y: 2 });
    const preview = tool.preview();
    expect(preview.kind === 'path' && preview.tiles).toHaveLength(1);
  });

  it('nimmt beim Antippen einer dritten Kachel ein neues Ende, der Anfang bleibt', () => {
    const { tool } = setup();
    tool.selectTool('path');
    tool.tap({ x: 2, y: 2 });
    tool.tap({ x: 6, y: 2 });
    tool.tap({ x: 2, y: 6 });
    const preview = tool.preview();
    expect(preview.kind === 'path' && preview.tiles.map((t) => t.y)).toEqual([2, 3, 4, 5, 6]);
  });

  it('führt den Weg um Hindernisse herum und baut nur neue Kacheln', () => {
    const state = grassState();
    setTerrainAt(state, 4, 2, 'water');
    const { tool, sent } = setup(state);
    run(state, { type: 'placePaths', tiles: [{ x: 3, y: 2 }] }, { type: 'placeBuilding', buildingType: 'bush', x: 5, y: 2 });
    tool.selectTool('path');
    tool.tap({ x: 2, y: 2 });
    tool.tap({ x: 6, y: 2 });
    const preview = tool.preview();
    expect(preview.kind === 'path' && preview.error).toBeFalsy();
    expect(preview.kind === 'path' && preview.tiles.every((t) => t.status !== 'blocked')).toBe(true);
    expect(preview.kind === 'path' && preview.tiles.some((t) => t.status === 'existing' && t.x === 3 && t.y === 2)).toBe(true);
    expect(tool.canConfirm).toBe(true);
    expect(tool.confirm()).toBeUndefined();
    expect(sent).toHaveLength(1);
    // Alle Kacheln der Route liegen auf Wiese, nichts auf Wasser oder unter dem Busch.
    expect(pathAt(state, 4, 2)).toBe(false);
    expect(pathAt(state, 5, 2)).toBe(false);
    expect(pathAt(state, 2, 2) && pathAt(state, 6, 2)).toBe(true);
    expect(tool.hasPreview).toBe(false);
    expect(tool.tool).toBe('path');
  });

  it('zeigt rot, sperrt ✓ und nennt den Grund, wenn es keine Route gibt', () => {
    const state = grassState();
    for (const [x, y] of [[8, 7], [10, 7], [9, 6], [9, 8]] as const) {
      setTerrainAt(state, x, y, 'water');
    }
    const { tool, sent } = setup(state);
    tool.selectTool('path');
    tool.tap({ x: 2, y: 2 });
    tool.tap({ x: 9, y: 7 });
    const preview = tool.preview();
    expect(preview.kind === 'path' && preview.error).toBe('noRoute');
    expect(preview.kind === 'path' && preview.tiles.every((t) => t.status === 'blocked')).toBe(true);
    expect(tool.canConfirm).toBe(false);
    expect(tool.hint).toBe('hint.noRoute');
    expect(tool.confirm()).toBe('hint.noRoute');
    expect(sent).toEqual([]);
  });

  it('meldet zu lange Wege', () => {
    const { tool } = setup(grassState(60));
    tool.selectTool('path');
    tool.tap({ x: 0, y: 0 });
    tool.tap({ x: 50, y: 0 });
    expect(tool.hint).toBe('hint.routeTooLong');
    expect(tool.canConfirm).toBe(false);
  });

  it('nennt den Grund, wenn das Ende auf Wasser oder Wald liegt', () => {
    const state = grassState();
    setTerrainAt(state, 9, 2, 'water');
    setTerrainAt(state, 9, 4, 'forest');
    const { tool } = setup(state);
    tool.selectTool('path');
    tool.tap({ x: 2, y: 2 });
    tool.tap({ x: 9, y: 2 });
    expect(tool.hint).toBe('hint.water');
    expect(tool.canConfirm).toBe(false);
    tool.tap({ x: 9, y: 4 });
    expect(tool.hint).toBe('hint.forestPath');
  });

  it('lässt das ✓ ins Leere laufen, wenn kein Feld erlaubt ist', () => {
    const state = grassState();
    setTerrainAt(state, 3, 3, 'water');
    const { tool, sent } = setup(state);
    tool.selectTool('path');
    tool.tap({ x: 3, y: 3 });
    expect(tool.canConfirm).toBe(false);
    expect(tool.confirm()).toBe('hint.water');
    expect(sent).toEqual([]);
  });
});

describe('Verschieben', () => {
  const withHouse = (): ReturnType<typeof setup> => {
    const ctx = setup();
    run(ctx.state, { type: 'placeBuilding', buildingType: 'house-red', x: 3, y: 3 }, { type: 'placeBuilding', buildingType: 'flower', x: 10, y: 10 }, { type: 'placePaths', tiles: [{ x: 8, y: 8 }] });
    ctx.tool.selectTool('move');
    return ctx;
  };

  it('wählt ein Gebäude über jede seiner Kacheln aus', () => {
    const { tool } = withHouse();
    expect(tool.hint).toBe('hint.moveSelect');
    tool.tap({ x: 4, y: 4 });
    expect(tool.preview()).toEqual({ kind: 'move', id: 1, typeId: 'house-red', from: { x: 3, y: 3 } });
    expect(tool.hint).toBe('hint.moveTarget');
    expect(tool.canConfirm).toBe(false);
  });

  it('zeigt das Ziel grün und verschiebt beim ✓', () => {
    const { state, tool } = withHouse();
    tool.tap({ x: 3, y: 3 });
    tool.tap({ x: 7, y: 6 });
    expect(tool.preview()).toMatchObject({ kind: 'move', target: { x: 7, y: 5, result: 'ok' } });
    expect(tool.confirm()).toBeUndefined();
    expect(state.buildings[0]).toMatchObject({ id: 1, x: 7, y: 5 });
    expect(tool.hasPreview).toBe(false);
    expect(tool.tool).toBe('move');
  });

  it('erlaubt ein Ziel, das das Gebäude selbst teilweise überlappt', () => {
    const { tool } = withHouse();
    tool.tap({ x: 3, y: 3 });
    tool.tap({ x: 4, y: 5 });
    expect(tool.preview()).toMatchObject({ target: { x: 4, y: 4, result: 'ok' } });
  });

  it('zeigt rot auf einem anderen Gebäude und baut dort nicht', () => {
    const { state, tool, sent } = withHouse();
    tool.tap({ x: 3, y: 3 });
    tool.tap({ x: 10, y: 11 });
    expect(tool.preview()).toMatchObject({ target: { x: 10, y: 10, result: 'blocked' } });
    expect(tool.canConfirm).toBe(false);
    expect(tool.confirm()).toBe('hint.occupied');
    expect(sent).toEqual([]);
    expect(state.buildings[0]).toMatchObject({ x: 3, y: 3 });
  });

  it('bestätigt nichts, wenn das Ziel der alte Platz ist', () => {
    const { tool } = withHouse();
    tool.tap({ x: 3, y: 3 });
    tool.tap({ x: 3, y: 4 });
    expect(tool.canConfirm).toBe(false);
  });

  it('wählt beim Antippen eines anderen Gebäudes dieses statt es als Ziel zu nehmen', () => {
    const { tool } = withHouse();
    tool.tap({ x: 3, y: 3 });
    tool.tap({ x: 10, y: 10 });
    expect(tool.preview()).toMatchObject({ kind: 'move', id: 2 });
  });

  it('erklärt, dass Wege nicht verschoben werden, und dass leere Kacheln nichts sind', () => {
    const { tool } = withHouse();
    expect(tool.tap({ x: 8, y: 8 })).toBe('hint.pathNoMove');
    expect(tool.tap({ x: 1, y: 1 })).toBe('hint.nothingToMove');
    expect(tool.hasPreview).toBe(false);
  });

  it('verwirft die Auswahl, wenn das Gebäude verschwindet', () => {
    const { state, tool } = withHouse();
    tool.tap({ x: 3, y: 3 });
    run(state, { type: 'demolish', x: 3, y: 3 });
    expect(tool.preview()).toEqual({ kind: 'none' });
    tool.refresh();
    expect(tool.hasPreview).toBe(false);
  });
});

describe('Abreißen', () => {
  const withVillage = (): ReturnType<typeof setup> => {
    const ctx = setup();
    run(ctx.state, { type: 'placeBuilding', buildingType: 'fountain', x: 3, y: 3 }, { type: 'placePaths', tiles: [{ x: 8, y: 8 }, { x: 9, y: 8 }] });
    ctx.tool.selectTool('demolish');
    return ctx;
  };

  it('markiert ein Gebäude mit allen seinen Kacheln', () => {
    const { tool } = withVillage();
    tool.tap({ x: 4, y: 4 });
    expect(tool.preview()).toEqual({
      kind: 'demolish',
      tiles: [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 4 }, { x: 4, y: 4 }],
      refund: { coins: 40, stone: 5 },
    });
  });

  it('reißt beim ✓ das Gebäude ab', () => {
    const { state, tool } = withVillage();
    tool.tap({ x: 4, y: 4 });
    tool.confirm();
    expect(state.buildings).toEqual([]);
    expect(tool.tool).toBe('demolish');
    expect(tool.hasPreview).toBe(false);
  });

  it('reißt genau eine Weg-Kachel ab', () => {
    const { state, tool } = withVillage();
    tool.tap({ x: 8, y: 8 });
    expect(tool.preview()).toEqual({ kind: 'demolish', tiles: [{ x: 8, y: 8 }], refund: {} });
    tool.confirm();
    expect(pathAt(state, 8, 8)).toBe(false);
    expect(pathAt(state, 9, 8)).toBe(true);
  });

  it('wechselt die Markierung beim Antippen von etwas anderem', () => {
    const { tool } = withVillage();
    tool.tap({ x: 4, y: 4 });
    tool.tap({ x: 9, y: 8 });
    expect(tool.preview()).toEqual({ kind: 'demolish', tiles: [{ x: 9, y: 8 }], refund: {} });
  });

  it('erklärt, wenn nichts da ist, und räumt die Markierung weg', () => {
    const { tool } = withVillage();
    tool.tap({ x: 8, y: 8 });
    expect(tool.tap({ x: 1, y: 1 })).toBe('hint.nothingToDemolish');
    expect(tool.hasPreview).toBe(false);
  });
});

describe('Anschauen', () => {
  it('erklärt beim Antippen eines Hauses ohne Weg, dass es einen Weg braucht', () => {
    const { state, tool } = setup();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 3, y: 3 });
    expect(tool.tap({ x: 4, y: 3 })).toBe('hint.needsPath');
    run(state, { type: 'placePaths', tiles: [{ x: 3, y: 5 }] });
    expect(tool.tap({ x: 4, y: 3 })).toBeUndefined();
    expect(tool.tap({ x: 0, y: 0 })).toBeUndefined();
  });

  it('sagt zu Deko ohne Weg nichts', () => {
    const { state, tool } = setup();
    run(state, { type: 'placeBuilding', buildingType: 'flower', x: 3, y: 3 });
    expect(tool.tap({ x: 3, y: 3 })).toBeUndefined();
  });
});

describe('Version', () => {
  it('zählt bei jeder sichtbaren Änderung hoch', () => {
    const { tool } = setup();
    const versions = new Set<number>([tool.version]);
    tool.selectTool('deco');
    versions.add(tool.version);
    tool.tap({ x: 2, y: 2 });
    versions.add(tool.version);
    tool.cancel();
    versions.add(tool.version);
    expect(versions.size).toBe(4);
  });
});

describe('Tipp aufs Dach (Regression)', () => {
  const T = 64;
  /** Haus bei (5,5) (Dach reicht bis y = 236 px); auf der Kachel (5,4) hinter dem Haus liegt ein Weg, (6,4) ist leer. */
  const withRoofPath = (): ReturnType<typeof setup> => {
    const ctx = setup();
    run(ctx.state, { type: 'placePaths', tiles: [{ x: 5, y: 4 }] }, { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 5 });
    return ctx;
  };
  /** Tipp aufs Dach über der Wegkachel (5,4) und über der leeren Kachel (6,4). */
  const roofOverPath = { tile: { x: 5, y: 4 }, world: { x: 5.5 * T, y: 4.5 * T } };
  const roofOverEmpty = { tile: { x: 6, y: 4 }, world: { x: 6.5 * T, y: 4.5 * T } };

  it('reißt den Weg ab, wenn die Kachel unter dem Finger ein Weg ist (auch unter dem Dach)', () => {
    const { state, tool } = withRoofPath();
    tool.selectTool('demolish');
    tool.tap(roofOverPath.tile, roofOverPath.world);
    expect(tool.preview()).toEqual({ kind: 'demolish', tiles: [{ x: 5, y: 4 }], refund: {} });
    tool.confirm();
    expect(pathAt(state, 5, 4)).toBe(false);
    expect(state.buildings).toHaveLength(1);
  });

  it('reißt das Haus ab, wenn die Kachel unter dem Finger leer ist und das Dach getroffen wird', () => {
    const { state, tool } = withRoofPath();
    tool.selectTool('demolish');
    tool.tap(roofOverEmpty.tile, roofOverEmpty.world);
    expect(tool.preview()).toMatchObject({ kind: 'demolish', tiles: [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 6 }, { x: 6, y: 6 }] });
    tool.confirm();
    expect(state.buildings).toEqual([]);
    expect(pathAt(state, 5, 4)).toBe(true);
  });

  it('nimmt den Grundriss vor dem Dach: Tipp auf den Stiel reißt das Haus ab', () => {
    const { state, tool } = withRoofPath();
    tool.selectTool('demolish');
    tool.tap({ x: 5, y: 5 }, { x: 5.5 * T, y: 5.5 * T });
    tool.confirm();
    expect(state.buildings).toEqual([]);
  });

  it('wählt beim Verschieben über das Dach das Haus, über eine Wegkachel aber meldet es „Wege nicht verschiebbar“', () => {
    const { tool } = withRoofPath();
    tool.selectTool('move');
    expect(tool.tap(roofOverPath.tile, roofOverPath.world)).toBe('hint.pathNoMove');
    expect(tool.tap(roofOverEmpty.tile, roofOverEmpty.world)).toBeUndefined();
    expect(tool.preview()).toMatchObject({ kind: 'move', id: 1 });
  });

  it('nimmt beim Verschieben eines gewählten Hauses die Kachel hinter einem anderen Dach als Ziel', () => {
    const { state, tool } = setup();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 5 }, { type: 'placeBuilding', buildingType: 'flower', x: 12, y: 12 });
    tool.selectTool('move');
    tool.tap({ x: 12, y: 12 });
    expect(tool.preview()).toMatchObject({ kind: 'move', id: 2 });
    // Die Kachel (6,4) ist leer, aber das Dach des Hauses ragt darüber: sie ist das Ziel der Blume.
    tool.tap(roofOverEmpty.tile, roofOverEmpty.world);
    expect(tool.preview()).toMatchObject({ kind: 'move', id: 2, target: { x: 6, y: 4, result: 'ok' } });
    // Auf dem Grundriss des anderen Hauses wird dieses gewählt.
    tool.tap({ x: 6, y: 6 }, { x: 6.5 * T, y: 6.5 * T });
    expect(tool.preview()).toMatchObject({ kind: 'move', id: 1 });
  });

  it('sagt beim Anschauen auf dem Dach (leere Kachel dahinter), dass das Haus einen Weg braucht', () => {
    const { state, tool } = setup();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 5 });
    expect(tool.tap({ x: 5, y: 4 }, { x: 5.5 * T, y: 4.5 * T })).toBe('hint.needsPath');
    expect(tool.tap({ x: 5, y: 4 }, { x: 5.5 * T, y: 3 * T })).toBeUndefined();
  });

  it('trifft ohne Weltpunkt weiter über die Kachel', () => {
    const { tool } = withRoofPath();
    tool.selectTool('demolish');
    tool.tap({ x: 5, y: 4 });
    expect(tool.preview()).toEqual({ kind: 'demolish', tiles: [{ x: 5, y: 4 }], refund: {} });
  });

  it('baut beim Platzieren weiter nach der Kachel, nicht nach der Grafik eines Hauses', () => {
    const { tool } = withRoofPath();
    tool.selectTool('deco');
    tool.tap(roofOverPath.tile, roofOverPath.world);
    expect(tool.preview()).toMatchObject({ kind: 'place', x: 5, y: 4, result: 'blocked' });
  });
});

describe('Weg mit Ziel im Wald oder auf Fels', () => {
  it('ist rot, ✓ gesperrt, und der Hinweis nennt den Grund für Wege', () => {
    const state = grassState();
    setTerrainAt(state, 9, 2, 'forest');
    setTerrainAt(state, 9, 5, 'rock');
    const { tool, sent } = setup(state);
    tool.selectTool('path');
    tool.tap({ x: 2, y: 2 });
    tool.tap({ x: 9, y: 2 });
    const preview = tool.preview();
    expect(preview.kind === 'path' && preview.error).toBe('endBlocked');
    expect(tool.canConfirm).toBe(false);
    expect(tool.hint).toBe('hint.forestPath');
    expect(tool.confirm()).toBe('hint.forestPath');
    tool.tap({ x: 9, y: 5 });
    expect(tool.hint).toBe('hint.rockPath');
    expect(sent).toEqual([]);
  });
});

describe('Variantenwechsel (Regression)', () => {
  it('rechnet den Anker mit der neuen Variante neu, aus der angetippten Kachel', () => {
    const { tool } = setup();
    tool.selectTool('deco');
    tool.tap({ x: 6, y: 6 });
    expect(tool.preview()).toMatchObject({ typeId: 'flower', x: 6, y: 6 });
    tool.selectVariant('fountain');
    expect(tool.preview()).toMatchObject({ typeId: 'fountain', x: 6, y: 5 });
    tool.selectVariant('bench');
    expect(tool.preview()).toMatchObject({ typeId: 'bench', x: 6, y: 6 });
  });

  it('baut die zuletzt gewählte Variante', () => {
    const { state, tool } = setup();
    tool.selectTool('deco');
    tool.tap({ x: 6, y: 6 });
    tool.selectVariant('fountain');
    tool.confirm();
    expect(state.buildings).toEqual([{ id: 1, type: 'fountain', x: 6, y: 5 }]);
  });
});

describe('Grund in der Vorschau', () => {
  const hintFor = (terrain: 'water' | 'forest' | 'rock' | 'sand', tool: 'deco' | 'house' = 'deco'): string | undefined => {
    const state = grassState();
    setTerrainAt(state, 6, 6, terrain);
    const ctx = setup(state);
    ctx.tool.selectTool(tool);
    ctx.tool.tap({ x: 6, y: 6 });
    return ctx.tool.hint;
  };

  it('nennt Wasser, Wald, Fels und Strand', () => {
    expect(hintFor('water')).toBe('hint.water');
    expect(hintFor('forest')).toBe('hint.forest');
    expect(hintFor('rock')).toBe('hint.rock');
    expect(hintFor('sand', 'house')).toBe('hint.sand');
  });

  it('nennt „schon etwas da“ und „zu nah am Rand“', () => {
    const { state, tool } = setup();
    run(state, { type: 'placeBuilding', buildingType: 'bush', x: 3, y: 3 });
    tool.selectTool('deco');
    tool.tap({ x: 3, y: 3 });
    expect(tool.hint).toBe('hint.occupied');
    tool.selectTool('house');
    tool.tap({ x: 15, y: 15 });
    expect(tool.hint).toBe('hint.edge');
  });

  it('zeigt bei grüner Vorschau wieder den normalen Hinweis', () => {
    const { tool } = setup();
    tool.selectTool('deco');
    tool.tap({ x: 3, y: 3 });
    expect(tool.hint).toBe('hint.place');
  });

  it('nennt den Grund auch beim Verschieben', () => {
    const state = grassState();
    setTerrainAt(state, 9, 9, 'water');
    const { tool } = setup(state);
    run(state, { type: 'placeBuilding', buildingType: 'flower', x: 2, y: 2 });
    tool.selectTool('move');
    tool.tap({ x: 2, y: 2 });
    tool.tap({ x: 9, y: 9 });
    expect(tool.hint).toBe('hint.water');
  });

  it('übersetzt jedes Ergebnis in einen Text', () => {
    expect(problemHint({ result: 'ok' })).toBeUndefined();
    expect(problemHint({ result: 'blocked' })).toBe('hint.occupied');
    expect(problemHint({ result: 'outOfMap' })).toBe('hint.edge');
    expect(problemHint({ result: 'terrain', terrain: 'water' })).toBe('hint.water');
  });
});

describe('Zwischenspeicher', () => {
  it('liefert dieselbe Vorschau, bis sich etwas ändert', () => {
    const { state, tool } = setup();
    tool.selectTool('deco');
    tool.tap({ x: 3, y: 3 });
    const first = tool.preview();
    expect(tool.preview()).toBe(first);
    expect(tool.canConfirm).toBe(true);
    expect(tool.preview()).toBe(first);
    run(state, { type: 'placeBuilding', buildingType: 'bush', x: 3, y: 3 });
    const second = tool.preview();
    expect(second).not.toBe(first);
    expect(second).toMatchObject({ result: 'blocked' });
    expect(tool.canConfirm).toBe(false);
  });
});

describe('Gebäude-Werkzeug und Kosten (M3)', () => {
  it('hat sechs Werkzeuge: Weg, Haus, Gebäude, Deko, Verschieben, Abreißen', () => {
    expect([...TOOLS]).toEqual(['path', 'house', 'building', 'deco', 'move', 'demolish']);
  });

  it('bietet im Gebäude-Werkzeug die sechs Produktionsgebäude an', () => {
    const { tool } = setup();
    tool.selectTool('building');
    expect(tool.variantCategory).toBe('production');
    expect(tool.variant).toBe('lumberjack');
    tool.selectVariant('market');
    expect(tool.variant).toBe('market');
    tool.selectVariant('house-red');
    expect(tool.variant).toBe('market');
  });

  it('färbt eine zu teure Vorschau rot, sperrt ✓ und sagt, was fehlt', () => {
    const state = grassState();
    setStore(state, { coins: 100, wood: 5 });
    const { tool, sent } = setup(state);
    tool.selectTool('house');
    tool.tap({ x: 6, y: 6 });
    expect(tool.preview()).toMatchObject({ kind: 'place', result: 'cost', missing: { wood: 3 } });
    expect(tool.canConfirm).toBe(false);
    expect(tool.hint).toBe('hint.missing');
    expect(t(tool.hint ?? 'hint.missing', tool.hintParams)).toBe('Dir fehlen 3 Holz.');
    expect(tool.confirm()).toBe('hint.missing');
    expect(sent).toHaveLength(0);
  });

  it('sagt bei genau einem fehlenden Stück „fehlt“ und nennt mehrere Dinge', () => {
    const state = grassState();
    setStore(state, { coins: 100, wood: 7 });
    const { tool } = setup(state);
    tool.selectTool('house');
    tool.tap({ x: 6, y: 6 });
    expect(tool.hint).toBe('hint.missingOne');
    expect(t(tool.hint ?? 'hint.missing', tool.hintParams)).toBe('Dir fehlt 1 Holz.');
    setStore(state, { coins: 10 });
    tool.tap({ x: 6, y: 6 });
    expect(t(tool.hint ?? 'hint.missing', tool.hintParams)).toBe('Dir fehlen 30 Taler und 8 Holz.');
  });

  it('sagt schon beim Wählen einer zu teuren Variante, was fehlt, und wird beim Auffüllen wieder frei', () => {
    const state = grassState();
    setStore(state, { coins: 100, wood: 5 });
    const { tool } = setup(state);
    tool.selectTool('house');
    expect(tool.variantAffordable).toBe(false);
    expect(tool.hint).toBe('hint.missing');
    expect(t(tool.hint ?? 'hint.missing', tool.hintParams)).toBe('Dir fehlen 3 Holz.');
    state.inventory['wood'] = 8;
    expect(tool.variantAffordable).toBe(true);
    expect(tool.hint).toBe('hint.place');
    expect(tool.hintParams).toBeUndefined();
    tool.selectTool('path');
    expect(tool.variantAffordable).toBe(true);
  });

  it('baut mit ✓, sobald alles da ist, und bucht ab', () => {
    const state = grassState();
    setStore(state, { coins: 100, wood: 20 });
    const { tool } = setup(state);
    tool.selectTool('house');
    tool.tap({ x: 6, y: 6 });
    expect(tool.canConfirm).toBe(true);
    tool.confirm();
    expect(state.buildings).toHaveLength(1);
    expect(state.inventory['coins']).toBe(60);
  });

  it('färbt einen Holzfäller ohne Bäume in der Nähe rot und sagt es; mit Bäumen wird er grün', () => {
    const state = grassState(24);
    fillTerrain(state, 14, 2, 3, 4, 'forest');
    const { tool } = setup(state);
    tool.selectTool('building');
    tool.tap({ x: 3, y: 15 });
    expect(tool.preview()).toMatchObject({ kind: 'place', result: 'noNearby', terrain: 'forest' });
    expect(tool.hint).toBe('hint.noForest');
    expect(t('hint.noForest')).toBe('Hier sind keine Bäume in der Nähe.');
    expect(tool.canConfirm).toBe(false);
    tool.tap({ x: 11, y: 4 });
    expect(tool.preview()).toMatchObject({ kind: 'place', result: 'ok' });
    expect(tool.hint).toBe('hint.place');
  });

  it('sagt beim Steinbruch, dass Felsen fehlen', () => {
    const { tool } = setup(grassState(24));
    tool.selectTool('building');
    tool.selectVariant('quarry');
    tool.tap({ x: 5, y: 5 });
    expect(tool.hint).toBe('hint.noRock');
    expect(t('hint.noRock')).toBe('Hier sind keine Felsen in der Nähe.');
  });

  it('zeigt vor dem Abreißen, was man zurückbekommt, und meldet es nach ✓', () => {
    const state = grassState();
    setStore(state, { coins: 100, wood: 20 });
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 4 });
    const refunds: RefundInfo[] = [];
    const tool = new BuildTool(
      () => state,
      (command) => {
        applyCommand(state, command);
      },
      (info) => refunds.push(info),
    );
    tool.selectTool('demolish');
    tool.tap({ x: 5, y: 5 });
    expect(tool.hint).toBe('hint.refund');
    expect(t('hint.refund', tool.hintParams)).toBe('Du bekommst 40 Taler und 8 Holz zurück. Dann ✓.');
    tool.confirm();
    expect(refunds).toEqual([{ at: { x: 4, y: 4 }, refund: { coins: 40, wood: 8 } }]);
    expect(state.inventory['coins']).toBe(60 + 40);
  });

  it('meldet keine Erstattung für Wege', () => {
    const state = grassState();
    run(state, { type: 'placePaths', tiles: [{ x: 3, y: 3 }] });
    const refunds: RefundInfo[] = [];
    const tool = new BuildTool(() => state, (command) => { applyCommand(state, command); }, (info) => refunds.push(info));
    tool.selectTool('demolish');
    tool.tap({ x: 3, y: 3 });
    expect(tool.hint).toBe('hint.demolish');
    tool.confirm();
    expect(refunds).toEqual([]);
  });

  it('erlaubt das Verschieben auch mit leerem Lager (kostenlos)', () => {
    const state = grassState();
    setStore(state, { coins: 100, wood: 20 });
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 4 });
    setStore(state);
    const { tool } = setup(state);
    tool.selectTool('move');
    tool.tap({ x: 4, y: 4 });
    tool.tap({ x: 9, y: 9 });
    expect(tool.preview()).toMatchObject({ kind: 'move', target: { result: 'ok' } });
    expect(tool.canConfirm).toBe(true);
  });
});

describe('Infokarte öffnen und schließen (M3)', () => {
  const withProduction = (): ReturnType<typeof setup> & { id: number } => {
    const state = grassState(24);
    setStore(state, { coins: 100, wood: 20 });
    const id = buildConnected(state, 'berry-garden', 4, 3);
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 10, y: 3 });
    return { ...setup(state), id };
  };

  it('öffnet beim Antippen eines Produktionsgebäudes im Anschauen die Karte', () => {
    const { tool, id } = withProduction();
    expect(tool.inspectedId).toBeUndefined();
    expect(tool.tap({ x: 4, y: 3 })).toBeUndefined();
    expect(tool.inspectedId).toBe(id);
  });

  it('öffnet die Karte auch über das Dach', () => {
    const { tool, id } = withProduction();
    // Das Dach des Beerengartens ragt über die Kachel (4, 2) hinaus.
    tool.tap({ x: 4, y: 2 }, { x: 4.5 * 64, y: 3 * 64 - 20 });
    expect(tool.inspectedId).toBe(id);
  });

  it('öffnet keine Karte für Häuser und leere Wiese, und das Haus ohne Weg sagt weiter „braucht Weg“', () => {
    const { tool } = withProduction();
    expect(tool.tap({ x: 10, y: 3 })).toBe('hint.needsPath');
    expect(tool.inspectedId).toBeUndefined();
    tool.tap({ x: 4, y: 3 });
    tool.tap({ x: 20, y: 20 });
    expect(tool.inspectedId).toBeUndefined();
  });

  it('schließt die Karte mit closeInfo, beim Wählen eines Werkzeugs und wenn das Gebäude weg ist', () => {
    const { tool, state } = withProduction();
    tool.tap({ x: 4, y: 3 });
    tool.closeInfo();
    expect(tool.inspectedId).toBeUndefined();
    tool.tap({ x: 4, y: 3 });
    tool.selectTool('deco');
    expect(tool.inspectedId).toBeUndefined();
    tool.exitTool();
    expect(tool.inspectedId).toBeUndefined();
    tool.tap({ x: 4, y: 3 });
    expect(tool.inspectedId).toBeDefined();
    run(state, { type: 'demolish', x: 4, y: 3 });
    tool.refresh();
    expect(tool.inspectedId).toBeUndefined();
  });

  it('zeigt die Karte nur im Anschauen', () => {
    const { tool } = withProduction();
    tool.tap({ x: 4, y: 3 });
    tool.selectTool('move');
    tool.exitTool();
    expect(tool.inspectedId).toBeUndefined();
  });

  it('zählt das Öffnen und Schließen als Änderung (für das Neuzeichnen)', () => {
    const { tool } = withProduction();
    const before = tool.version;
    tool.tap({ x: 4, y: 3 });
    expect(tool.version).toBeGreaterThan(before);
    const opened = tool.version;
    tool.closeInfo();
    expect(tool.version).toBeGreaterThan(opened);
    const closed = tool.version;
    tool.closeInfo();
    expect(tool.version).toBe(closed);
  });
});
