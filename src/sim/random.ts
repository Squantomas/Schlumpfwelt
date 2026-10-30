/**
 * Deterministic random numbers for the simulation.
 *
 * `Math.random` is forbidden in `src/sim/` (lint); everything random comes
 * from a seed. The same seed always gives the same sequence, on every device.
 */

/** Seeds are 32-bit unsigned integers; anything else is folded into that range. */
export function normalizeSeed(seed: number): number {
  return Number.isFinite(seed) ? Math.trunc(seed) >>> 0 : 0;
}

/**
 * Seeded generator (mulberry32). The whole state is one 32-bit number
 * ({@link Rng.state}), so it can be saved and restored as plain data.
 */
export class Rng {
  private current: number;

  constructor(seed: number) {
    this.current = normalizeSeed(seed);
  }

  /** The generator's whole state; `new Rng(rng.state)` continues the same sequence. */
  get state(): number {
    return this.current;
  }

  /** Next float in [0, 1). */
  next(): number {
    this.current = (this.current + 0x6d2b79f5) >>> 0;
    let t = this.current;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** True with the given probability (0 to 1). */
  chance(probability: number): boolean {
    return this.next() < probability;
  }
}

/**
 * Stateless hash of a seed and two integers (for example a tile position) to a
 * float in [0, 1). Lets the display vary things per tile (flower here, tint
 * there) without storing anything: the same seed and tile always give the same
 * value, no matter in which order tiles are asked for.
 */
export function hash2(seed: number, x: number, y: number): number {
  let h = normalizeSeed(seed) ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
