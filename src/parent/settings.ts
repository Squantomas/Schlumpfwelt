import { PARENT_RULES } from '../data/parent';
import { readPin, type PinRecord } from './pin';

/**
 * What the parents set and what the day has used (M8). It lives in its own entry of the browser's storage
 * (`settingsStore.ts`), never in the village: saving the village to a file and loading one neither takes the PIN or the
 * limit along nor replaces them.
 *
 * - `pin`: the salted hash of the PIN, `null` before the parents set one.
 * - `limitMinutes`: minutes of play a day, `0` = no limit ("Aus", the default).
 * - `day`, `usedMs`, `extraMinutes`: the account of one calendar day (local date `YYYY-MM-DD`) – the visible play time
 *   counted so far and the extra minutes the parents gave today. A new day starts a new account.
 * - `tutorial`: the progress of the guided start (owned and checked by `src/ui/tutorial.ts`; `undefined` while there is
 *   none – a village from before M8 counts as "tutorial done").
 */
export interface ParentSettings {
  readonly pin: PinRecord | null;
  readonly limitMinutes: number;
  readonly day: string;
  readonly usedMs: number;
  readonly extraMinutes: number;
  readonly tutorial: unknown;
}

export const SETTINGS_FORMAT = 'village-parent';
export const SETTINGS_VERSION = 1;

/** No day has more minutes than this (a broken entry can not make the game count for ever). */
const MAX_MINUTES = 24 * 60;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function defaultSettings(day: string): ParentSettings {
  return { pin: null, limitMinutes: PARENT_RULES.defaultLimit, day, usedMs: 0, extraMinutes: 0, tutorial: undefined };
}

/** The entry as it is stored (plain data). */
export function toStored(settings: ParentSettings): Record<string, unknown> {
  return {
    format: SETTINGS_FORMAT,
    version: SETTINGS_VERSION,
    pin: settings.pin === null ? null : { salt: settings.pin.salt, hash: settings.pin.hash },
    limitMinutes: settings.limitMinutes,
    day: settings.day,
    usedMs: settings.usedMs,
    extraMinutes: settings.extraMinutes,
    ...(settings.tutorial === undefined ? {} : { tutorial: settings.tutorial }),
  };
}

function wholeIn(raw: unknown, min: number, max: number, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(max, Math.max(min, Math.floor(raw))) : fallback;
}

/**
 * Reads a stored entry, never throws: anything that is not ours gives the defaults; every field is checked on its own
 * (an odd number is brought into its range, an odd PIN counts as "no PIN yet"). A day other than `today` starts a
 * fresh account.
 */
export function readSettings(raw: unknown, today: string): ParentSettings {
  if (typeof raw !== 'object' || raw === null || (raw as Record<string, unknown>)['format'] !== SETTINGS_FORMAT) {
    return defaultSettings(today);
  }
  const data = raw as Record<string, unknown>;
  const day = typeof data['day'] === 'string' && DAY_KEY.test(data['day']) ? data['day'] : today;
  const sameDay = day === today;
  return {
    pin: readPin(data['pin']),
    limitMinutes: wholeIn(data['limitMinutes'], 0, MAX_MINUTES, PARENT_RULES.defaultLimit),
    day: today,
    usedMs: sameDay ? wholeIn(data['usedMs'], 0, MAX_MINUTES * 60_000, 0) : 0,
    extraMinutes: sameDay ? wholeIn(data['extraMinutes'], 0, MAX_MINUTES, 0) : 0,
    tutorial: data['tutorial'],
  };
}
