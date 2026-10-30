import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../src/sim/state';

describe('createInitialState', () => {
  it('beginnt bei Tick 0 und läuft', () => {
    expect(createInitialState()).toEqual({ tick: 0, paused: false });
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
