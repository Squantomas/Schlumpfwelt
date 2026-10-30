import { describe, expect, it } from 'vitest';
import { Rng, hash2, normalizeSeed } from '../../src/sim/random';

function take(rng: Rng, count: number): number[] {
  return Array.from({ length: count }, () => rng.next());
}

describe('Rng', () => {
  it('liefert bei gleichem Seed dieselbe Folge', () => {
    expect(take(new Rng(42), 20)).toEqual(take(new Rng(42), 20));
  });

  it('liefert bei anderem Seed eine andere Folge', () => {
    expect(take(new Rng(1), 20)).not.toEqual(take(new Rng(2), 20));
  });

  it('liefert feste Referenzwerte (Folge ändert sich nie unbemerkt)', () => {
    const rng = new Rng(1);
    expect(rng.next()).toBeCloseTo(0.6270739405881613, 12);
    expect(rng.next()).toBeCloseTo(0.002735721180215478, 12);
  });

  it('liefert Zahlen in [0, 1)', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 5000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('verteilt die Werte ungefähr gleichmäßig', () => {
    const rng = new Rng(99);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 10000; i += 1) {
      const bucket = Math.floor(rng.next() * 10);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(800);
      expect(count).toBeLessThan(1200);
    }
  });

  it('kann mit dem Zustand an derselben Stelle weitermachen', () => {
    const rng = new Rng(5);
    take(rng, 10);
    const resumed = new Rng(rng.state);
    expect(take(resumed, 5)).toEqual(take(rng, 5));
  });

  it('int liefert ganze Zahlen im Bereich', () => {
    const rng = new Rng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i += 1) {
      const value = rng.int(6);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
      seen.add(value);
    }
    expect(seen.size).toBe(6);
  });

  it('range liefert Werte im Bereich', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 500; i += 1) {
      const value = rng.range(-2, 5);
      expect(value).toBeGreaterThanOrEqual(-2);
      expect(value).toBeLessThan(5);
    }
  });

  it('chance(0) trifft nie, chance(1) immer', () => {
    const rng = new Rng(8);
    for (let i = 0; i < 200; i += 1) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });
});

describe('normalizeSeed', () => {
  it('lässt gültige Seeds unverändert', () => {
    expect(normalizeSeed(0)).toBe(0);
    expect(normalizeSeed(123456)).toBe(123456);
    expect(normalizeSeed(4294967295)).toBe(4294967295);
  });

  it('schneidet Kommastellen ab und faltet in den 32-Bit-Bereich', () => {
    expect(normalizeSeed(7.9)).toBe(7);
    expect(normalizeSeed(4294967296)).toBe(0);
    expect(normalizeSeed(-1)).toBe(4294967295);
  });

  it('macht aus NaN und Unendlich eine 0', () => {
    expect(normalizeSeed(Number.NaN)).toBe(0);
    expect(normalizeSeed(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('hash2', () => {
  it('ist bei gleichen Eingaben gleich', () => {
    expect(hash2(1, 5, 9)).toBe(hash2(1, 5, 9));
  });

  it('hängt von Seed, x und y ab', () => {
    const base = hash2(1, 5, 9);
    expect(hash2(2, 5, 9)).not.toBe(base);
    expect(hash2(1, 6, 9)).not.toBe(base);
    expect(hash2(1, 5, 10)).not.toBe(base);
    expect(hash2(1, 9, 5)).not.toBe(base);
  });

  it('liefert Zahlen in [0, 1), auch bei negativen Koordinaten', () => {
    for (let x = -20; x < 20; x += 1) {
      for (let y = -20; y < 20; y += 1) {
        const value = hash2(77, x, y);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    }
  });

  it('streut gleichmäßig', () => {
    let sum = 0;
    for (let x = 0; x < 100; x += 1) {
      for (let y = 0; y < 100; y += 1) {
        sum += hash2(3, x, y);
      }
    }
    expect(sum / 10000).toBeGreaterThan(0.48);
    expect(sum / 10000).toBeLessThan(0.52);
  });
});
