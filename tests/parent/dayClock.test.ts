import { describe, expect, it } from 'vitest';
import { DayClock, laterDay, localDayKey, type DayClockOptions, type DayEvent, type DayInput } from '../../src/parent/dayClock';

const OPTIONS: DayClockOptions = { warnMs: 5 * 60_000, duskMinMs: 6000, duskMaxMs: 18_000, dawnMs: 3000, maxFrameMs: 250 };
const DAY = '2026-11-01';
const NEXT = '2026-11-02';

/** Plays `ms` in frames of `frameMs`, returns every event. */
function play(clock: DayClock, ms: number, input: Partial<DayInput> = {}, frameMs = 100): DayEvent[] {
  const events: DayEvent[] = [];
  for (let t = 0; t < ms; t += frameMs) {
    events.push(...clock.update({ frameMs, dayKey: DAY, counting: true, allAsleep: false, ...input }));
  }
  return events;
}

describe('Tageskonto: nur sichtbare Spielzeit zählt (M8)', () => {
  it('ohne Limit zählt die Zeit, aber es wird nie Abend', () => {
    const clock = new DayClock({ day: DAY, usedMs: 0, extraMinutes: 0 }, 0, OPTIONS);
    expect(play(clock, 3 * 60 * 60_000, {}, 250)).toEqual([]);
    expect(clock.phase).toBe('day');
    expect(clock.allowedMs).toBeUndefined();
    expect(clock.account.usedMs).toBe(3 * 60 * 60_000);
  });

  it('ein Bild zählt höchstens 250 ms: ein schlafendes Tablet springt nicht', () => {
    const clock = new DayClock({ day: DAY, usedMs: 0, extraMinutes: 0 }, 15, OPTIONS);
    clock.update({ frameMs: 6 * 60 * 60_000, dayKey: DAY, counting: true, allAsleep: false });
    expect(clock.account.usedMs).toBe(250);
    for (const bad of [-100, Number.NaN, Infinity]) {
      clock.update({ frameMs: bad, dayKey: DAY, counting: true, allAsleep: false });
    }
    expect(clock.account.usedMs).toBe(250);
  });

  it('im Hintergrund, auf dem Startbildschirm und im Eltern-Menü zählt nichts', () => {
    const clock = new DayClock({ day: DAY, usedMs: 0, extraMinutes: 0 }, 15, OPTIONS);
    play(clock, 60_000, { counting: false });
    expect(clock.account.usedMs).toBe(0);
    play(clock, 1000);
    expect(clock.account.usedMs).toBe(1000);
  });

  it('kurz vor Ablauf einmal der sanfte Hinweis, bei Ablauf der Abend', () => {
    const clock = new DayClock({ day: DAY, usedMs: 0, extraMinutes: 0 }, 15, OPTIONS);
    const early = play(clock, 10 * 60_000 - 1000, {}, 250);
    expect(early).toEqual([]);
    expect(play(clock, 2000)).toEqual(['warn']);
    expect(clock.warned).toBe(true);
    const later = play(clock, 5 * 60_000 - 1000 - 100, {}, 100);
    expect(later).toEqual([]);
    expect(clock.phase).toBe('day');
    expect(play(clock, 200)).toEqual(['dusk']);
    expect(clock.phase).toBe('dusk');
    expect(clock.remainingMs).toBe(0);
  });

  it('der Abend dauert mindestens 6 s, endet, wenn alle schlafen – spätestens nach 18 s', () => {
    const early = new DayClock({ day: DAY, usedMs: 15 * 60_000 - 100, extraMinutes: 0 }, 15, OPTIONS);
    expect(play(early, 100)).toEqual(['dusk']);
    expect(play(early, 5900, { allAsleep: true })).toEqual([]);
    expect(play(early, 100, { allAsleep: true })).toEqual(['night']);
    expect(early.phase).toBe('night');
    expect(early.progress).toBe(1);

    const late = new DayClock({ day: DAY, usedMs: 15 * 60_000 - 100, extraMinutes: 0 }, 15, OPTIONS);
    play(late, 100);
    expect(play(late, 17_900)).toEqual([]);
    expect(late.progress).toBeCloseTo(17_900 / 18_000, 3);
    expect(play(late, 100)).toEqual(['night']);
  });

  it('in der Nacht zählt nichts, und nichts geschieht', () => {
    const clock = new DayClock({ day: DAY, usedMs: 15 * 60_000, extraMinutes: 0 }, 15, OPTIONS);
    expect(clock.phase).toBe('night');
    expect(play(clock, 60 * 60_000, {}, 250)).toEqual([]);
    expect(clock.account.usedMs).toBe(15 * 60_000);
  });

  it('Neuladen: die verbrauchte Zeit von heute zählt weiter, die Nacht kommt sofort wieder', () => {
    const before = new DayClock({ day: DAY, usedMs: 14 * 60_000, extraMinutes: 0 }, 15, OPTIONS);
    play(before, 30_000);
    const reloaded = new DayClock(before.account, 15, OPTIONS);
    expect(reloaded.account.usedMs).toBe(14 * 60_000 + 30_000);
    expect(reloaded.phase).toBe('day');
    // Under five minutes left already: no second sentence after a reload.
    expect(reloaded.warned).toBe(true);
    expect(new DayClock({ day: DAY, usedMs: 15 * 60_000, extraMinutes: 0 }, 15, OPTIONS).phase).toBe('night');
  });

  it('„10 Minuten mehr“ oder ein höheres Limit in der Nacht: es wird wieder hell', () => {
    const clock = new DayClock({ day: DAY, usedMs: 15 * 60_000, extraMinutes: 0 }, 15, OPTIONS);
    clock.addExtra(10);
    expect(clock.phase).toBe('dawn');
    expect(clock.remainingMs).toBe(10 * 60_000);
    expect(clock.warned).toBe(false);
    expect(play(clock, 100)).toEqual(['wake']);
    play(clock, 3000);
    expect(clock.phase).toBe('day');
    // Then it counts again, the sentence comes again before the end.
    expect(play(clock, 5 * 60_000 + 100, {}, 250)).toContain('warn');

    const off = new DayClock({ day: DAY, usedMs: 15 * 60_000, extraMinutes: 0 }, 15, OPTIONS);
    off.setLimit(0);
    expect(off.phase).toBe('dawn');
    const higher = new DayClock({ day: DAY, usedMs: 15 * 60_000, extraMinutes: 0 }, 15, OPTIONS);
    higher.setLimit(30);
    expect(higher.phase).toBe('dawn');
    const still = new DayClock({ day: DAY, usedMs: 20 * 60_000, extraMinutes: 0 }, 15, OPTIONS);
    still.setLimit(15);
    expect(still.phase).toBe('night');
  });

  it('ein neuer Kalendertag beginnt ein neues Konto und beendet die Nacht – auch um Mitternacht im laufenden Spiel', () => {
    const clock = new DayClock({ day: DAY, usedMs: 15 * 60_000 - 100, extraMinutes: 0 }, 15, OPTIONS);
    play(clock, 100);
    expect(clock.phase).toBe('dusk');
    expect(play(clock, 100, { dayKey: NEXT })).toEqual(['newDay', 'wake']);
    expect(clock.phase).toBe('dawn');
    expect(clock.account).toEqual({ day: NEXT, usedMs: 100, extraMinutes: 0 });
    // While playing, at midnight: the account starts again, nothing else happens.
    const playing = new DayClock({ day: DAY, usedMs: 10 * 60_000, extraMinutes: 0 }, 30, OPTIONS);
    expect(play(playing, 100, { dayKey: NEXT })).toEqual(['newDay']);
    expect(playing.phase).toBe('day');
    expect(playing.remainingMs).toBe(30 * 60_000 - 100);
  });

  it('ein Datum zurück beginnt kein neues Konto: die Zeit von heute gilt weiter (Korrekturrunde 1)', () => {
    const clock = new DayClock({ day: NEXT, usedMs: 15 * 60_000 - 100, extraMinutes: 0 }, 15, OPTIONS);
    expect(play(clock, 100, { dayKey: DAY })).toEqual(['dusk']);
    expect(clock.account.day).toBe(NEXT);
    expect(clock.expired).toBe(true);
    // Back to the later day, and then the day after it: only that starts a fresh account.
    expect(play(clock, 100, { dayKey: NEXT })).toEqual([]);
    expect(laterDay('2026-11-03', NEXT)).toBe(true);
    expect(laterDay(DAY, NEXT)).toBe(false);
    expect(laterDay(NEXT, NEXT)).toBe(false);
    expect(laterDay('2027-01-01', '2026-12-31')).toBe(true);
  });

  it('das lokale Datum als Schlüssel', () => {
    expect(localDayKey(new Date(2026, 10, 1, 23, 59, 59))).toBe('2026-11-01');
    expect(localDayKey(new Date(2026, 10, 2, 0, 0, 1))).toBe('2026-11-02');
    expect(localDayKey(new Date(2027, 0, 9))).toBe('2027-01-09');
  });
});
