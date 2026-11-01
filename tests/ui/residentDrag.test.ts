import { describe, expect, it } from 'vitest';
import { applyCommand, type Command } from '../../src/sim/commands';
import type { SimState } from '../../src/sim/state';
import { DROP_DWELL_MS, ResidentDrag, homeTargetAt, houseAtPoint } from '../../src/ui/residentDrag';
import { TILE_SIZE } from '../../src/ui/style';
import { fillTerrain, grassState, run } from '../sim/helpers';

const idOf = (state: SimState, type: string, x: number, y: number): number => {
  const id = state.buildings.find((b) => b.type === type && b.x === x && b.y === y)?.id;
  if (id === undefined) {
    throw new Error(`${type} fehlt`);
  }
  return id;
};

/** Die Mitte einer Kachel in Welt-px. */
const tileCenter = (x: number, y: number): { x: number; y: number } => ({ x: (x + 0.5) * TILE_SIZE, y: (y + 0.5) * TILE_SIZE });

/**
 * 32×32 Wiese mit Weg auf y 10: Beerengarten (4, 11) und Markt (20, 11), kleines Haus (4, 8) mit beiden Arbeitern, großes
 * Haus (12, 7) und ein zweites kleines (24, 8), beide leer.
 */
function setup(): { state: SimState; drag: ResidentDrag; sent: Command[]; small: number; big: number; other: number; gardener: number } {
  const state = grassState(32);
  run(
    state,
    { type: 'placePaths', tiles: Array.from({ length: 28 }, (_, i) => ({ x: 2 + i, y: 10 })) },
    { type: 'placeBuilding', buildingType: 'house-red', x: 4, y: 8 },
    { type: 'placeBuilding', buildingType: 'berry-garden', x: 4, y: 11 },
    { type: 'placeBuilding', buildingType: 'market', x: 20, y: 11 },
    { type: 'placeBuilding', buildingType: 'house-big', x: 12, y: 7 },
    { type: 'placeBuilding', buildingType: 'house-blue', x: 24, y: 8 },
  );
  const sent: Command[] = [];
  const drag = new ResidentDrag(
    () => state,
    (command) => {
      sent.push(command);
      applyCommand(state, command);
    },
  );
  const garden = idOf(state, 'berry-garden', 4, 11);
  const gardener = state.residents.find((r) => r.job === garden)?.id;
  if (gardener === undefined) {
    throw new Error('Gärtner fehlt');
  }
  return { state, drag, sent, small: idOf(state, 'house-red', 4, 8), big: idOf(state, 'house-big', 12, 7), other: idOf(state, 'house-blue', 24, 8), gardener };
}

describe('houseAtPoint und homeTargetAt', () => {
  it('trifft ein Haus über seinen Grundriss und sein Dach, nur Häuser zählen', () => {
    const { state, big, small, gardener } = setup();
    expect(houseAtPoint(state, tileCenter(13, 8))).toBe(big);
    // The roof reaches 130 px over the footprint of the big house (y 7).
    expect(houseAtPoint(state, { x: 13 * TILE_SIZE, y: 7 * TILE_SIZE - 100 })).toBe(big);
    expect(houseAtPoint(state, tileCenter(5, 9))).toBe(small);
    // Production building, path, meadow: no house.
    expect(houseAtPoint(state, tileCenter(5, 12))).toBeUndefined();
    expect(houseAtPoint(state, tileCenter(8, 10))).toBeUndefined();
    expect(houseAtPoint(state, tileCenter(9, 4))).toBeUndefined();
    expect(homeTargetAt(state, gardener, tileCenter(9, 4))).toBeUndefined();
    expect(homeTargetAt(state, gardener, tileCenter(13, 8))).toEqual({ houseId: big, result: 'ok', used: 0, capacity: 4 });
    expect(homeTargetAt(state, gardener, tileCenter(5, 9))).toEqual({ houseId: small, result: 'same', used: 2, capacity: 2 });
  });

  it('eine Blume vor dem Dach versteckt das Haus nicht', () => {
    const { state, big } = setup();
    run(state, { type: 'placeBuilding', buildingType: 'flower', x: 13, y: 6 });
    expect(houseAtPoint(state, { x: 13.5 * TILE_SIZE, y: 6.8 * TILE_SIZE })).toBe(big);
  });
});

describe('ResidentDrag: einen Bewohner auf ein Haus ziehen', () => {
  it('greifen, tragen, kurz über einem Haus mit Platz halten, loslassen: assignHome', () => {
    const { state, drag, sent, big, gardener } = setup();
    expect(drag.grab(gardener, tileCenter(5, 10))).toBe(true);
    // Before the first move nothing is carried (a tap opens the card).
    expect(drag.carried).toBeUndefined();
    const version = drag.version;
    drag.carry(tileCenter(9, 4));
    expect(drag.carried).toEqual({ residentId: gardener, at: tileCenter(9, 4), target: undefined, ready: false });
    drag.update(1000);
    drag.carry(tileCenter(13, 8));
    expect(drag.carried?.target).toEqual({ houseId: big, result: 'ok', used: 0, capacity: 4 });
    expect(drag.version).toBeGreaterThan(version);
    // The time over the house starts with the first frame there, not with the frames over the meadow.
    drag.update(1100);
    drag.update(1100 + DROP_DWELL_MS - 1);
    expect(drag.carried?.ready).toBe(false);
    const waiting = drag.version;
    drag.update(1100 + DROP_DWELL_MS);
    expect(drag.carried?.ready).toBe(true);
    expect(drag.version).toBe(waiting + 1);
    // Moving within the same house keeps it green.
    drag.carry(tileCenter(14, 8));
    expect(drag.carried?.ready).toBe(true);
    const result = drag.drop(tileCenter(13, 8));
    expect(result).toEqual({ residentId: gardener, moved: true, target: { houseId: big, result: 'ok', used: 0, capacity: 4 } });
    expect(sent).toEqual([{ type: 'assignHome', residentId: gardener, houseId: big }]);
    expect(state.residents.find((r) => r.id === gardener)?.home).toBe(big);
    expect(drag.carried).toBeUndefined();
  });

  it('auf ein volles Haus, das eigene Haus oder daneben: nichts passiert', () => {
    const { state, drag, sent, small, gardener } = setup();
    run(state, { type: 'inviteResident', typeId: 'invite' });
    const guest = state.residents.find((r) => r.job === null);
    if (!guest) {
      throw new Error('Gast fehlt');
    }
    // The guest lives in the big house now; the small one is full.
    const before = structuredClone(state);
    expect(drag.grab(guest.id, tileCenter(13, 8))).toBe(true);
    drag.carry(tileCenter(5, 9));
    expect(drag.carried?.target).toEqual({ houseId: small, result: 'full', used: 2, capacity: 2 });
    // A full house never turns green, however long the finger stays.
    drag.update(0);
    drag.update(5000);
    expect(drag.carried?.ready).toBe(false);
    expect(drag.drop(tileCenter(5, 9))).toEqual({ residentId: guest.id, moved: false, target: { houseId: small, result: 'full', used: 2, capacity: 2 } });
    expect(drag.grab(gardener, tileCenter(5, 10))).toBe(true);
    drag.carry(tileCenter(5, 9));
    expect(drag.drop(tileCenter(5, 9))?.target?.result).toBe('same');
    expect(drag.grab(gardener, tileCenter(5, 10))).toBe(true);
    drag.carry(tileCenter(9, 4));
    expect(drag.drop(tileCenter(9, 4))).toEqual({ residentId: gardener, moved: false, target: undefined });
    expect(sent).toEqual([]);
    expect(state).toEqual(before);
  });

  it('beim Loslassen zählt der Stand von jetzt: ist das Haus inzwischen voll, passiert nichts', () => {
    const { state, drag, sent, other, gardener } = setup();
    expect(drag.grab(gardener, tileCenter(5, 10))).toBe(true);
    drag.carry(tileCenter(25, 9));
    expect(drag.carried?.target?.result).toBe('ok');
    drag.update(0);
    drag.update(DROP_DWELL_MS);
    expect(drag.carried?.ready).toBe(true);
    // Meanwhile the trader and a guest move into the second small house: it is full now.
    run(state, { type: 'inviteResident', typeId: 'invite' });
    const others = state.residents.filter((r) => r.id !== gardener);
    run(state, ...others.map((r): Command => ({ type: 'assignHome', residentId: r.id, houseId: other })));
    expect(state.residents.filter((r) => r.home === other)).toHaveLength(2);
    expect(drag.drop(tileCenter(25, 9))?.moved).toBe(false);
    expect(sent).toEqual([]);
  });

  it('ohne Bewegung losgelassen, abgebrochen (zweiter Finger) oder ohne Greifen: kein Befehl', () => {
    const { drag, sent, gardener } = setup();
    expect(drag.drop(tileCenter(13, 8))).toBeUndefined();
    drag.carry(tileCenter(13, 8));
    expect(drag.carried).toBeUndefined();
    expect(drag.grab(gardener, tileCenter(5, 10))).toBe(true);
    drag.cancel();
    expect(drag.carried).toBeUndefined();
    expect(drag.drop(tileCenter(13, 8))).toBeUndefined();
    expect(drag.grab(gardener, tileCenter(5, 10))).toBe(true);
    drag.carry(tileCenter(13, 8));
    const version = drag.version;
    drag.cancel();
    expect(drag.version).toBe(version + 1);
    expect(drag.carried).toBeUndefined();
    expect(sent).toEqual([]);
  });

  it('wer nicht da ist oder noch auf dem Boot sitzt, lässt sich nicht greifen', () => {
    const state = grassState(24);
    fillTerrain(state, 0, 0, 24, 3, 'water');
    fillTerrain(state, 0, 21, 24, 3, 'water');
    fillTerrain(state, 0, 0, 3, 24, 'water');
    fillTerrain(state, 21, 0, 3, 24, 'water');
    run(state, { type: 'placeBuilding', buildingType: 'house-big', x: 10, y: 10 }, { type: 'inviteResident', typeId: 'invite' });
    const guest = state.residents[0];
    expect(guest?.doing).toBe('boat');
    const drag = new ResidentDrag(
      () => state,
      () => {
        throw new Error('kein Befehl erwartet');
      },
    );
    expect(drag.grab(guest?.id ?? 0, tileCenter(5, 5))).toBe(false);
    expect(drag.grab(999, tileCenter(5, 5))).toBe(false);
    drag.carry(tileCenter(11, 11));
    expect(drag.carried).toBeUndefined();
  });
});

describe('ResidentDrag: was neu gezeichnet werden muss', () => {
  it('die Version zählt nur Beginn, Ende und einen anderen Hausstand – nicht jede Bewegung über die Wiese', () => {
    const { drag, gardener } = setup();
    drag.grab(gardener, tileCenter(5, 10));
    const start = drag.version;
    drag.carry(tileCenter(9, 4));
    expect(drag.version).toBe(start + 1);
    drag.carry(tileCenter(9, 3));
    drag.carry({ x: 9.2 * TILE_SIZE, y: 3.4 * TILE_SIZE });
    expect(drag.version).toBe(start + 1);
    expect(drag.carried?.at).toEqual({ x: 9.2 * TILE_SIZE, y: 3.4 * TILE_SIZE });
    drag.carry(tileCenter(13, 8));
    expect(drag.version).toBe(start + 2);
    drag.carry(tileCenter(14, 8));
    expect(drag.version).toBe(start + 2);
    drag.carry(tileCenter(9, 4));
    expect(drag.version).toBe(start + 3);
  });

  it('über einer Leiste oder Karte gibt es kein Haus: Loslassen dort tut nichts', () => {
    const { drag, sent, gardener } = setup();
    drag.grab(gardener, tileCenter(5, 10));
    drag.carry(tileCenter(13, 8), true);
    expect(drag.carried?.target).toBeUndefined();
    expect(drag.drop(tileCenter(13, 8), true)).toEqual({ residentId: gardener, moved: false, target: undefined });
    expect(sent).toEqual([]);
  });
});

describe('ResidentDrag: eine kleine Hürde gegen versehentliches Umziehen', () => {
  it('ein schnelles Wischen über ein Haus mit Platz zieht niemanden um', () => {
    const { state, drag, sent, big, gardener } = setup();
    const before = structuredClone(state);
    drag.grab(gardener, tileCenter(5, 10));
    // One frame on the way, then over the big house and let go within the same few frames.
    drag.carry(tileCenter(9, 9));
    drag.update(0);
    drag.carry(tileCenter(13, 8));
    drag.update(16);
    drag.update(16 + DROP_DWELL_MS - 20);
    expect(drag.carried?.target?.result).toBe('ok');
    expect(drag.carried?.ready).toBe(false);
    expect(drag.drop(tileCenter(13, 8))).toEqual({ residentId: gardener, moved: false, target: { houseId: big, result: 'ok', used: 0, capacity: 4 } });
    expect(sent).toEqual([]);
    expect(state).toEqual(before);
  });

  it('losgelassen ohne ein Bild dazwischen (Wischen in einem Zug): kein Umzug', () => {
    const { drag, sent, gardener } = setup();
    drag.grab(gardener, tileCenter(5, 10));
    drag.carry(tileCenter(13, 8));
    expect(drag.drop(tileCenter(13, 8))?.moved).toBe(false);
    expect(sent).toEqual([]);
  });

  it('ein anderes Haus unter dem Finger fängt die Zeit neu an', () => {
    const { drag, sent, big, other, gardener } = setup();
    drag.grab(gardener, tileCenter(5, 10));
    drag.carry(tileCenter(13, 8));
    drag.update(0);
    drag.update(DROP_DWELL_MS);
    expect(drag.carried?.ready).toBe(true);
    // Over the meadow it is not green any more, nor over the next house right away.
    drag.carry(tileCenter(18, 4));
    expect(drag.carried?.ready).toBe(false);
    drag.update(DROP_DWELL_MS + 100);
    drag.carry(tileCenter(25, 9));
    drag.update(DROP_DWELL_MS + 116);
    expect(drag.carried?.ready).toBe(false);
    // Released on the first house again without waiting there: nothing.
    drag.carry(tileCenter(13, 8));
    expect(drag.drop(tileCenter(13, 8))).toEqual({ residentId: gardener, moved: false, target: { houseId: big, result: 'ok', used: 0, capacity: 4 } });
    expect(sent).toEqual([]);
    drag.grab(gardener, tileCenter(5, 10));
    drag.carry(tileCenter(25, 9));
    drag.update(5000);
    drag.update(5000 + DROP_DWELL_MS);
    expect(drag.drop(tileCenter(25, 9))?.moved).toBe(true);
    expect(sent).toEqual([{ type: 'assignHome', residentId: gardener, houseId: other }]);
  });

  it('grün auf einem Haus, losgelassen auf einem anderen: kein Umzug', () => {
    const { drag, sent, gardener } = setup();
    drag.grab(gardener, tileCenter(5, 10));
    drag.carry(tileCenter(13, 8));
    drag.update(0);
    drag.update(DROP_DWELL_MS);
    expect(drag.carried?.ready).toBe(true);
    // The release lands on another house without a move event in between.
    expect(drag.drop(tileCenter(25, 9))?.moved).toBe(false);
    expect(sent).toEqual([]);
  });
});
