import { describe, expect, it } from 'vitest';
import { applyCommand, type Command } from '../../src/sim/commands';
import { loadFromText, saveToText } from '../../src/sim/saveData';
import type { SimState } from '../../src/sim/state';
import { t } from '../../src/data/texts';
import { BuildTool, TOOLS, anchorFor, problemHint, type RefundInfo } from '../../src/ui/buildTool';
import { shopItems } from '../../src/data/buildings';
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
    expect(tool.shopOpen).toBe(false);
  });

  it('hat vier Werkzeuge: Weg, Shop, Verschieben, Abreißen', () => {
    expect([...TOOLS]).toEqual(['path', 'shop', 'move', 'demolish']);
  });

  it('schaltet ein Werkzeug ein; erneutes Antippen lässt es an (nur exitTool beendet es)', () => {
    const { tool } = setup();
    for (const id of TOOLS) {
      tool.selectTool(id);
      expect(tool.tool).toBe(id);
      tool.selectTool(id);
      expect(tool.tool).toBe(id);
      if (id === 'shop') {
        tool.closeShop();
      } else {
        tool.exitTool();
      }
      expect(tool.tool).toBe('view');
    }
  });

  it('behält beim erneuten Antippen des Werkzeugs (Weg) die Vorschau (R9)', () => {
    const { tool } = setup();
    tool.selectTool('path');
    tool.tap({ x: 3, y: 3 });
    expect(tool.hasPreview).toBe(true);
    tool.selectTool('path');
    expect(tool.tool).toBe('path');
    expect(tool.hasPreview).toBe(true);
  });

  it('behält beim erneuten Antippen des Shop-Knopfes aus dem Platzieren die Vorschau (sie liegt nur unter dem Shop)', () => {
    const { tool } = setup();
    tool.chooseItem('flower');
    tool.tap({ x: 3, y: 3 });
    tool.selectTool('shop');
    expect(tool.shopOpen).toBe(true);
    expect(tool.hasPreview).toBe(true);
  });

  it('kennt „place“ nur über die Wahl eines Artikels, nicht über selectTool', () => {
    const { tool } = setup();
    tool.selectTool('place');
    expect(tool.tool).toBe('view');
    tool.chooseItem('flower');
    expect(tool.tool).toBe('place');
    expect(tool.item).toBe('flower');
  });

  it('wechselt direkt zwischen Werkzeugen und verwirft dabei die Vorschau', () => {
    const { tool } = setup();
    tool.chooseItem('house-red');
    tool.tap({ x: 5, y: 5 });
    expect(tool.hasPreview).toBe(true);
    tool.selectTool('path');
    expect(tool.tool).toBe('path');
    expect(tool.hasPreview).toBe(false);
    expect(tool.item).toBeUndefined();
  });

  it('wechselt von einem Artikel zum anderen: der getippte Platz bleibt, der neue Artikel steht darauf', () => {
    const { tool } = setup();
    tool.chooseItem('house-red');
    tool.tap({ x: 5, y: 5 });
    tool.chooseItem('house-blue');
    expect(tool.item).toBe('house-blue');
    expect(tool.preview()).toMatchObject({ kind: 'place', typeId: 'house-blue', x: 5, y: 4, result: 'ok' });
  });

  it('exitTool geht zurück auf Anschauen', () => {
    const { tool } = setup();
    tool.selectTool('path');
    tool.exitTool();
    expect(tool.tool).toBe('view');
    tool.chooseItem('flower');
    tool.exitTool();
    expect(tool.tool).toBe('view');
    expect(tool.item).toBeUndefined();
  });

  it('zeigt zu jedem Werkzeug außer dem Shop einen kurzen Hinweis', () => {
    const { tool } = setup();
    for (const id of TOOLS) {
      tool.exitTool();
      tool.selectTool(id);
      if (id === 'shop') {
        // Der Shop erklärt sich selbst (Karten, Reiter): keine Hinweisleiste.
        expect(tool.hint).toBeUndefined();
        tool.closeShop();
      } else {
        expect(tool.hint, id).toBeDefined();
      }
    }
    tool.chooseItem('flower');
    expect(tool.hint).toBe('hint.place');
  });
});

describe('Shop (M4)', () => {
  it('öffnet mit dem Shop-Werkzeug, verwirft die Vorschau und schließt mit ✕ wieder auf Anschauen', () => {
    const { tool } = setup();
    tool.selectTool('shop');
    expect(tool.shopOpen).toBe(true);
    expect(tool.tool).toBe('shop');
    expect(tool.hasPreview).toBe(false);
    tool.closeShop();
    expect(tool.shopOpen).toBe(false);
    expect(tool.tool).toBe('view');
    expect(tool.item).toBeUndefined();
  });

  it('eine Karte antippen schließt den Shop und startet das Platzieren', () => {
    const { tool, sent } = setup();
    tool.selectTool('shop');
    expect(tool.chooseItem('bench')).toBeUndefined();
    expect(tool.shopOpen).toBe(false);
    expect(tool.tool).toBe('place');
    expect(tool.item).toBe('bench');
    tool.tap({ x: 4, y: 4 });
    expect(tool.preview()).toMatchObject({ kind: 'place', typeId: 'bench', x: 4, y: 4, result: 'ok' });
    expect(tool.confirm()).toBeUndefined();
    expect(sent).toEqual([{ type: 'placeBuilding', buildingType: 'bench', x: 4, y: 4 }]);
    // Nach dem Setzen bleibt der Artikel gewählt.
    expect(tool.tool).toBe('place');
    expect(tool.item).toBe('bench');
    expect(tool.hasPreview).toBe(false);
  });

  it('der Shop öffnet auf dem Reiter des zuletzt gewählten Artikels und merkt sich den Reiter', () => {
    const { tool } = setup();
    expect(tool.shopTab).toBe('houses');
    tool.chooseItem('flower');
    expect(tool.shopTab).toBe('deco');
    tool.chooseItem('lumberjack');
    expect(tool.shopTab).toBe('production');
    tool.setShopTab('island');
    expect(tool.shopTab).toBe('island');
    tool.setShopTab('houses');
    expect(tool.shopTab).toBe('houses');
  });

  it('aus dem Platzieren zurück in den Shop (Chip) und mit ✕ wieder zum gleichen Artikel auf dem gleichen Platz', () => {
    const { tool } = setup();
    tool.chooseItem('house-blue');
    tool.tap({ x: 5, y: 5 });
    tool.openShop();
    expect(tool.shopOpen).toBe(true);
    tool.closeShop();
    expect(tool.tool).toBe('place');
    expect(tool.item).toBe('house-blue');
    expect(tool.preview()).toMatchObject({ kind: 'place', typeId: 'house-blue', x: 5, y: 4 });
    // Oder ein anderer Artikel auf dem gleichen Platz.
    tool.openShop();
    tool.chooseItem('house-yellow');
    expect(tool.item).toBe('house-yellow');
    expect(tool.preview()).toMatchObject({ kind: 'place', typeId: 'house-yellow', x: 5, y: 4 });
  });

  it('aus Weg, Verschieben und Abreißen kommt man nicht mit einem Platz in den Shop', () => {
    const { tool } = setup();
    tool.selectTool('path');
    tool.tap({ x: 3, y: 3 });
    expect(tool.hasPreview).toBe(true);
    tool.selectTool('shop');
    expect(tool.hasPreview).toBe(false);
    tool.chooseItem('flower');
    expect(tool.hasPreview).toBe(false);
  });

  it('nimmt in „shop“ keine Tipps auf die Karte an', () => {
    const { tool } = setup();
    tool.selectTool('shop');
    expect(tool.tap({ x: 3, y: 3 })).toBeUndefined();
    expect(tool.hasPreview).toBe(false);
  });

  it('wählt unbekannte Artikel und Wege nicht', () => {
    const { tool } = setup();
    expect(tool.chooseItem('nope')).toBeUndefined();
    expect(tool.chooseItem('path')).toBeUndefined();
    expect(tool.tool).toBe('view');
  });

  it('wählt einen gesperrten Artikel nicht, sondern sagt „gesperrt“', () => {
    const state = grassState();
    state.unlocked = [];
    const { tool } = setup(state);
    tool.selectTool('shop');
    expect(tool.chooseItem('carpenter')).toBe('hint.locked');
    expect(tool.shopOpen).toBe(true);
    expect(tool.item).toBeUndefined();
    state.unlocked.push('carpenter');
    expect(tool.chooseItem('carpenter')).toBeUndefined();
    expect(tool.item).toBe('carpenter');
  });

  it('wählt einen zu teuren Artikel (grau, aber wählbar) und sagt dann, was fehlt', () => {
    const state = grassState();
    setStore(state, { coins: 1 });
    const { tool } = setup(state);
    tool.selectTool('shop');
    expect(tool.chooseItem('fountain')).toBeUndefined();
    expect(tool.item).toBe('fountain');
    expect(tool.itemAffordable).toBe(false);
    expect(tool.hint).toBe('hint.missing');
  });

  it('merkt Neues im Shop: Stern am Knopf, bis er geöffnet wurde; Karten mit Stern, bis er geschlossen wird', () => {
    const state = grassState();
    state.unlocked = [];
    const { tool } = setup(state);
    expect(tool.shopHasNews).toBe(false);
    state.unlocked.push('bench', 'lantern');
    expect(tool.shopHasNews).toBe(true);
    tool.openShop();
    expect(tool.shopHasNews).toBe(false);
    expect(tool.isFresh('bench')).toBe(true);
    expect(tool.isFresh('lantern')).toBe(true);
    expect(tool.isFresh('fountain')).toBe(false);
    // Etwas wird frei, während der Shop offen ist: gesehen und mit Stern.
    state.unlocked.push('pond');
    tool.sync();
    expect(tool.shopHasNews).toBe(false);
    expect(tool.isFresh('pond')).toBe(true);
    tool.closeShop();
    expect(tool.isFresh('bench')).toBe(false);
    expect(tool.shopHasNews).toBe(false);
  });

  it('meldet jede Freischaltung genau einmal („Neu im Shop“) und beim Start nichts', () => {
    const state = grassState();
    state.unlocked = ['bench'];
    const { tool } = setup(state);
    expect(tool.takeAnnouncements()).toEqual([]);
    state.unlocked.push('lantern', 'pond');
    expect(tool.takeAnnouncements()).toEqual(['lantern', 'pond']);
    expect(tool.takeAnnouncements()).toEqual([]);
  });

  it('ein wirklich aus einem Spielstand geladener Zustand meldet nichts und trägt keinen Stern (M5)', () => {
    const played = grassState();
    played.unlocked = ['bench', 'lantern', 'flowerbed'];
    played.earnedCoins = 150;
    const loaded = loadFromText(saveToText(played));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      return;
    }
    const { tool } = setup(loaded.state);
    expect(loaded.state.unlocked).toEqual(expect.arrayContaining(['bench', 'lantern', 'flowerbed']));
    expect(tool.takeAnnouncements()).toEqual([]);
    expect(tool.shopHasNews).toBe(false);
    tool.openShop();
    expect(shopItems('deco').some((type) => tool.isFresh(type.id))).toBe(false);
  });

  it('zählt Neuigkeiten nach Artikel, nicht nach Platz in der Liste (ein später geladener Zustand meldet nichts Altes, R10)', () => {
    const state = grassState();
    state.unlocked = ['bench', 'lantern'];
    const { tool } = setup(state);
    // Die Liste wird neu geordnet und um Altes ergänzt, als käme sie aus einem Spielstand.
    state.unlocked = ['pond', 'lantern', 'bench'];
    expect(tool.takeAnnouncements()).toEqual(['pond']);
    expect(tool.shopHasNews).toBe(true);
    tool.openShop();
    expect([tool.isFresh('pond'), tool.isFresh('bench'), tool.isFresh('lantern')]).toEqual([true, false, false]);
  });

  it('eine Wahl im Shop zählt als frisch gewählt: auch die Hinweise für zu teure Karten kommen sofort', () => {
    const state = grassState();
    setStore(state, { coins: 2 });
    const { tool } = setup(state);
    tool.chooseItem('house-red');
    expect(tool.hint).toBe('hint.missing');
  });
});

describe('Inselartikel (M4)', () => {
  it('Baum pflanzen: Vorschau auf der Wiese, ✓ sendet plantTree', () => {
    const { tool, sent, state } = setup();
    tool.chooseItem('tree');
    expect(tool.hint).toBe('hint.place');
    tool.tap({ x: 6, y: 6 });
    expect(tool.preview()).toMatchObject({ kind: 'place', typeId: 'tree', x: 6, y: 6, result: 'ok' });
    tool.confirm();
    expect(sent).toEqual([{ type: 'plantTree', typeId: 'tree', x: 6, y: 6 }]);
    expect(state.world.tiles[6 * state.world.width + 6]).toBe('forest');
  });

  it('Fels setzen sendet placeRock, Strand sendet fillLand, Wiese sendet makeMeadow', () => {
    const state = grassState();
    setTerrainAt(state, 2, 2, 'water');
    setTerrainAt(state, 8, 8, 'sand');
    const { tool, sent } = setup(state);
    tool.chooseItem('rock');
    tool.tap({ x: 6, y: 6 });
    tool.confirm();
    tool.chooseItem('beach');
    expect(tool.hint).toBe('hint.placeWater');
    tool.tap({ x: 2, y: 2 });
    expect(tool.preview()).toMatchObject({ kind: 'place', typeId: 'beach', result: 'ok' });
    tool.confirm();
    tool.chooseItem('meadow');
    expect(tool.hint).toBe('hint.placeSand');
    tool.tap({ x: 8, y: 8 });
    tool.confirm();
    expect(sent.map((command) => command.type)).toEqual(['placeRock', 'fillLand', 'makeMeadow']);
  });

  it('sagt in der roten Vorschau, warum es nicht geht – mit den Worten der Insel', () => {
    const state = grassState();
    setTerrainAt(state, 3, 3, 'sand');
    setTerrainAt(state, 4, 3, 'forest');
    fillTerrain(state, 8, 8, 3, 3, 'water');
    const { tool } = setup(state);
    tool.chooseItem('tree');
    tool.tap({ x: 3, y: 3 });
    expect(tool.hint).toBe('hint.islandGrassOnly');
    tool.tap({ x: 4, y: 3 });
    expect(tool.hint).toBe('hint.occupied');
    tool.tap({ x: 9, y: 9 });
    expect(tool.hint).toBe('hint.water');
    tool.chooseItem('beach');
    tool.tap({ x: 6, y: 6 });
    expect(tool.hint).toBe('hint.islandWaterOnly');
    tool.tap({ x: 9, y: 9 });
    expect(tool.hint).toBe('hint.islandNoCoast');
    tool.chooseItem('meadow');
    tool.tap({ x: 6, y: 6 });
    expect(tool.hint).toBe('hint.islandSandOnly');
  });

  it('Abreißen: ein gepflanzter Baum zeigt die Erstattung, ein natürlicher sagt „bleibt“', () => {
    const state = grassState();
    setStore(state, { coins: 20 });
    setTerrainAt(state, 8, 8, 'forest');
    const { tool, sent } = setup(state);
    tool.chooseItem('tree');
    tool.tap({ x: 6, y: 6 });
    tool.confirm();
    tool.selectTool('demolish');
    expect(tool.tap({ x: 6, y: 6 })).toBeUndefined();
    expect(tool.preview()).toMatchObject({ kind: 'demolish', tiles: [{ x: 6, y: 6 }], refund: { coins: 5 } });
    expect(tool.hint).toBe('hint.refund');
    tool.confirm();
    expect(sent.at(-1)).toEqual({ type: 'demolish', x: 6, y: 6 });
    expect(state.world.tiles[6 * state.world.width + 6]).toBe('grass');
    expect(tool.tap({ x: 8, y: 8 })).toBe('hint.naturalObject');
    expect(tool.hasPreview).toBe(false);
    expect(tool.tap({ x: 1, y: 1 })).toBe('hint.nothingToDemolish');
  });
});

describe('Setzen: Haus und Deko', () => {
  it('zeigt nach dem Antippen eine grüne Vorschau, die untere linke Kachel ist die angetippte', () => {
    const { tool } = setup();
    tool.chooseItem('house-red');
    tool.tap({ x: 5, y: 6 });
    expect(tool.preview()).toEqual({ kind: 'place', typeId: 'house-red', x: 5, y: 5, connected: false, result: 'ok' });
    expect(tool.canConfirm).toBe(true);
  });

  it('setzt 1×1-Deko genau auf die angetippte Kachel', () => {
    expect(anchorFor('flower', { x: 4, y: 7 })).toEqual({ x: 4, y: 7 });
    expect(anchorFor('house-red', { x: 4, y: 7 })).toEqual({ x: 4, y: 6 });
    expect(anchorFor('unknown', { x: 4, y: 7 })).toEqual({ x: 4, y: 7 });
  });

  it('verschiebt die Vorschau beim erneuten Antippen einer anderen Kachel', () => {
    const { tool } = setup();
    tool.chooseItem('flower');
    tool.tap({ x: 2, y: 2 });
    tool.tap({ x: 8, y: 9 });
    expect(tool.preview()).toMatchObject({ kind: 'place', x: 8, y: 9, result: 'ok' });
  });

  it('zeigt rot (nicht bestätigbar) auf Wasser und sendet beim ✓ nichts', () => {
    const state = grassState();
    setTerrainAt(state, 3, 3, 'water');
    const { tool, sent } = setup(state);
    tool.chooseItem('flower');
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
    tool.chooseItem('flower');
    tool.tap({ x: 4, y: 4 });
    expect(tool.preview()).toMatchObject({ result: 'blocked' });
    tool.chooseItem('flower');
    tool.chooseItem('house-red');
    tool.tap({ x: 15, y: 15 });
    expect(tool.preview()).toMatchObject({ result: 'outOfMap' });
  });

  it('baut beim ✓, behält das Werkzeug und löscht die Vorschau – mehrere Blumen nacheinander', () => {
    const { state, tool, sent } = setup();
    tool.chooseItem('flower');
    for (const x of [2, 4, 6]) {
      tool.tap({ x, y: 3 });
      expect(tool.confirm()).toBeUndefined();
      expect(tool.tool).toBe('place');
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
    tool.chooseItem('house-red');
    tool.chooseItem('house-yellow');
    tool.tap({ x: 6, y: 6 });
    tool.confirm();
    expect(state.buildings).toEqual([{ id: 1, type: 'house-yellow', x: 6, y: 5 }]);
  });

  it('wertet die Vorschau mit der neuen Variante neu aus', () => {
    const { tool } = setup();
    tool.chooseItem('flower');
    tool.tap({ x: 15, y: 15 });
    expect(tool.preview()).toMatchObject({ typeId: 'flower', result: 'ok' });
    tool.chooseItem('fountain');
    expect(tool.preview()).toMatchObject({ typeId: 'fountain', result: 'outOfMap' });
  });

  it('bricht beim ✕ ab, ohne etwas zu senden', () => {
    const { tool, sent } = setup();
    tool.chooseItem('flower');
    tool.tap({ x: 3, y: 3 });
    tool.cancel();
    expect(tool.hasPreview).toBe(false);
    expect(tool.tool).toBe('place');
    expect(sent).toEqual([]);
  });

  it('tut beim ✓ ohne Vorschau nichts', () => {
    const { tool, sent } = setup();
    tool.chooseItem('flower');
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
    tool.chooseItem('flower');
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

  it('reißt einen gepflanzten Baum direkt hinter einem Haus ab, auch wenn dort das Dach darüber ragt (R5)', () => {
    const { state, tool, sent } = setup();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 5 }, { type: 'plantTree', typeId: 'tree', x: 5, y: 4 });
    expect(state.world.tiles[4 * state.world.width + 5]).toBe('forest');
    tool.selectTool('demolish');
    tool.tap(roofOverPath.tile, roofOverPath.world);
    expect(tool.preview()).toMatchObject({ kind: 'demolish', tiles: [{ x: 5, y: 4 }], refund: { coins: 5 } });
    tool.confirm();
    expect(sent.at(-1)).toEqual({ type: 'demolish', x: 5, y: 4 });
    expect(state.world.tiles[4 * state.world.width + 5]).toBe('grass');
    expect(state.buildings).toHaveLength(1);
  });

  it('wählt hinter dem Haus ohne gepflanzten Baum weiter das Haus (Dach)', () => {
    const { state, tool } = setup();
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 5, y: 5 });
    tool.selectTool('demolish');
    tool.tap(roofOverEmpty.tile, roofOverEmpty.world);
    const preview = tool.preview();
    expect(preview.kind).toBe('demolish');
    expect(preview.kind === 'demolish' && preview.tiles.some((tile) => tile.x === 5 && tile.y === 5)).toBe(true);
  });

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
    tool.chooseItem('flower');
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
    tool.chooseItem('flower');
    tool.tap({ x: 6, y: 6 });
    expect(tool.preview()).toMatchObject({ typeId: 'flower', x: 6, y: 6 });
    tool.chooseItem('fountain');
    expect(tool.preview()).toMatchObject({ typeId: 'fountain', x: 6, y: 5 });
    tool.chooseItem('bench');
    expect(tool.preview()).toMatchObject({ typeId: 'bench', x: 6, y: 6 });
  });

  it('baut die zuletzt gewählte Variante', () => {
    const { state, tool } = setup();
    tool.chooseItem('flower');
    tool.tap({ x: 6, y: 6 });
    tool.chooseItem('fountain');
    tool.confirm();
    expect(state.buildings).toEqual([{ id: 1, type: 'fountain', x: 6, y: 5 }]);
  });
});

describe('Grund in der Vorschau', () => {
  const hintFor = (terrain: 'water' | 'forest' | 'rock' | 'sand', tool: 'deco' | 'house' = 'deco'): string | undefined => {
    const state = grassState();
    setTerrainAt(state, 6, 6, terrain);
    const ctx = setup(state);
    ctx.tool.chooseItem(tool === 'house' ? 'house-red' : 'flower');
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
    tool.chooseItem('flower');
    tool.tap({ x: 3, y: 3 });
    expect(tool.hint).toBe('hint.occupied');
    tool.chooseItem('house-red');
    tool.tap({ x: 15, y: 15 });
    expect(tool.hint).toBe('hint.edge');
  });

  it('zeigt bei grüner Vorschau wieder den normalen Hinweis', () => {
    const { tool } = setup();
    tool.chooseItem('flower');
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
    tool.chooseItem('flower');
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
  it('lässt alle sechs Produktionsgebäude im Shop wählen und merkt sich den Reiter „Gebäude“', () => {
    const { tool } = setup();
    for (const type of shopItems('production')) {
      expect(tool.chooseItem(type.id), type.id).toBeUndefined();
      expect(tool.item).toBe(type.id);
      expect(tool.shopTab).toBe('production');
    }
    expect(shopItems('production')).toHaveLength(6);
  });

  it('färbt eine zu teure Vorschau rot, sperrt ✓ und sagt, was fehlt', () => {
    const state = grassState();
    setStore(state, { coins: 100, wood: 5 });
    const { tool, sent } = setup(state);
    tool.chooseItem('house-red');
    tool.tap({ x: 6, y: 6 });
    expect(tool.preview()).toMatchObject({ kind: 'place', result: 'cost', missing: { wood: 3 } });
    expect(tool.canConfirm).toBe(false);
    expect(tool.hint).toBe('hint.missing');
    expect(t(tool.hint ?? 'hint.missing', tool.hintParams)).toBe('Dir fehlen 3 Holz. Holz bringt der Holzfäller – oder reiß etwas ab.');
    expect(tool.confirm()).toBe('hint.missing');
    expect(sent).toHaveLength(0);
  });

  it('sagt bei genau einem fehlenden Stück „fehlt“ und nennt mehrere Dinge', () => {
    const state = grassState();
    setStore(state, { coins: 100, wood: 7 });
    const { tool } = setup(state);
    tool.chooseItem('house-red');
    tool.tap({ x: 6, y: 6 });
    expect(tool.hint).toBe('hint.missingOne');
    expect(t(tool.hint ?? 'hint.missing', tool.hintParams)).toBe('Dir fehlt 1 Holz. Holz bringt der Holzfäller – oder reiß etwas ab.');
    setStore(state, { coins: 10 });
    tool.tap({ x: 6, y: 6 });
    expect(t(tool.hint ?? 'hint.missing', tool.hintParams)).toBe('Dir fehlen 30 Taler und 8 Holz. Taler bringt der Markt – oder reiß etwas ab.');
  });

  it('sagt schon beim Wählen einer zu teuren Variante, was fehlt, und wird beim Auffüllen wieder frei', () => {
    const state = grassState();
    setStore(state, { coins: 100, wood: 5 });
    const { tool } = setup(state);
    tool.chooseItem('house-red');
    expect(tool.itemAffordable).toBe(false);
    // Die Karte ist mit Absicht gewählt: der Hinweis sagt gleich, was fehlt.
    expect(tool.hint).toBe('hint.missing');
    expect(t(tool.hint ?? 'hint.missing', tool.hintParams)).toBe('Dir fehlen 3 Holz. Holz bringt der Holzfäller – oder reiß etwas ab.');
    state.inventory['wood'] = 8;
    expect(tool.itemAffordable).toBe(true);
    expect(tool.hint).toBe('hint.place');
    expect(tool.hintParams).toBeUndefined();
    tool.selectTool('path');
    expect(tool.itemAffordable).toBe(true);
  });

  it('baut mit ✓, sobald alles da ist, und bucht ab', () => {
    const state = grassState();
    setStore(state, { coins: 100, wood: 20 });
    const { tool } = setup(state);
    tool.chooseItem('house-red');
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
    tool.chooseItem('lumberjack');
    tool.tap({ x: 3, y: 15 });
    expect(tool.preview()).toMatchObject({ kind: 'place', result: 'noNearby', terrain: 'forest' });
    expect(tool.hint).toBe('hint.noForest');
    expect(t('hint.noForest')).toBe('Hier sind keine Bäume in der Nähe.');
    expect(tool.canConfirm).toBe(false);
    tool.tap({ x: 11, y: 4 });
    expect(tool.preview()).toMatchObject({ kind: 'place', result: 'ok', connected: false });
    // Ohne Weg daneben ist die Vorschau grün, der Hinweis sagt aber, was als Nächstes zu tun ist.
    expect(tool.hint).toBe('hint.noPathWork');
    expect(tool.canConfirm).toBe(true);
  });

  it('sagt beim Steinbruch, dass Felsen fehlen', () => {
    const { tool } = setup(grassState(24));
    tool.chooseItem('lumberjack');
    tool.chooseItem('quarry');
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
    tool.chooseItem('flower');
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

describe('Vorschau folgt dem Lager (Korrekturrunde 1)', () => {
  it('wird grün, sobald das Fehlende ins Lager kommt (rote Vorschau war „cost“)', () => {
    const state = grassState();
    setStore(state, { coins: 0 });
    const { tool } = setup(state);
    tool.chooseItem('flower');
    tool.tap({ x: 6, y: 6 });
    expect(tool.preview()).toMatchObject({ kind: 'place', result: 'cost', missing: { coins: 3 } });
    expect(tool.canConfirm).toBe(false);
    const before = tool.version;
    state.inventory['coins'] = 100;
    tool.sync();
    expect(tool.version).toBeGreaterThan(before);
    expect(tool.preview()).toMatchObject({ kind: 'place', result: 'ok' });
    expect(tool.canConfirm).toBe(true);
    expect(tool.hint).toBe('hint.place');
  });

  it('wird rot, sobald das Lager nicht mehr reicht (grüne Vorschau), und ✓ meldet es statt still zu verwerfen', () => {
    const state = grassState();
    setStore(state, { coins: 100 });
    const { tool, sent } = setup(state);
    tool.chooseItem('flower');
    tool.tap({ x: 6, y: 6 });
    expect(tool.canConfirm).toBe(true);
    state.inventory['coins'] = 1;
    expect(tool.preview()).toMatchObject({ result: 'cost', missing: { coins: 2 } });
    expect(tool.canConfirm).toBe(false);
    expect(tool.confirm()).toBe('hint.missing');
    expect(sent).toHaveLength(0);
  });

  it('bleibt ohne Änderung des Lagers beim zwischengespeicherten Ergebnis und zählt dann nicht', () => {
    const state = grassState();
    const { tool } = setup(state);
    tool.chooseItem('flower');
    tool.tap({ x: 6, y: 6 });
    const first = tool.preview();
    const version = tool.version;
    tool.sync();
    expect(tool.preview()).toBe(first);
    expect(tool.version).toBe(version);
  });

  it('zählt Lageränderungen erst bei sync() und nur, solange ein Werkzeug an ist', () => {
    const state = grassState();
    const { tool } = setup(state);
    const before = tool.version;
    state.inventory['coins'] = 1;
    tool.sync();
    expect(tool.version).toBe(before);
    tool.chooseItem('house-red');
    const inTool = tool.version;
    state.inventory['coins'] = 2;
    expect(tool.version).toBe(inTool);
    tool.sync();
    expect(tool.version).toBeGreaterThan(inTool);
  });

  it('rechnet die Erstattung beim Abreißen mit dem aktuellen Stand, auch wenn sich das Lager änderte', () => {
    const state = grassState();
    setStore(state, { coins: 100, wood: 20 });
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 4 });
    const refunds: RefundInfo[] = [];
    const tool = new BuildTool(() => state, (command) => { applyCommand(state, command); }, (info) => refunds.push(info));
    tool.selectTool('demolish');
    tool.tap({ x: 5, y: 5 });
    state.inventory['coins'] = 7;
    expect(tool.preview()).toMatchObject({ kind: 'demolish', refund: { coins: 40, wood: 8 } });
    tool.confirm();
    expect(refunds[0]?.refund).toEqual({ coins: 40, wood: 8 });
    expect(state.inventory['coins']).toBe(47);
  });
});

describe('Hinweise ohne falsche Anleitung (T3, T8)', () => {
  it('sagt bei einem Haus ohne Weg daneben, dass es einen braucht, und lässt ✓ zu', () => {
    const state = grassState();
    setStore(state, { coins: 100, wood: 20 });
    const { tool } = setup(state);
    tool.chooseItem('house-red');
    tool.tap({ x: 6, y: 6 });
    expect(tool.hint).toBe('hint.noPathHouse');
    expect(tool.canConfirm).toBe(true);
  });

  it('zeigt mit Weg daneben den normalen Hinweis', () => {
    const state = grassState();
    setStore(state, { coins: 100, wood: 20 });
    run(state, { type: 'placePaths', tiles: [{ x: 6, y: 7 }] });
    const { tool } = setup(state);
    tool.chooseItem('house-red');
    tool.tap({ x: 6, y: 6 });
    expect(tool.preview()).toMatchObject({ result: 'ok', connected: true });
    expect(tool.hint).toBe('hint.place');
  });

  it('sagt das auch beim Verschieben auf einen Platz ohne Weg', () => {
    const state = grassState();
    setStore(state, { coins: 100, wood: 20 });
    const id = buildConnected(state, 'berry-garden', 2, 2);
    const { tool } = setup(state);
    tool.selectTool('move');
    tool.tap({ x: 2, y: 2 });
    tool.tap({ x: 10, y: 11 });
    expect(tool.preview()).toMatchObject({ kind: 'move', id, target: { result: 'ok', connected: false } });
    expect(tool.hint).toBe('hint.noPathWork');
  });

  it('zeigt nach dem Bauen kein „Dir fehlen …“ für die Karte, die gerade bezahlt wurde, sondern wieder die Anleitung', () => {
    const state = grassState();
    setStore(state, { coins: 40, wood: 8 });
    run(state, { type: 'placePaths', tiles: [{ x: 6, y: 7 }] });
    const { tool } = setup(state);
    tool.chooseItem('house-red');
    tool.chooseItem('house-red');
    tool.tap({ x: 6, y: 6 });
    tool.confirm();
    expect(state.buildings).toHaveLength(1);
    expect(tool.itemAffordable).toBe(false);
    expect(tool.hint).toBe('hint.place');
  });

  it('zeigt bei einem Artikel, der bezahlbar ist, nur die Anleitung – bei einem unbezahlbaren, was fehlt', () => {
    const state = grassState();
    setStore(state, { coins: 3 });
    const { tool } = setup(state);
    tool.chooseItem('flower');
    expect(tool.hint).toBe('hint.place');
    tool.chooseItem('house-red');
    expect(tool.hint).toBe('hint.missing');
  });
});

describe('Bewohner (M6)', () => {
  /** Grass with a red house (room for 2) and a path to it. */
  const withHouse = (): ReturnType<typeof setup> => {
    const ctx = setup();
    run(ctx.state, { type: 'placeBuilding', buildingType: 'house-red', x: 3, y: 3 }, { type: 'placePaths', tiles: [{ x: 3, y: 5 }, { x: 4, y: 5 }] });
    return ctx;
  };

  it('Einladen: die Karte startet sofort die Vorschau (ohne Platz), ✓ sendet inviteResident und geht zurück aufs Anschauen', () => {
    const { state, tool, sent } = withHouse();
    expect(tool.chooseItem('invite')).toBeUndefined();
    expect(tool.tool).toBe('place');
    expect(tool.item).toBe('invite');
    const preview = tool.preview();
    expect(preview.kind).toBe('invite');
    expect(preview.kind === 'invite' ? preview.result : '').toBe('ok');
    expect(preview.kind === 'invite' ? preview.home : undefined).toBe(state.buildings[0]?.id);
    expect(tool.hasPreview).toBe(true);
    expect(tool.canConfirm).toBe(true);
    expect(tool.hint).toBe('hint.invite');
    const coins = state.inventory['coins'] ?? 0;
    expect(tool.confirm()).toBeUndefined();
    expect(sent.at(-1)).toEqual({ type: 'inviteResident', typeId: 'invite' });
    expect(state.residents).toHaveLength(1);
    expect(state.inventory['coins']).toBe(coins - 30);
    expect(tool.tool).toBe('view');
    expect(tool.hasPreview).toBe(false);
  });

  it('ein Tipp auf die Insel ändert an der Einladung nichts; ✕ beendet sie', () => {
    const { tool, sent } = withHouse();
    tool.chooseItem('invite');
    const before = tool.preview();
    expect(tool.tap({ x: 8, y: 8 })).toBeUndefined();
    expect(tool.preview()).toEqual(before);
    tool.cancel();
    expect(tool.tool).toBe('view');
    expect(sent.some((command) => command.type === 'inviteResident')).toBe(false);
  });

  it('ohne freies Haus wird die Einladung nicht gewählt und sagt warum', () => {
    const { tool } = setup();
    expect(tool.chooseItem('invite')).toBe('hint.noHouse');
    expect(tool.tool).toBe('view');
    const full = withHouse();
    full.tool.chooseItem('invite');
    full.tool.confirm();
    full.tool.chooseItem('invite');
    full.tool.confirm();
    expect(full.state.residents).toHaveLength(2);
    expect(full.tool.chooseItem('invite')).toBe('hint.noHouse');
    expect(full.tool.tool).toBe('view');
  });

  it('wird das Haus während der Vorschau voll, ist ✓ aus und der Hinweis sagt es', () => {
    const { state, tool } = withHouse();
    tool.chooseItem('invite');
    run(state, { type: 'inviteResident', typeId: 'invite' }, { type: 'inviteResident', typeId: 'invite' });
    expect(tool.canConfirm).toBe(false);
    expect(tool.hint).toBe('hint.noHouse');
    expect(tool.confirm()).toBe('hint.noHouse');
  });

  it('zu wenig Taler: wählbar, aber ✓ ist aus und der Hinweis nennt, was fehlt', () => {
    const { state, tool, sent } = withHouse();
    setStore(state, { coins: 10 });
    expect(tool.chooseItem('invite')).toBeUndefined();
    expect(tool.canConfirm).toBe(false);
    expect(tool.hint).toBe('hint.missing');
    expect(t(tool.hint ?? 'hint.place', tool.hintParams)).toContain('20');
    expect(tool.confirm()).toBe('hint.missing');
    expect(sent.some((command) => command.type === 'inviteResident')).toBe(false);
  });

  it('Bewohner antippen öffnet seine Karte; ein Gebäude, ein anderes Werkzeug oder closeInfo schließen sie', () => {
    const { state, tool } = withHouse();
    run(state, { type: 'inviteResident', typeId: 'invite' });
    const id = state.residents[0]?.id ?? -1;
    tool.inspectResident(id);
    expect(tool.inspectedResidentId).toBe(id);
    expect(tool.cardOpen).toBe(true);
    tool.closeInfo();
    expect(tool.inspectedResidentId).toBeUndefined();
    expect(tool.cardOpen).toBe(false);
    tool.inspectResident(id);
    // A tap on the island (nothing there) closes it.
    tool.tap({ x: 12, y: 12 });
    expect(tool.inspectedResidentId).toBeUndefined();
    tool.inspectResident(id);
    tool.selectTool('path');
    expect(tool.inspectedResidentId).toBeUndefined();
    tool.exitTool();
    expect(tool.inspectedResidentId).toBeUndefined();
  });

  it('die Karte eines Gebäudes und die eines Bewohners sind nie gleichzeitig offen', () => {
    const { state, tool } = withHouse();
    run(state, { type: 'placeBuilding', buildingType: 'berry-garden', x: 8, y: 3 }, { type: 'placePaths', tiles: [{ x: 8, y: 5 }] });
    const garden = state.buildings.find((b) => b.type === 'berry-garden')?.id ?? -1;
    const worker = state.residents[0]?.id ?? -1;
    expect(worker).toBeGreaterThan(0);
    tool.inspectResident(worker);
    tool.inspect(garden);
    expect(tool.inspectedId).toBe(garden);
    expect(tool.inspectedResidentId).toBeUndefined();
    tool.inspectResident(worker);
    expect(tool.inspectedId).toBeUndefined();
    expect(tool.inspectedResidentId).toBe(worker);
  });

  it('öffnet keine Karte für unbekannte Bewohner und nicht außerhalb des Anschauens', () => {
    const { state, tool } = withHouse();
    tool.inspectResident(99);
    expect(tool.inspectedResidentId).toBeUndefined();
    run(state, { type: 'inviteResident', typeId: 'invite' });
    tool.selectTool('demolish');
    tool.inspectResident(state.residents[0]?.id ?? -1);
    expect(tool.inspectedResidentId).toBeUndefined();
  });

  it('schließt die Karte, wenn es den Bewohner nicht mehr gibt (ein anderes Dorf geladen)', () => {
    const { state, tool } = withHouse();
    run(state, { type: 'inviteResident', typeId: 'invite' });
    tool.inspectResident(state.residents[0]?.id ?? -1);
    state.residents = [];
    tool.refresh();
    expect(tool.inspectedResidentId).toBeUndefined();
  });
});
