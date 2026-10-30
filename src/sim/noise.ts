import { hash2 } from './random';

/** Smooth interpolation weight: 0 at 0, 1 at 1, flat at both ends. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Value noise: random values on an integer grid, smoothly interpolated.
 * Returns a float in [0, 1). Continuous in x and y; one grid cell is one unit,
 * so divide coordinates by the wanted feature size first.
 */
export function valueNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);

  const top = hash2(seed, x0, y0) * (1 - fx) + hash2(seed, x0 + 1, y0) * fx;
  const bottom = hash2(seed, x0, y0 + 1) * (1 - fx) + hash2(seed, x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Fractal noise: `octaves` layers of value noise, each at twice the frequency
 * and half the weight. Returns a float in [0, 1).
 */
export function fractalNoise(seed: number, x: number, y: number, octaves: number): number {
  let sum = 0;
  let weight = 1;
  let total = 0;
  let frequency = 1;
  for (let i = 0; i < octaves; i += 1) {
    // Each octave gets its own grid so the layers do not line up.
    sum += weight * valueNoise(seed + i * 7919, x * frequency, y * frequency);
    total += weight;
    weight *= 0.5;
    frequency *= 2;
  }
  return total === 0 ? 0 : sum / total;
}
