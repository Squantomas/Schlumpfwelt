import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../src/sim/state';
import { signFor, signsFor } from '../../src/ui/signs';
import { buildConnected, fillTerrain, grassState, run, setStore, tickN } from '../sim/helpers';

describe('Schilder: genau eines pro Gebäude, nach Priorität', () => {
  it('zeigt im Startdorf kein Schild (Garten arbeitet, Markt im Leerlauf ist kein Fehler)', () => {
    expect(signsFor(createInitialState(1)).size).toBe(0);
  });

  it('zeigt „kein Weg“ vor allem anderen: ein Holzfäller ohne Weg und ohne Bäume hat nur das Wegschild', () => {
    const state = grassState(24);
    fillTerrain(state, 12, 2, 3, 4, 'forest');
    setStore(state, { coins: 100, wood: 20 });
    run(state, { type: 'placeBuilding', buildingType: 'lumberjack', x: 9, y: 3 });
    fillTerrain(state, 12, 2, 3, 4, 'grass');
    tickN(state, 1);
    expect(signFor(state, 1)).toBe('path');
    expect(signsFor(state).get(1)).toBe('path');
    expect(signsFor(state).size).toBe(1);
  });

  it('zeigt „keine Bäume“ bzw. „keine Felsen“ vor „fehlendes Material“', () => {
    const state = grassState(24);
    fillTerrain(state, 12, 2, 3, 4, 'forest');
    setStore(state, { coins: 100, wood: 20 });
    const id = buildConnected(state, 'lumberjack', 9, 3);
    fillTerrain(state, 12, 2, 3, 4, 'grass');
    tickN(state, 1);
    expect(signFor(state, id)).toBe('tree');
  });

  it('zeigt bei fehlendem Material das Bild der Ware, und das Schild verschwindet, wenn sie da ist', () => {
    const state = grassState(24);
    setStore(state, { coins: 100, wood: 20 });
    const id = buildConnected(state, 'bakery', 4, 3);
    setStore(state);
    tickN(state, 1);
    expect(signFor(state, id)).toBe('good-berries');
    state.inventory['berries'] = 5;
    tickN(state, 1);
    expect(signFor(state, id)).toBeUndefined();
  });

  it('zeigt bei Häusern ohne Weg das Wegschild und sonst nichts', () => {
    const state = grassState(24);
    setStore(state, { coins: 100, wood: 20 });
    run(state, { type: 'placeBuilding', buildingType: 'house-red', x: 3, y: 3 }, { type: 'placeBuilding', buildingType: 'flower', x: 8, y: 8 });
    expect(signsFor(state)).toEqual(new Map([[1, 'path']]));
  });

  it('kennt Unbekanntes nicht', () => {
    expect(signFor(createInitialState(1), 999)).toBeUndefined();
  });
});
