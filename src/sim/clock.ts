/**
 * Fixed-timestep clock for the simulation ("Fix Your Timestep").
 *
 * The display runs at a variable frame rate, the simulation always advances in
 * fixed ticks (default: 10 per second). Frame time is collected in an
 * accumulator; every full tick worth of time produces one simulation tick.
 * The remainder is reported as `alpha` in [0, 1) so the display can
 * interpolate between the previous and the current simulation state.
 *
 * Pure TypeScript: no Phaser, no DOM, no wall clock – the caller passes the
 * elapsed frame time in.
 */

/** Simulation ticks per second. */
export const TICKS_PER_SECOND = 10;

/** Duration of one tick in milliseconds. */
export const TICK_MS = 1000 / TICKS_PER_SECOND;

/**
 * Longest frame time that is simulated at once. Longer gaps (background tab,
 * debugger, slow device) are dropped instead of being caught up, so the game
 * never "fast-forwards" and never earns anything in the background.
 */
export const MAX_FRAME_MS = 250;

export interface ClockOptions {
  /** Ticks per second, default {@link TICKS_PER_SECOND}. */
  readonly ticksPerSecond?: number;
  /** Upper bound for one frame (≥ one tick), default {@link MAX_FRAME_MS} or one tick if that is longer. */
  readonly maxFrameMs?: number;
}

export interface ClockAdvance {
  /** Number of fixed ticks the simulation has to run for this frame. */
  readonly ticks: number;
  /** Progress towards the next tick in [0, 1), used for interpolation. */
  readonly alpha: number;
}

export class FixedStepClock {
  /** Duration of one tick in milliseconds. */
  readonly tickMs: number;
  /** Upper bound for the time of a single frame in milliseconds. */
  readonly maxFrameMs: number;

  private accumulatorMs = 0;
  private totalTicks = 0;

  constructor(options: ClockOptions = {}) {
    const ticksPerSecond = options.ticksPerSecond ?? TICKS_PER_SECOND;
    if (!isPositiveFinite(ticksPerSecond)) {
      throw new RangeError(`ticksPerSecond must be a positive number, got ${String(ticksPerSecond)}`);
    }
    this.tickMs = 1000 / ticksPerSecond;

    const maxFrameMs = options.maxFrameMs ?? Math.max(MAX_FRAME_MS, this.tickMs);
    if (!isPositiveFinite(maxFrameMs) || maxFrameMs < this.tickMs) {
      throw new RangeError(
        `maxFrameMs must be a number ≥ one tick (${String(this.tickMs)} ms), got ${String(maxFrameMs)}`,
      );
    }
    this.maxFrameMs = maxFrameMs;
  }

  /**
   * Adds the elapsed frame time and returns how many ticks to simulate.
   * Invalid input (negative, NaN, Infinity) counts as zero elapsed time.
   */
  advance(frameMs: number): ClockAdvance {
    if (isPositiveFinite(frameMs)) {
      this.accumulatorMs += Math.min(frameMs, this.maxFrameMs);
    }

    let ticks = 0;
    while (this.accumulatorMs >= this.tickMs) {
      this.accumulatorMs -= this.tickMs;
      ticks += 1;
    }
    this.totalTicks += ticks;

    return { ticks, alpha: this.alpha };
  }

  /** Progress towards the next tick in [0, 1). */
  get alpha(): number {
    return this.accumulatorMs / this.tickMs;
  }

  /** Number of ticks produced since creation or the last {@link reset}. */
  get ticks(): number {
    return this.totalTicks;
  }

  /** Drops the collected time and the tick counter. */
  reset(): void {
    this.accumulatorMs = 0;
    this.totalTicks = 0;
  }
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}
