import { FixedStepClock } from './clock';
import { applyCommand, type Command } from './commands';
import type { DeepReadonly } from './readonly';
import { refreshStatuses, tickProduction } from './production';
import { createInitialState, type SimState } from './state';
import { checkUnlocks } from './unlocks';

/**
 * Owns the simulation state and advances it in fixed ticks.
 *
 * Usage from a scene (once per frame, in exactly one place):
 *
 *   const alpha = simulation.update(deltaMs);
 *   const simTimeMs = (simulation.state.tick + alpha) * simulation.tickMs;
 *   // read simulation.state and draw it
 *
 * Changes only via {@link Simulation.send}; commands are queued and applied at
 * the start of the next tick, in the order they were sent.
 */
export class Simulation {
  private readonly current: SimState;
  private readonly clock: FixedStepClock;
  private queue: Command[] = [];

  /** `initialState` is copied, so nobody outside keeps a writable reference. */
  constructor(initialState: SimState = createInitialState(), clock: FixedStepClock = new FixedStepClock()) {
    this.current = structuredClone(initialState);
    this.clock = clock;
  }

  /** Read-only view of the current state (at every depth). */
  get state(): DeepReadonly<SimState> {
    return this.current;
  }

  /** Duration of one tick in milliseconds. */
  get tickMs(): number {
    return this.clock.tickMs;
  }

  /**
   * Replaces the whole state (a village that was loaded from a file). The state is copied; commands that were
   * queued for the old village are dropped and the clock starts over, so nothing is caught up.
   */
  load(state: SimState): void {
    Object.assign(this.current, structuredClone(state));
    this.queue = [];
    this.clock.reset();
  }

  /**
   * Applies the commands that wait for the next tick right now (without letting time pass). For the moment a page is
   * left: a building that was ordered a moment ago, and whose frame never came, is part of what is saved then.
   */
  applyPending(): void {
    const commands = this.queue;
    this.queue = [];
    for (const command of commands) {
      applyCommand(this.current, command);
    }
    if (commands.length > 0) {
      refreshStatuses(this.current);
      checkUnlocks(this.current);
    }
  }

  /** Queues a command; it takes effect at the start of the next tick. */
  send(command: Command): void {
    this.queue.push(command);
  }

  /**
   * Advances the simulation by the elapsed frame time and runs the ticks that
   * are due.
   *
   * Returns `alpha` in [0, 1): the time elapsed since the last tick as a
   * fraction of one tick. `(state.tick + alpha) * tickMs` is a smoothly
   * running simulation time for the display. The simulation keeps only the
   * current state – a display that wants to blend between two ticks has to
   * remember the previous state itself. While paused, alpha is 0, so the
   * simulation time stands still.
   */
  update(frameMs: number): number {
    const { ticks, alpha } = this.clock.advance(frameMs);
    for (let i = 0; i < ticks; i += 1) {
      this.step();
    }
    return this.current.paused ? 0 : alpha;
  }

  /** Runs exactly one tick: apply queued commands, then advance the world. */
  private step(): void {
    const commands = this.queue;
    this.queue = [];
    for (const command of commands) {
      applyCommand(this.current, command);
    }

    if (this.current.paused) {
      // Time stands still, but a building placed meanwhile shows its real state (no path, no trees …) at once.
      refreshStatuses(this.current);
      checkUnlocks(this.current);
      return;
    }
    this.current.tick += 1;
    tickProduction(this.current);
    checkUnlocks(this.current);
  }
}
