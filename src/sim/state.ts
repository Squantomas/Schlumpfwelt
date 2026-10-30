/**
 * Complete simulation state. Plain data only (no classes, no functions), so it
 * can later be saved and loaded as JSON.
 *
 * Only the simulation itself mutates the state. Scenes and UI get a read-only
 * view via `Simulation.state` and change things exclusively by sending
 * commands (see `commands.ts`).
 */
export interface SimState {
  /** Number of simulated ticks since the start (does not advance while paused). */
  tick: number;
  /** While paused, time stands still: commands are applied, nothing else happens. */
  paused: boolean;
}

export function createInitialState(): SimState {
  return {
    tick: 0,
    paused: false,
  };
}
