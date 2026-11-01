import { PARENT_RULES } from '../data/parent';
import { MAX_FRAME_MS } from '../sim/clock';

/**
 * The daily limit (M8) as pure arithmetic: the account of one calendar day and the course of the evening. It has no
 * clock of its own – the scene passes in the raw time of every frame and the local date – so it can be tested with
 * made-up days and times.
 *
 * Counting:
 * - Only **visible, running play** counts: the caller says whether this frame counts (the island is on screen, the page
 *   is visible, no parents' panel and no "other window" layer is open). The start screen and the night never count.
 * - A frame counts at most {@link MAX_FRAME_MS} (like the simulation): a tablet that slept, a tab in the background or a
 *   debugger stop never adds a jump. Nothing is counted from wall-clock differences.
 * - Every **calendar day** (local date, `localDayKey`) has its own account; when the date changes – also at midnight
 *   in the running game – the account starts again at zero, and a night ends.
 *
 * The phases:
 * - `day`: playing. About `warnMinutes` before the time is up there is one gentle `warn`.
 * - `dusk`: the time is up – the evening begins, everybody walks home. It lasts at least `dusk.minSeconds` and ends
 *   when everybody is asleep, at the latest after `dusk.maxSeconds`.
 * - `night`: the game stands still until the next day or until the parents give more time.
 * - `dawn`: it gets light again (`dawnSeconds`), then `day`. Play counts as in the day.
 */
export type DayPhase = 'day' | 'dusk' | 'night' | 'dawn';

/** What happened in a frame: the gentle sentence, the evening begins, the night begins, it gets light again, a new calendar day. */
export type DayEvent = 'warn' | 'dusk' | 'night' | 'wake' | 'newDay';

export interface DayAccount {
  readonly day: string;
  readonly usedMs: number;
  readonly extraMinutes: number;
}

export interface DayInput {
  /** The raw time of this frame (ms); capped like the simulation's. */
  readonly frameMs: number;
  /** The local date now (`localDayKey`). */
  readonly dayKey: string;
  /** Does this frame count as play (island visible, page visible, nothing of the parents open)? */
  readonly counting: boolean;
  /** Is everybody in bed? (Ends the evening early.) */
  readonly allAsleep: boolean;
}

export interface DayClockOptions {
  readonly warnMs: number;
  readonly duskMinMs: number;
  readonly duskMaxMs: number;
  readonly dawnMs: number;
  readonly maxFrameMs: number;
}

export const DAY_CLOCK_OPTIONS: DayClockOptions = {
  warnMs: PARENT_RULES.warnMinutes * 60_000,
  duskMinMs: PARENT_RULES.dusk.minSeconds * 1000,
  duskMaxMs: PARENT_RULES.dusk.maxSeconds * 1000,
  dawnMs: PARENT_RULES.dawnSeconds * 1000,
  maxFrameMs: MAX_FRAME_MS,
};

/** The local calendar date of a moment, `YYYY-MM-DD`. */
export function localDayKey(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export class DayClock {
  private accountNow: { day: string; usedMs: number; extraMinutes: number };
  private limit: number;
  private current: DayPhase = 'day';
  private phaseMs = 0;
  private warnedNow = false;
  private pending: DayEvent[] = [];

  constructor(
    account: DayAccount,
    limitMinutes: number,
    private readonly options: DayClockOptions = DAY_CLOCK_OPTIONS,
  ) {
    this.accountNow = { ...account };
    this.limit = limitMinutes;
    // The game starts in the night if today's time was already used up (a reload never gives it back).
    if (this.expired) {
      this.current = 'night';
    }
    this.warnedNow = this.remainingMs !== undefined && this.remainingMs <= options.warnMs;
  }

  get phase(): DayPhase {
    return this.current;
  }

  get account(): DayAccount {
    return { ...this.accountNow };
  }

  get limitMinutes(): number {
    return this.limit;
  }

  /** The time allowed today (ms), `undefined` without a limit. */
  get allowedMs(): number | undefined {
    return this.limit > 0 ? (this.limit + this.accountNow.extraMinutes) * 60_000 : undefined;
  }

  get remainingMs(): number | undefined {
    const allowed = this.allowedMs;
    return allowed === undefined ? undefined : Math.max(0, allowed - this.accountNow.usedMs);
  }

  get expired(): boolean {
    return this.remainingMs === 0;
  }

  /** Has the gentle sentence been said for the time left now? */
  get warned(): boolean {
    return this.warnedNow;
  }

  /** How far the evening (0 … 1 of its longest time) or the morning (0 … 1) has come; 1 in the night, 0 in the day. */
  get progress(): number {
    switch (this.current) {
      case 'day':
        return 0;
      case 'night':
        return 1;
      case 'dusk':
        return Math.min(1, this.phaseMs / this.options.duskMaxMs);
      case 'dawn':
        return Math.min(1, this.phaseMs / this.options.dawnMs);
    }
  }

  /** How long the current evening (or morning) has been going on (ms). */
  get phaseTime(): number {
    return this.phaseMs;
  }

  /** The parents change the limit (0 = none). More time in the evening or the night: it gets light again. */
  setLimit(minutes: number): void {
    this.limit = Math.max(0, Math.floor(minutes));
    this.afterAllowanceChange();
  }

  /** "Heute noch 10 Minuten mehr". */
  addExtra(minutes: number): void {
    this.accountNow.extraMinutes += Math.max(0, Math.floor(minutes));
    this.afterAllowanceChange();
  }

  private afterAllowanceChange(): void {
    const remaining = this.remainingMs;
    if (remaining === undefined || remaining > this.options.warnMs) {
      this.warnedNow = false;
    }
    if ((this.current === 'dusk' || this.current === 'night') && !this.expired) {
      this.wake();
    }
  }

  private wake(): void {
    this.current = 'dawn';
    this.phaseMs = 0;
    this.pending.push('wake');
  }

  /** One frame. Returns what happened (usually nothing). */
  update(input: DayInput): DayEvent[] {
    const events = this.pending;
    this.pending = [];
    const dt = Number.isFinite(input.frameMs) && input.frameMs > 0 ? Math.min(input.frameMs, this.options.maxFrameMs) : 0;
    if (input.dayKey !== this.accountNow.day) {
      // A new calendar day (also midnight while playing): a fresh account; a night is over.
      this.accountNow = { day: input.dayKey, usedMs: 0, extraMinutes: 0 };
      this.warnedNow = false;
      events.push('newDay');
      if (this.current === 'dusk' || this.current === 'night') {
        this.wake();
        events.push(...this.pending.splice(0));
      }
    }
    switch (this.current) {
      case 'day':
      case 'dawn': {
        if (input.counting) {
          this.accountNow.usedMs += dt;
        }
        if (this.current === 'dawn') {
          this.phaseMs += dt;
          if (this.phaseMs >= this.options.dawnMs) {
            this.current = 'day';
            this.phaseMs = 0;
          }
          break;
        }
        const remaining = this.remainingMs;
        if (remaining === undefined || !input.counting) {
          break;
        }
        if (!this.warnedNow && remaining > 0 && remaining <= this.options.warnMs) {
          this.warnedNow = true;
          events.push('warn');
        }
        if (remaining <= 0) {
          this.current = 'dusk';
          this.phaseMs = 0;
          events.push('dusk');
        }
        break;
      }
      case 'dusk':
        this.phaseMs += dt;
        if ((this.phaseMs >= this.options.duskMinMs && input.allAsleep) || this.phaseMs >= this.options.duskMaxMs) {
          this.current = 'night';
          this.phaseMs = 0;
          events.push('night');
        }
        break;
      case 'night':
        break;
    }
    return events;
  }
}
