import { describe, expect, it } from 'vitest';
import { generateIsland } from '../../src/sim/islandGen';
import { DEFAULT_SEED, createInitialState } from '../../src/sim/state';

describe('createInitialState', () => {
  it('beginnt bei Tick 0 und läuft', () => {
    const state = createInitialState();
    expect(state.tick).toBe(0);
    expect(state.paused).toBe(false);
  });

  it('merkt sich den Seed und erzeugt die Insel daraus', () => {
    const state = createInitialState(1234);
    expect(state.seed).toBe(1234);
    expect(state.world).toEqual(generateIsland(1234));
  });

  it('nimmt ohne Angabe den Standard-Seed', () => {
    expect(createInitialState().seed).toBe(DEFAULT_SEED);
  });

  it('faltet ungültige Seeds in den 32-Bit-Bereich', () => {
    expect(createInitialState(-1).seed).toBe(4294967295);
    expect(createInitialState(Number.NaN).seed).toBe(0);
  });

  it('liefert jedes Mal ein neues Objekt', () => {
    const first = createInitialState();
    const second = createInitialState();
    expect(first).not.toBe(second);
    first.tick = 99;
    expect(second.tick).toBe(0);
  });

  it('besteht nur aus JSON-tauglichen Daten', () => {
    const state = createInitialState();
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
