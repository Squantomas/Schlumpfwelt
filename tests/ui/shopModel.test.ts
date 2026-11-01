import { describe, expect, it } from 'vitest';
import { BUILDING_TYPES, SHOP_CATEGORIES, buildingType, shopItems, unlockOf } from '../../src/data/buildings';
import { t } from '../../src/data/texts';
import { createInitialState } from '../../src/sim/state';
import { MAX_RESIDENTS } from '../../src/sim/limits';
import type { SimState } from '../../src/sim/state';
import { nameList, newItemsText, noRoomSentence, progressText, roomPrice, roomText, shopCard, shopCards, unlockIcons, unlockSentenceText } from '../../src/ui/shopModel';
import { grassState, run, setStore } from '../sim/helpers';

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
    expect(unlockSentenceText({ kind: 'count', building: 'lumberjack', count: 1 })).toBe('Baue 1× Holzfällerhütte, dann ist es frei.');
    expect(unlockSentenceText({ kind: 'houses', count: 2 })).toBe('Baue 2 Häuser, dann ist es frei.');
    expect(unlockSentenceText({ kind: 'houses', count: 1 })).toBe('Baue ein Haus, dann ist es frei.');
    expect(unlockSentenceText({ kind: 'earned', coins: 1250 })).toBe('Verdiene 1.250 Taler am Markt, dann ist es frei.');
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

  it('jeder Satz für eine gesperrte Karte ist kurz genug für eine Zeile bei 12 px in der Zeile des schmalsten Handys quer (gemessen 5,85 px je Zeichen: höchstens 48 Zeichen bei 296 px; die Höhe misst der Smoke)', () => {
    for (const category of SHOP_CATEGORIES) {
      for (const type of shopItems(category)) {
        const unlock = unlockOf(type.id);
        if (unlock) {
          expect(unlockSentenceText(unlock).length, type.id).toBeLessThanOrEqual(48);
        }
      }
    }
    expect(t('shop.lineDefault').length).toBeLessThanOrEqual(48);
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

describe('Einladen im Shop (M6)', () => {
  it('am Start sind alle Häuser voll: die Karte hat keinen Platz, sagt warum und zeigt Bewohner/Platz', () => {
    const state = createInitialState(1);
    const card = shopCard(state, 'invite');
    expect(card.state).toBe('noRoom');
    expect(card.room).toEqual({ residents: 2, capacity: 2, reason: 'noHouse' });
    expect(noRoomSentence(card)).toBe(t('shop.noHouse'));
    expect(card.room ? roomText(card.room) : '').toBe('2/2');
  });

  it('mit einem freien Haus ist sie kaufbar oder zu teuer – wie jede Karte', () => {
    const state = grassState();
    run(state, { type: 'placeBuilding', buildingType: 'house-big', x: 3, y: 3 });
    const ok = shopCard(state, 'invite');
    expect(ok.state).toBe('ok');
    expect(ok.room).toEqual({ residents: 0, capacity: 4 });
    expect(noRoomSentence(ok)).toBe('');
    setStore(state, { coins: 5 });
    const dear = shopCard(state, 'invite');
    expect(dear.state).toBe('dear');
    expect(dear.missing).toEqual({ coins: 25 });
  });

  it('zählt nur, wer in einem Haus wohnt: Heimatlose machen nie „3/2“, und der Preis steht auch ohne Platz auf der Karte', () => {
    const state = createInitialState(1);
    const one = state.residents[0];
    state.residents.push({ ...(one ?? fakeResident()), id: 99, name: 'Gast', home: null, job: null });
    const card = shopCard(state, 'invite');
    expect(card.state).toBe('noRoom');
    expect(card.room).toEqual({ residents: 2, capacity: 2, reason: 'noHouse' });
    expect(card.room ? roomText(card.room) : '').toBe('2/2');
    expect(roomText({ residents: 3, capacity: 2 })).toBe('2/2');
    expect(roomPrice(card)).toBe(String(buildingType('invite')?.cost['coins'] ?? -1));
    expect(roomPrice(card)).toBe('30');
  });

  it('kein Platz geht vor „zu teuer“', () => {
    const state = createInitialState(1);
    setStore(state, {});
    expect(shopCard(state, 'invite').state).toBe('noRoom');
  });

  it('ist das Dorf voll (500 Bewohner), sagt die Karte das', () => {
    const state = grassState();
    run(state, { type: 'placeBuilding', buildingType: 'house-big', x: 3, y: 3 });
    const one = state.residents[0];
    state.residents = Array.from({ length: MAX_RESIDENTS }, (_, i) => ({ ...(one ?? fakeResident()), id: i + 1, home: null }));
    const card = shopCard(state, 'invite');
    expect(card.state).toBe('noRoom');
    expect(card.room?.reason).toBe('full');
    expect(noRoomSentence(card)).toBe(t('shop.residentsFull'));
  });

  it('die Einladung steht als erste Karte im Reiter Häuser', () => {
    expect(shopItems('houses')[0]?.id).toBe('invite');
  });
});

function fakeResident(): SimState['residents'][number] {
  return { id: 1, name: 'Lumo', hat: 0, home: null, job: null, at: 0, route: [], step: 0, doing: 'stay', goal: 'visit', place: null, timer: 1, carrying: null, seen: 0, trips: 0 };
}
