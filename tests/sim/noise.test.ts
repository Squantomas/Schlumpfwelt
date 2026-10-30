import { describe, expect, it } from 'vitest';
import { fractalNoise, valueNoise } from '../../src/sim/noise';
import { hash2 } from '../../src/sim/random';

describe('valueNoise', () => {
  it('ist bei gleichen Eingaben gleich und hängt vom Seed ab', () => {
    expect(valueNoise(1, 3.3, 4.7)).toBe(valueNoise(1, 3.3, 4.7));
    expect(valueNoise(2, 3.3, 4.7)).not.toBe(valueNoise(1, 3.3, 4.7));
  });

  it('liefert Werte in [0, 1)', () => {
    for (let i = 0; i < 2000; i += 1) {
      const value = valueNoise(5, i * 0.37 - 100, i * 0.91 - 50);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('trifft an Gitterpunkten die Gitterwerte', () => {
    expect(valueNoise(9, 4, 7)).toBeCloseTo(hash2(9, 4, 7), 12);
  });

  it('ist stetig: kleine Schritte ergeben kleine Änderungen', () => {
    let previous = valueNoise(4, 0, 2.5);
    for (let x = 0.01; x < 20; x += 0.01) {
      const value = valueNoise(4, x, 2.5);
      expect(Math.abs(value - previous)).toBeLessThan(0.05);
      previous = value;
    }
  });
});

describe('fractalNoise', () => {
  it('liefert Werte in [0, 1) und ist reproduzierbar', () => {
    for (let i = 0; i < 1000; i += 1) {
      const value = fractalNoise(3, i * 0.13, i * 0.29, 3);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(value).toBe(fractalNoise(3, i * 0.13, i * 0.29, 3));
    }
  });

  it('mit einer Oktave gleich dem Value-Noise', () => {
    expect(fractalNoise(3, 1.5, 2.5, 1)).toBeCloseTo(valueNoise(3, 1.5, 2.5), 12);
  });

  it('ohne Oktaven 0', () => {
    expect(fractalNoise(3, 1.5, 2.5, 0)).toBe(0);
  });
});
