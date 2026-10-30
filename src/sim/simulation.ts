import { FixedStepClock } from './clock';
import { applyCommand, type Command } from './commands';
import { createInitialState, type SimState } from './state';

/**
 * Owns the simulation state and advances it in fixed ticks.
 *
 * Usage from a scene (once per frame, in exactly one place):
 *
 *   const alpha = simulation.update(deltaMs);
 *   // read simulation.state and draw it, interpolating with alpha
 *
 * Changes only via {@link Simulation.send}; commands are queued and applied at
 * the start of the next tick, in the order they were sent.
 */
export class Simulation {
  private readonly current: SimState;
  private readonly clock: FixedStepClock;
  private queue: Command[] = [];

  constructor(initialState: SimState = createInitialState(), clock: FixedStepClock = new FixedStepClock()) {
    this.current = initialState;
    this.clock = clock;
  }

  /** Read-only view of the current state. */
  get state(): Readonly<SimState> {
    return this.current;
  }

  /** Queues a command; it takes effect at the start of the next tick. */
  send(command: Command): void {
    this.queue.push(command);
  }

  /**
   * Advances the simulation by the elapsed frame time.
   * Returns the interpolation alpha in [0, 1); 0 while paused, because the
   * simulated time stands still then.
   */
  update(frameMs: number): number {
    const { ticks, alpha } = this.clock.advance(frameMs);
    for (let i = 0; i < ticks; i += 1) {
      this.step();
    }
    return this.current.paused ? 0 : alpha;
  }

  /** Runs exactly one tick: apply queued commands, then advance the world. */
  step(): void {
    const commands = this.queue;
    this.queue = [];
    for (const command of commands) {
      applyCommand(this.current, command);
    }

    if (this.current.paused) {
      return;
    }
    this.current.tick += 1;
  }
}
