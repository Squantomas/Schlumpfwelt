import { describe, expect, it } from 'vitest';
import { BUILDING_TYPES, SHOP_CATEGORIES, buildingType, shopItems, unlockOf } from '../../src/data/buildings';
import { t } from '../../src/data/texts';
import { createInitialState } from '../../src/sim/state';
import { nameList, newItemsText, progressText, shopCard, shopCards, unlockIcons, unlockSentenceText } from '../../src/ui/shopModel';
import { setStore } from '../sim/helpers';

describe('shopCards', () => {
  it('liefert zu jedem Reiter eine Karte je Artikel, in der Reihenfolge der Datei', () => {
    const state = createInitialState(1);
    for (const category of SHOP_CATEGORIES) {
      expect(shopCards(state, category).map((card) => card.typeId)).toEqual(shopItems(category).map((type) => type.id));
    }
  });

  it('kaufbar: frei und bezahlbar – am Start sind Haus, Blume, Holzfäller, Baum frei und bezahlbar', () => {
    const state = createInitialState(1);
    for (const id of ['house-red', 'flower', 'lumberjack', 'tree', 'berry-garden', 'market']) {
      expect(shopCard(state, id).state, id).toBe('ok');
    }
  });

  it('zu teuer: frei, aber es fehlt etwas – mit den fehlenden Mengen', () => {
    const state = createInitialState(1);
    setStore(state, { coins: 10, wood: 1 });
    const card = shopCard(state, 'house-red');
    expect(card.state).toBe('dear');
    expect(card.missing).toEqual({ coins: 30, wood: 7 });
    expect(card.lock).toBeUndefined();
  });

  it('gesperrt hat Vorrang vor „zu teuer“, und der Fortschritt steht dabei', () => {
    const state = createInitialState(1);
    setStore(state, {});
    const card = shopCard(state, 'carpenter');
    expect(card.state).toBe('locked');
    expect(card.lock?.progress).toEqual({ current: 0, needed: 1 });
    expect(card.lock?.unlock).toEqual({ kind: 'count', building: 'lumberjack', count: 1 });
    const bench = shopCard(state, 'bench');
    expect(bench.state).toBe('locked');
    expect(bench.lock?.progress).toEqual({ current: 0, needed: 40 });
  });

  it('nach der Freischaltung ist die Karte nicht mehr gesperrt', () => {
    const state = createInitialState(1);
    state.unlocked.push('carpenter');
    expect(shopCard(state, 'carpenter').state).not.toBe('locked');
  });

  it('der Start zeigt in jedem Reiter etwas Kaufbares und etwas Gesperrtes – bis auf Häuser mit Neuem', () => {
    const state = createInitialState(1);
    for (const category of SHOP_CATEGORIES) {
      const cards = shopCards(state, category);
      expect(cards.some((card) => card.state === 'ok'), category).toBe(true);
    }
    expect(shopCards(state, 'production').some((card) => card.state === 'locked')).toBe(true);
    expect(shopCards(state, 'deco').some((card) => card.state === 'locked')).toBe(true);
  });
});

describe('Sätze und Symbole für gesperrte Karten', () => {
  it('nennen Gebäude, Häuser und Taler in kurzen Sätzen', () => {
    expect(unlockSentenceText({ kind: 'count', building: 'lumberjack', count: 1 })).toBe('Baue 1× Holzfällerhütte, dann ist das frei.');
    expect(unlockSentenceText({ kind: 'houses', count: 2 })).toBe('Baue 2 Häuser, dann ist das frei.');
    expect(unlockSentenceText({ kind: 'houses', count: 1 })).toBe('Baue ein Haus, dann ist das frei.');
    expect(unlockSentenceText({ kind: 'earned', coins: 1250 })).toBe('Verdiene 1.250 Taler auf dem Markt, dann ist das frei.');
  });

  it('jede Bedingung der Daten ergibt einen Satz, der in die Hinweisleiste eines Handys passt (höchstens 100 Zeichen)', () => {
    for (const category of SHOP_CATEGORIES) {
      for (const type of shopItems(category)) {
        const unlock = unlockOf(type.id);
        if (unlock) {
          const sentence = unlockSentenceText(unlock);
          expect(sentence.length, type.id).toBeLessThanOrEqual(100);
          expect(sentence, type.id).not.toMatch(/\{/);
        }
      }
    }
  });

  it('jeder Satz für eine gesperrte Karte passt in einer Zeile bei 12 px in die Zeile des schmalsten Handys quer (höchstens 56 Zeichen)', () => {
    for (const category of SHOP_CATEGORIES) {
      for (const type of shopItems(category)) {
        const unlock = unlockOf(type.id);
        if (unlock) {
          expect(unlockSentenceText(unlock).length, type.id).toBeLessThanOrEqual(56);
        }
      }
    }
    expect(t('shop.lineDefault').length).toBeLessThanOrEqual(56);
  });

  it('zeigen als Symbol das Gebäude, ein Haus oder Markt und Taler', () => {
    expect(unlockIcons({ kind: 'count', building: 'lumberjack', count: 1 })).toEqual([{ kind: 'building', id: 'lumberjack' }]);
    expect(unlockIcons({ kind: 'houses', count: 3 })).toEqual([{ kind: 'building', id: 'house-red' }]);
    // Verdiente Taler: der Markt und die Münze – „auf dem Markt verdienen“ (T8).
    expect(unlockIcons({ kind: 'earned', coins: 5 })).toEqual([{ kind: 'building', id: 'market' }, { kind: 'coins', id: 'coins' }]);
  });

  it('schreiben den Fortschritt als „1/3“', () => {
    expect(progressText({ current: 1, needed: 3 })).toBe('1/3');
    expect(progressText({ current: 0, needed: 1 })).toBe('0/1');
  });
});

describe('Meldung „Neu im Shop“', () => {
  it('nennt einen, zwei und drei Namen mit „und“', () => {
    expect(nameList(['bench'])).toBe('Bank');
    expect(nameList(['bench', 'lantern'])).toBe('Bank und Laterne');
    expect(nameList(['bench', 'lantern', 'pond'])).toBe('Bank, Laterne und Teich');
    expect(nameList([])).toBe('');
  });

  it('sagt „Neu im Shop: Bäckerei!“ und nennt bei vielen höchstens drei', () => {
    expect(newItemsText(['bakery'])).toBe('Neu im Shop: Bäckerei!');
    expect(newItemsText(['bench', 'lantern', 'pond', 'fountain'])).toBe('Neu im Shop: Bank, Laterne und Teich!');
    expect(newItemsText(['bench']).length).toBeLessThanOrEqual(100);
    expect(t('shop.newItem', { list: 'X' })).toBe('Neu im Shop: X!');
  });

  it('weist bei der Schreinerei darauf hin, dass Möbel viele Taler bringen (T2)', () => {
    expect(newItemsText(['quarry', 'carpenter'])).toBe('Neu im Shop: Steinbruch und Schreinerei! Möbel bringen viele Taler.');
    expect(newItemsText(['bakery'])).toBe('Neu im Shop: Bäckerei!');
    expect(newItemsText(['bench'])).not.toMatch(/Taler/);
  });

  it('bleibt auch mit den drei längsten Namen in der Hinweisleiste eines Handys (höchstens 100 Zeichen)', () => {
    const longest = BUILDING_TYPES.map((type) => type.id).sort((a, b) => t(buildingType(b)?.nameKey ?? 'build.path').length - t(buildingType(a)?.nameKey ?? 'build.path').length);
    expect(newItemsText(longest.slice(0, 3)).length).toBeLessThanOrEqual(100);
    // Mit dem Zusatzsatz zu den Möbeln (drei lange Namen und die Schreinerei) höchstens 110 Zeichen: vier Zeilen auf dem schmalsten Handy.
    expect(newItemsText([...longest.slice(0, 2), 'carpenter']).length).toBeLessThanOrEqual(110);
  });
});
