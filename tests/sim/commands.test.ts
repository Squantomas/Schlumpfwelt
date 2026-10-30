import { describe, expect, it } from 'vitest';
import { applyCommand, type Command } from '../../src/sim/commands';
import { createInitialState } from '../../src/sim/state';

describe('applyCommand', () => {
  it('setPaused hält die Simulation an und lässt sie weiterlaufen', () => {
    const state = createInitialState();
    applyCommand(state, { type: 'setPaused', paused: true });
    expect(state.paused).toBe(true);
    applyCommand(state, { type: 'setPaused', paused: false });
    expect(state.paused).toBe(false);
  });

  it('setPaused ist idempotent', () => {
    const state = createInitialState();
    applyCommand(state, { type: 'setPaused', paused: true });
    applyCommand(state, { type: 'setPaused', paused: true });
    expect(state.paused).toBe(true);
  });

  it('ändert nur, was der Befehl betrifft', () => {
    const state = { ...createInitialState(), tick: 7 };
    applyCommand(state, { type: 'setPaused', paused: true });
    expect(state).toEqual({ ...createInitialState(), tick: 7, paused: true });
  });

  it('meldet unbekannte Befehle als Fehler', () => {
    const unknown = { type: 'unknown' } as unknown as Command;
    expect(() => {
      applyCommand(createInitialState(), unknown);
    }).toThrow(/Unhandled command: unknown/);
  });
});
