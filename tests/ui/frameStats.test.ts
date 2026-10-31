import { describe, expect, it } from 'vitest';
import { FrameStats } from '../../src/ui/frameStats';

describe('FrameStats', () => {
  it('ist leer am Anfang', () => {
    expect(new FrameStats().summary()).toEqual({ frames: 0, mean: 0, p95: 0, max: 0 });
  });

  it('rechnet Mittelwert, 95-%-Wert (nächster Rang) und Maximum', () => {
    const stats = new FrameStats(100);
    for (let i = 1; i <= 100; i += 1) {
      stats.add(i);
    }
    expect(stats.summary()).toEqual({ frames: 100, mean: 50.5, p95: 95, max: 100 });
    const few = new FrameStats();
    few.add(10);
    few.add(30);
    expect(few.summary()).toEqual({ frames: 2, mean: 20, p95: 30, max: 30 });
  });

  it('behält nur die letzten Bilder', () => {
    const stats = new FrameStats(3);
    for (const ms of [100, 100, 1, 2, 3]) {
      stats.add(ms);
    }
    expect(stats.count).toBe(3);
    expect(stats.summary()).toEqual({ frames: 3, mean: 2, p95: 3, max: 3 });
  });

  it('zählt kaputte Werte als 0 und fängt nach reset neu an', () => {
    const stats = new FrameStats(4);
    stats.add(Number.NaN);
    stats.add(-5);
    stats.add(8);
    expect(stats.summary().mean).toBeCloseTo(8 / 3);
    stats.reset();
    expect(stats.count).toBe(0);
    stats.add(4);
    expect(stats.summary()).toEqual({ frames: 1, mean: 4, p95: 4, max: 4 });
  });
});
