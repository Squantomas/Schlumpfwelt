import { describe, expect, it } from 'vitest';
import { t } from '../../src/data/texts';
import { createInitialState } from '../../src/sim/state';
import { cardStatus, missingInputOf, productionInfo } from '../../src/ui/productionInfo';
import { buildConnected, fillTerrain, grassState, setStore, tickN } from '../sim/helpers';

describe('productionInfo: Bilder „braucht → macht“', () => {
  it('Holzfällerhütte braucht Bäume und macht Holz', () => {
    expect(productionInfo('lumberjack')).toEqual({ needs: [{ kind: 'nearby', id: 'tree' }], makes: [{ kind: 'item', id: 'wood', amount: 1 }] });
  });

  it('Steinbruch braucht Felsen', () => {
    expect(productionInfo('quarry')?.needs).toEqual([{ kind: 'nearby', id: 'rock' }]);
  });

  it('Beerengarten braucht nichts', () => {
    expect(productionInfo('berry-garden')).toEqual({ needs: [], makes: [{ kind: 'item', id: 'berries', amount: 1 }] });
  });

  it('Schreinerei und Bäckerei zeigen Zutaten mit Menge', () => {
    expect(productionInfo('carpenter')).toEqual({ needs: [{ kind: 'item', id: 'wood', amount: 2 }], makes: [{ kind: 'item', id: 'furniture', amount: 1 }] });
    expect(productionInfo('bakery')?.needs).toEqual([{ kind: 'item', id: 'berries', amount: 2 }]);
  });

  it('Marktplatz nimmt Möbel und Kuchen und macht Taler', () => {
    expect(productionInfo('market')).toEqual({
      needs: [{ kind: 'item', id: 'furniture' }, { kind: 'item', id: 'cake' }],
      makes: [{ kind: 'item', id: 'coins' }],
    });
  });

  it('kennt Häuser und Unbekanntes nicht', () => {
    expect(productionInfo('house-red')).toBeUndefined();
    expect(productionInfo('nope')).toBeUndefined();
  });
});

describe('cardStatus: ein kurzer Satz und der Fortschritt', () => {
  it('zeigt „fleißig“ mit wachsendem Fortschritt', () => {
    const state = createInitialState(1);
    const garden = state.buildings.find((b) => b.type === 'berry-garden');
    const id = garden?.id ?? -1;
    expect(cardStatus(state, id)).toMatchObject({ status: 'working', text: 'status.working', progress: 0 });
    tickN(state, 25);
    const status = cardStatus(state, id);
    expect(status?.progress).toBeGreaterThan(0.4);
    expect(status?.progress).toBeLessThan(0.6);
  });

  it('zeigt den leeren Markt als „nichts zu verkaufen“', () => {
    const state = createInitialState(1);
    const market = state.buildings.find((b) => b.type === 'market');
    expect(cardStatus(state, market?.id ?? -1)).toMatchObject({ status: 'idle', text: 'status.idle' });
  });

  it('sagt, worauf die Bäckerei wartet', () => {
    const state = grassState(24);
    setStore(state, { coins: 100, wood: 20 });
    const id = buildConnected(state, 'bakery', 4, 3);
    setStore(state, { berries: 1 });
    tickN(state, 1);
    const status = cardStatus(state, id);
    expect(status).toMatchObject({ status: 'waitingInput', text: 'status.waitingInput', params: { list: '1 Beere' } });
    expect(t('status.waitingInput', status?.params)).toBe('Wartet auf 1 Beere.');
    expect(missingInputOf(state, id)).toBe('berries');
    setStore(state, { berries: 2 });
    expect(missingInputOf(state, id)).toBeUndefined();
  });

  it('sagt, wenn der Weg oder die Bäume fehlen', () => {
    const state = grassState(24);
    fillTerrain(state, 12, 2, 3, 4, 'forest');
    setStore(state, { coins: 100, wood: 20 });
    const id = buildConnected(state, 'lumberjack', 9, 3);
    fillTerrain(state, 12, 2, 3, 4, 'grass');
    tickN(state, 1);
    expect(cardStatus(state, id)).toMatchObject({ status: 'noNearby', text: 'status.noForest' });
    state.paths = [];
    tickN(state, 1);
    expect(cardStatus(state, id)).toMatchObject({ status: 'noPath', text: 'status.noPath' });
  });

  it('gibt für Unbekanntes nichts zurück', () => {
    expect(cardStatus(createInitialState(1), 12345)).toBeUndefined();
    expect(missingInputOf(createInitialState(1), 12345)).toBeUndefined();
  });
});
