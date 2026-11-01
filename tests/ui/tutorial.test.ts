import { describe, expect, it } from 'vitest';
import { TUTORIAL_RULES } from '../../src/data/tutorial';
import { applyCommand, type Command } from '../../src/sim/commands';
import { createInitialState, type SimState } from '../../src/sim/state';
import { BuildTool } from '../../src/ui/buildTool';
import {
  TUTORIAL_DONE,
  advanceTutorial,
  currentStep,
  handPose,
  pathTargets,
  readTutorial,
  skipTutorial,
  startTutorial,
  storeTutorial,
  suggestPlace,
  tutorialFor,
  pickTutorialResident,
  tutorialHint,
  tutorialTarget,
  villageCounts,
  type TutorialRecord,
  type TutorialView,
} from '../../src/ui/tutorial';

const START: TutorialView = { deco: 3, houses: 1, earned: 0, unconnectedHouses: 0, residentCard: false, shopOpen: false, tapped: false };

function stepId(record: TutorialRecord): string | undefined {
  return currentStep(record)?.id;
}

describe('Tutorial: Fortschritt aus dem Dorf (M8)', () => {
  it('hat wenige kurze Schritte in dieser Reihenfolge', () => {
    expect(TUTORIAL_RULES.steps.map((step) => step.id)).toEqual(['resident', 'shop', 'deco', 'coins', 'house', 'path', 'praise']);
  });

  it('geht Schritt für Schritt weiter, sobald das Ziel erreicht ist', () => {
    let record = startTutorial(START);
    expect(stepId(record)).toBe('resident');
    record = advanceTutorial(record, START);
    expect(stepId(record)).toBe('resident');
    record = advanceTutorial(record, { ...START, residentCard: true });
    expect(stepId(record)).toBe('shop');
    record = advanceTutorial(record, { ...START, shopOpen: true });
    expect(stepId(record)).toBe('deco');
    record = advanceTutorial(record, { ...START, deco: 4, earned: 5 });
    expect(stepId(record)).toBe('coins');
    // The market has to earn while this step is shown.
    record = advanceTutorial(record, { ...START, deco: 4, earned: 5 });
    expect(stepId(record)).toBe('coins');
    record = advanceTutorial(record, { ...START, deco: 4, earned: 6 });
    expect(stepId(record)).toBe('house');
    record = advanceTutorial(record, { ...START, deco: 4, earned: 6, houses: 2, unconnectedHouses: 1 });
    expect(stepId(record)).toBe('path');
    record = advanceTutorial(record, { ...START, deco: 4, earned: 6, houses: 2, unconnectedHouses: 1, tapped: true });
    expect(stepId(record)).toBe('path');
    record = advanceTutorial(record, { ...START, deco: 4, earned: 6, houses: 2, unconnectedHouses: 0, tapped: true });
    // The tap of the ✓ that laid the path does not also end the praise.
    expect(stepId(record)).toBe('praise');
    record = advanceTutorial(record, { ...START, deco: 4, earned: 6, houses: 2 });
    expect(stepId(record)).toBe('praise');
    record = advanceTutorial(record, { ...START, deco: 4, earned: 6, houses: 2, tapped: true });
    expect(record.status).toBe('done');
    expect(currentStep(record)).toBeUndefined();
  });

  it('jeder Weg zählt: was früher erledigt wurde, wird übersprungen', () => {
    let record = startTutorial(START);
    // Before tapping a resident the child already opened the shop and built a house with a path.
    record = advanceTutorial(record, { ...START, shopOpen: true });
    record = advanceTutorial(record, { ...START, houses: 2 });
    expect(stepId(record)).toBe('resident');
    record = advanceTutorial(record, { ...START, houses: 2, residentCard: true });
    // shop: seen; deco: not yet.
    expect(stepId(record)).toBe('deco');
    record = advanceTutorial(record, { ...START, houses: 2, deco: 5, earned: 3 });
    expect(stepId(record)).toBe('coins');
    record = advanceTutorial(record, { ...START, houses: 2, deco: 5, earned: 4 });
    // house: built before; path: the house has one.
    expect(stepId(record)).toBe('praise');
  });

  it('Abreißen senkt die Grundlage: danach zählt jede neue Deko', () => {
    let record = startTutorial(START);
    record = advanceTutorial(record, { ...START, residentCard: true, shopOpen: true });
    expect(stepId(record)).toBe('deco');
    record = advanceTutorial(record, { ...START, deco: 1 });
    record = advanceTutorial(record, { ...START, deco: 2 });
    expect(stepId(record)).toBe('coins');
  });

  it('gibt dasselbe Objekt zurück, wenn sich nichts ändert (nichts zu speichern)', () => {
    const record = advanceTutorial(startTutorial(START), { ...START, residentCard: true });
    expect(advanceTutorial(record, START)).toBe(record);
    expect(advanceTutorial(TUTORIAL_DONE, { ...START, tapped: true })).toBe(TUTORIAL_DONE);
  });

  it('Überspringen beendet es für immer', () => {
    const skipped = skipTutorial(startTutorial(START));
    expect(skipped.status).toBe('skipped');
    expect(currentStep(skipped)).toBeUndefined();
    expect(advanceTutorial(skipped, { ...START, residentCard: true })).toBe(skipped);
    expect(tutorialFor('new', storeTutorial(skipped), START).status).toBe('skipped');
    expect(tutorialFor('loaded', storeTutorial(skipped), START).status).toBe('skipped');
  });

  it('nur ein neues Dorf beginnt es; ein geladenes ohne Eintrag (vor M8) gilt als fertig', () => {
    expect(tutorialFor('new', undefined, START)).toEqual(startTutorial(START));
    expect(tutorialFor('loaded', undefined, START)).toEqual(TUTORIAL_DONE);
    expect(tutorialFor('loaded', { nonsense: true }, START)).toEqual(TUTORIAL_DONE);
    const middle = advanceTutorial(startTutorial(START), { ...START, residentCard: true });
    // Reload in the middle: it goes on where it was.
    expect(tutorialFor('loaded', JSON.parse(JSON.stringify(storeTutorial(middle))), START)).toEqual(middle);
    // A new village (the old one is gone) starts it again – unless it was finished.
    expect(stepId(tutorialFor('new', storeTutorial(middle), START))).toBe('resident');
    expect(tutorialFor('new', storeTutorial(TUTORIAL_DONE), START).status).toBe('done');
  });

  it('liest nur, was es selbst geschrieben hat, und wirft nie', () => {
    const good = storeTutorial(startTutorial(START));
    expect(readTutorial(good)).toEqual(startTutorial(START));
    const broken: unknown[] = [null, 3, 'x', [], {}, { ...good, format: 'other' }, { ...good, status: 'maybe' }, { ...good, step: -1 }, { ...good, step: 1.5 }, { ...good, base: null }, { ...good, earned: 'many' }];
    for (const raw of broken) {
      expect(() => readTutorial(raw)).not.toThrow();
      expect(readTutorial(raw)).toBeUndefined();
    }
    expect(readTutorial({ ...good, step: 99 })).toEqual(TUTORIAL_DONE);
    expect(readTutorial({ ...good, seen: 'x' })).toEqual(startTutorial(START));
  });
});

describe('Tutorial: wohin die Hand zeigt (M8)', () => {
  const ui = { tool: 'view', shopTab: 'houses', item: undefined, preview: { kind: 'none' }, canConfirm: false } as const;
  const step = (id: string) => TUTORIAL_RULES.steps.find((s) => s.id === id);

  it('auf einen Bewohner, den Shop-Knopf, die Lagerleiste', () => {
    expect(tutorialTarget(step('resident'), ui)).toEqual({ kind: 'resident' });
    expect(tutorialTarget(step('shop'), ui)).toEqual({ kind: 'spot', name: 'tool-shop' });
    expect(tutorialTarget(step('coins'), ui)).toEqual({ kind: 'spot', name: 'stock' });
    expect(tutorialTarget(step('praise'), ui)).toEqual({ kind: 'none' });
    expect(tutorialTarget(undefined, ui)).toEqual({ kind: 'none' });
  });

  it('das Lob zeigt auf nichts und geht vor den Hinweis des Werkzeugs; über dem Shop erst das ✕', () => {
    expect(tutorialHint(step('praise'), { ...ui, tool: 'path' })).toEqual({ target: { kind: 'none' }, sentence: 'praise', firm: true });
    expect(tutorialHint(step('praise'), ui)).toEqual({ target: { kind: 'none' }, sentence: 'praise', firm: true });
    expect(tutorialHint(step('praise'), { ...ui, tool: 'shop' })).toEqual({ target: { kind: 'spot', name: 'shop-close' }, sentence: 'closeShop', firm: false });
  });

  it('erst zurück zum Anschauen, wenn ein anderes Werkzeug an ist – mit eigenem Satz', () => {
    expect(tutorialHint(step('resident'), { ...ui, tool: 'shop' })).toEqual({ target: { kind: 'spot', name: 'shop-close' }, sentence: 'closeShop', firm: false });
    expect(tutorialHint(step('deco'), { ...ui, tool: 'demolish' })).toEqual({ target: { kind: 'spot', name: 'exit' }, sentence: 'exit', firm: true });
    expect(tutorialHint(step('path'), { ...ui, tool: 'shop' })).toEqual({ target: { kind: 'spot', name: 'shop-close' }, sentence: 'closeShop', firm: false });
    expect(tutorialHint(step('path'), { ...ui, tool: 'place', item: 'flower' })).toEqual({ target: { kind: 'spot', name: 'exit' }, sentence: 'exit', firm: true });
    expect(tutorialHint(step('resident'), { ...ui, tool: 'move' })).toEqual({ target: { kind: 'spot', name: 'exit' }, sentence: 'exit', firm: true });
  });

  it('Taler: immer auf die Lagerleiste, mit jedem Werkzeug und über dem Shop – kein Wechsel nötig', () => {
    for (const tool of ['view', 'place', 'path', 'move', 'demolish', 'shop'] as const) {
      expect(tutorialHint(step('coins'), { ...ui, tool, item: 'flower' })).toEqual({ target: { kind: 'spot', name: 'stock' }, sentence: 'coins', firm: true });
    }
  });

  it('eine offene Karte: die Hand zeigt auf ihr ✕, der Satz sagt es (der erste Schritt gilt schon beim Öffnen)', () => {
    for (const id of ['shop', 'deco', 'coins', 'house', 'path', 'praise']) {
      for (const card of ['resident', 'info'] as const) {
        expect(tutorialHint(step(id), { ...ui, card })).toEqual({ target: { kind: 'spot', name: 'card-close' }, sentence: 'closeCard', firm: true });
      }
    }
    expect(tutorialHint(step('resident'), { ...ui, card: 'info' })?.target).toEqual({ kind: 'resident' });
  });

  it('das Werkzeug sagt selbst, was die Hand zeigt (Platz, ✓, Weg); der Chip und der Pfeil haben eigene Sätze', () => {
    expect(tutorialHint(step('deco'), { ...ui, tool: 'place', item: 'flower' })).toEqual({ target: { kind: 'place', typeId: 'flower' }, sentence: 'deco', firm: false });
    expect(tutorialHint(step('deco'), { ...ui, tool: 'place', item: 'flower', canConfirm: true })).toEqual({ target: { kind: 'spot', name: 'confirm' }, sentence: 'deco', firm: false });
    expect(tutorialHint(step('house'), { ...ui, tool: 'place', item: 'flower' })).toEqual({ target: { kind: 'spot', name: 'chip' }, sentence: 'chip', firm: true });
    expect(tutorialHint(step('path'), { ...ui, tool: 'path' })).toEqual({ target: { kind: 'pathStart' }, sentence: 'path', firm: false });
    expect(tutorialHint(step('house'), { ...ui, tool: 'shop' })).toEqual({ target: { kind: 'spot', name: 'item-house-red' }, sentence: 'house', firm: false });
    expect(tutorialHint(undefined, ui)).toBeUndefined();
  });

  it('Blume: Shop, Reiter Deko, Karte, Platz, ✓', () => {
    const deco = step('deco');
    expect(tutorialTarget(deco, ui)).toEqual({ kind: 'spot', name: 'tool-shop' });
    expect(tutorialTarget(deco, { ...ui, tool: 'shop' })).toEqual({ kind: 'spot', name: 'tab-deco' });
    expect(tutorialTarget(deco, { ...ui, tool: 'shop', shopTab: 'deco' })).toEqual({ kind: 'spot', name: 'item-flower' });
    expect(tutorialTarget(deco, { ...ui, tool: 'place', item: 'bush' })).toEqual({ kind: 'place', typeId: 'bush' });
    expect(tutorialTarget(deco, { ...ui, tool: 'place', item: 'flower', canConfirm: true })).toEqual({ kind: 'spot', name: 'confirm' });
    // A house while a decoration is asked for: back to the shop with the chip.
    expect(tutorialTarget(deco, { ...ui, tool: 'place', item: 'house-red' })).toEqual({ kind: 'spot', name: 'chip' });
  });

  it('Haus: Reiter Häuser, Karte, Platz, ✓', () => {
    const house = step('house');
    expect(tutorialTarget(house, { ...ui, tool: 'shop', shopTab: 'deco' })).toEqual({ kind: 'spot', name: 'tab-houses' });
    expect(tutorialTarget(house, { ...ui, tool: 'shop' })).toEqual({ kind: 'spot', name: 'item-house-red' });
    expect(tutorialTarget(house, { ...ui, tool: 'place', item: 'house-blue' })).toEqual({ kind: 'place', typeId: 'house-blue' });
    expect(tutorialTarget(house, { ...ui, tool: 'place', item: 'flower' })).toEqual({ kind: 'spot', name: 'chip' });
  });

  it('Weg: Werkzeug, Anfang, Ende, ✓', () => {
    const path = step('path');
    expect(tutorialTarget(path, ui)).toEqual({ kind: 'spot', name: 'tool-path' });
    expect(tutorialTarget(path, { ...ui, tool: 'path' })).toEqual({ kind: 'pathStart' });
    expect(tutorialTarget(path, { ...ui, tool: 'path', preview: { kind: 'path', tiles: [{ x: 1, y: 1, status: 'ok' }] } })).toEqual({ kind: 'pathEnd' });
    expect(tutorialTarget(path, { ...ui, tool: 'path', preview: { kind: 'path', tiles: [], error: 'noRoute' } })).toEqual({ kind: 'pathEnd' });
    expect(tutorialTarget(path, { ...ui, tool: 'path', preview: { kind: 'path', tiles: [] }, canConfirm: true })).toEqual({ kind: 'spot', name: 'confirm' });
  });

  it('Bewohner: erst im freien Band, sonst sichtbar und nicht unter einer Leiste, sonst die Kamera hin (568×320)', () => {
    // A phone held sideways (568×320): the band between store bar and hint bar is only 98 px high.
    const size = { width: 568, height: 320 };
    const band = { top: 48, bottom: 146 };
    // Hint bar (146–218) and toolbar (228–312) below the band, both between x 56 and 476.
    const hintBar = (x: number, y: number) => y >= 146 && x >= 56 && x <= 476;
    const eppi = { id: 1, x: 241, y: 137 };
    const rindo = { id: 2, x: 363, y: 233 };
    // Eppi is in the band, but low in it (the old rule wanted 24 px inside and found nobody).
    expect(pickTutorialResident([eppi, rindo], size, band, undefined, hintBar)).toEqual({ ...eppi, onScreen: true });
    // Only Rindo, under the toolbar: nobody can be tapped – the camera should glide to him.
    expect(pickTutorialResident([rindo], size, band, undefined, hintBar)).toEqual({ ...rindo, onScreen: false });
    // Right of the bars: on the screen and free, so the hand points there.
    const free = { id: 3, x: 520, y: 260 };
    expect(pickTutorialResident([rindo, free], size, band, undefined, hintBar)).toEqual({ ...free, onScreen: true });
    // Off the screen: the nearest one, for the camera.
    expect(pickTutorialResident([{ id: 4, x: -400, y: 90 }, { id: 5, x: 900, y: 90 }], size, band, undefined, () => false)).toEqual({ id: 5, x: 900, y: 90, onScreen: false });
    expect(pickTutorialResident([], size, band, undefined, () => false)).toBeUndefined();
  });

  it('Bewohner: der von vorher bleibt, solange er in der besten Gruppe ist', () => {
    const size = { width: 1024, height: 768 };
    const band = { top: 80, bottom: 600 };
    const middle = { id: 1, x: 512, y: 340 };
    const side = { id: 2, x: 200, y: 200 };
    expect(pickTutorialResident([middle, side], size, band, undefined, () => false)?.id).toBe(1);
    expect(pickTutorialResident([middle, side], size, band, 2, () => false)?.id).toBe(2);
    // The one from before went under a bar: the hand moves to one in the band.
    expect(pickTutorialResident([middle, { ...side, y: 700 }], size, band, 2, () => false)?.id).toBe(1);
  });

  it('die Hand zeigt von oben, bei Zielen oben auf dem Schirm von unten, und bleibt auf dem Schirm', () => {
    expect(handPose({ x: 200, y: 500 }, { width: 400, height: 800 })).toEqual({ x: 200, y: 500, fromBelow: false });
    expect(handPose({ x: 200, y: 100 }, { width: 400, height: 800 })).toEqual({ x: 200, y: 100, fromBelow: true });
    expect(handPose({ x: -50, y: 2000 }, { width: 400, height: 800 })).toEqual({ x: 28, y: 772, fromBelow: false });
  });
});

/** The real start village, with a tool whose commands are applied at once. */
function game(): { state: SimState; tool: BuildTool } {
  const state = createInitialState(1);
  const tool = new BuildTool(
    () => state,
    (command: Command) => {
      applyCommand(state, command);
    },
  );
  return { state, tool };
}

function view(state: SimState, extra: Partial<TutorialView> = {}): TutorialView {
  return { ...villageCounts(state), earned: state.earnedCoins, residentCard: false, shopOpen: false, tapped: false, ...extra };
}

describe('Tutorial im echten Startdorf: die Hand führt zum Ziel (M8)', () => {
  it('das Startdorf: drei Deko, ein Haus mit Weg', () => {
    const { state } = game();
    expect(villageCounts(state)).toEqual({ deco: 3, houses: 1, unconnectedHouses: 0 });
  });

  it('Blume und Haus an die vorgeschlagenen Plätze, dann der Weg zum Haus', () => {
    const { state, tool } = game();
    let record = startTutorial(view(state));
    record = advanceTutorial(record, view(state, { residentCard: true, shopOpen: true }));
    expect(stepId(record)).toBe('deco');
    const near = { x: state.buildings[0]?.x ?? 0, y: state.buildings[0]?.y ?? 0 };

    tool.selectTool('shop');
    tool.chooseItem('flower');
    const flower = suggestPlace(state, 'flower', near);
    expect(flower).toBeDefined();
    tool.tap(flower ?? near);
    expect(tool.canConfirm).toBe(true);
    expect(tutorialTarget(currentStep(record), { tool: tool.tool, shopTab: tool.shopTab, item: tool.item, preview: tool.preview(), canConfirm: tool.canConfirm })).toEqual({ kind: 'spot', name: 'confirm' });
    tool.confirm();
    tool.exitTool();
    record = advanceTutorial(record, view(state));
    expect(stepId(record)).toBe('coins');
    record = advanceTutorial(record, view(state, { earned: state.earnedCoins + 1 }));
    expect(stepId(record)).toBe('house');

    tool.selectTool('shop');
    tool.chooseItem('house-red');
    const house = suggestPlace(state, 'house-red', near);
    expect(house).toBeDefined();
    tool.tap(house ?? near);
    expect(tool.canConfirm).toBe(true);
    tool.confirm();
    tool.exitTool();
    record = advanceTutorial(record, view(state));
    // The suggested place has no path yet: the next step has something to do.
    expect(stepId(record)).toBe('path');
    expect(villageCounts(state).unconnectedHouses).toBe(1);

    const targets = pathTargets(state);
    expect(targets).toBeDefined();
    tool.selectTool('path');
    tool.tap(targets?.start ?? near);
    expect(tutorialTarget(currentStep(record), { tool: tool.tool, shopTab: tool.shopTab, item: tool.item, preview: tool.preview(), canConfirm: tool.canConfirm })).toEqual({ kind: 'pathEnd' });
    tool.tap(targets?.end ?? near);
    expect(tool.canConfirm).toBe(true);
    tool.confirm();
    record = advanceTutorial(record, view(state));
    expect(stepId(record)).toBe('praise');
    expect(pathTargets(state)).toBeUndefined();
  });

  it('kein freier Platz in der Nähe: kein Vorschlag (die Hand zeigt dann nichts)', () => {
    const { state } = game();
    expect(suggestPlace(state, 'flower', { x: 1, y: 1 }, 1)).toBeUndefined();
  });
});
