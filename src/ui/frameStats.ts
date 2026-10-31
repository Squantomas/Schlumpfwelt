/**
 * How long the frames took (M6): a ring of the last frame times (ms) with
 * their mean, 95th percentile and maximum. The scene measures the main thread
 * from the start of a frame to the end of drawing it and publishes the numbers
 * for the smoke test (`<html data-perf>`). Pure and tested.
 */

export interface FrameSummary {
  /** Number of frames in the ring. */
  readonly frames: number;
  readonly mean: number;
  readonly p95: number;
  readonly max: number;
}

export class FrameStats {
  private readonly times: Float64Array;
  private next = 0;
  private size = 0;

  constructor(readonly capacity = 600) {
    this.times = new Float64Array(Math.max(1, Math.floor(capacity)));
  }

  /** Adds the time of one frame (ms); the oldest falls out when the ring is full. Negative or broken values count as 0. */
  add(ms: number): void {
    this.times[this.next] = Number.isFinite(ms) && ms > 0 ? ms : 0;
    this.next = (this.next + 1) % this.times.length;
    this.size = Math.min(this.size + 1, this.times.length);
  }

  get count(): number {
    return this.size;
  }

  /** Empties the ring (e.g. when a measurement starts). */
  reset(): void {
    this.next = 0;
    this.size = 0;
  }

  summary(): FrameSummary {
    if (this.size === 0) {
      return { frames: 0, mean: 0, p95: 0, max: 0 };
    }
    const sorted = Array.from(this.times.subarray(0, this.size)).sort((a, b) => a - b);
    const sum = sorted.reduce((total, value) => total + value, 0);
    // The nearest-rank percentile: the smallest value that at least 95 % of the frames do not exceed.
    const rank = Math.max(0, Math.ceil(0.95 * sorted.length) - 1);
    return { frames: sorted.length, mean: sum / sorted.length, p95: sorted[rank] ?? 0, max: sorted[sorted.length - 1] ?? 0 };
  }
}
