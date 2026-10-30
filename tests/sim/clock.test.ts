import { describe, expect, it } from 'vitest';
import { FixedStepClock, MAX_FRAME_MS, TICK_MS, TICKS_PER_SECOND } from '../../src/sim/clock';

describe('FixedStepClock', () => {
  it('läuft standardmäßig mit 10 Ticks pro Sekunde', () => {
    expect(TICKS_PER_SECOND).toBe(10);
    expect(TICK_MS).toBe(100);
    const clock = new FixedStepClock();
    expect(clock.tickMs).toBe(100);
    expect(clock.maxFrameMs).toBe(MAX_FRAME_MS);
  });

  it('sammelt Zeit, bis ein ganzer Tick erreicht ist', () => {
    const clock = new FixedStepClock();
    expect(clock.advance(40)).toEqual({ ticks: 0, alpha: 0.4 });
    expect(clock.advance(40)).toEqual({ ticks: 0, alpha: 0.8 });
    const step = clock.advance(40);
    expect(step.ticks).toBe(1);
    expect(step.alpha).toBeCloseTo(0.2);
    expect(clock.ticks).toBe(1);
  });

  it('liefert genau einen Tick und alpha 0 bei exakt einer Tick-Dauer', () => {
    const clock = new FixedStepClock();
    expect(clock.advance(100)).toEqual({ ticks: 1, alpha: 0 });
  });

  it('liefert mehrere Ticks für einen langen Frame', () => {
    const clock = new FixedStepClock();
    expect(clock.advance(225)).toEqual({ ticks: 2, alpha: 0.25 });
  });

  it('verliert bei variabler Framerate keine Zeit', () => {
    const clock = new FixedStepClock();
    const frames = [16.7, 33.4, 8.1, 16.6, 50, 16.7, 16.7, 99.9, 12.3, 70];
    let ticks = 0;
    let elapsed = 0;
    for (let round = 0; round < 20; round += 1) {
      for (const frame of frames) {
        ticks += clock.advance(frame).ticks;
        elapsed += frame;
      }
    }
    expect(ticks).toBe(clock.ticks);
    expect(ticks * clock.tickMs + clock.alpha * clock.tickMs).toBeCloseTo(elapsed, 6);
  });

  it('ergibt bei 60 Bildern pro Sekunde 10 Ticks pro Sekunde', () => {
    const clock = new FixedStepClock();
    let ticks = 0;
    for (let frame = 0; frame < 60 * 10; frame += 1) {
      ticks += clock.advance(1000 / 60).ticks;
    }
    // 10 Sekunden: 100 Ticks, höchstens einer hängt wegen Rundung noch im Akkumulator.
    expect(ticks).toBeGreaterThanOrEqual(99);
    expect(ticks).toBeLessThanOrEqual(100);
  });

  it('hält alpha immer im Bereich [0, 1)', () => {
    const clock = new FixedStepClock();
    for (let i = 0; i < 1000; i += 1) {
      const { alpha } = clock.advance((i * 7.3) % 41);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('begrenzt sehr lange Frames, damit nichts nachgeholt wird', () => {
    const clock = new FixedStepClock();
    // 5 Sekunden im Hintergrund zählen nur wie 250 ms.
    expect(clock.advance(5000)).toEqual({ ticks: 2, alpha: 0.5 });
  });

  it('ignoriert ungültige Frame-Zeiten', () => {
    const clock = new FixedStepClock();
    clock.advance(50);
    for (const invalid of [0, -16, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(clock.advance(invalid)).toEqual({ ticks: 0, alpha: 0.5 });
    }
  });

  it('kann eine andere Tick-Rate und Frame-Grenze verwenden', () => {
    const clock = new FixedStepClock({ ticksPerSecond: 20, maxFrameMs: 1000 });
    expect(clock.tickMs).toBe(50);
    expect(clock.advance(1000)).toEqual({ ticks: 20, alpha: 0 });
  });

  it('erlaubt bei langsamer Tick-Rate standardmäßig mindestens einen Tick pro Frame', () => {
    const clock = new FixedStepClock({ ticksPerSecond: 1 });
    expect(clock.maxFrameMs).toBe(1000);
    expect(clock.advance(5000)).toEqual({ ticks: 1, alpha: 0 });
  });

  it('lehnt ungültige Optionen ab', () => {
    expect(() => new FixedStepClock({ ticksPerSecond: 0 })).toThrow(RangeError);
    expect(() => new FixedStepClock({ ticksPerSecond: -10 })).toThrow(RangeError);
    expect(() => new FixedStepClock({ ticksPerSecond: Number.NaN })).toThrow(RangeError);
    expect(() => new FixedStepClock({ maxFrameMs: 0 })).toThrow(RangeError);
    // Die Frame-Grenze muss mindestens einen Tick erlauben.
    expect(() => new FixedStepClock({ maxFrameMs: 99 })).toThrow(RangeError);
  });

  it('setzt Akkumulator und Tick-Zähler zurück', () => {
    const clock = new FixedStepClock();
    clock.advance(150);
    clock.reset();
    expect(clock.ticks).toBe(0);
    expect(clock.alpha).toBe(0);
    expect(clock.advance(50)).toEqual({ ticks: 0, alpha: 0.5 });
  });
});
