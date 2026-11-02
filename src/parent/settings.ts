import { PARENT_RULES } from '../data/parent';
import { laterDay } from './dayClock';
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
 * - `pinLost`: a PIN was set, but what is stored can not be read (Korrekturrunde 1). A new PIN then needs the
 *   question of "PIN vergessen?" first – otherwise a child would simply choose one. Stored until a new PIN is set.
 * - `tutorial`: the progress of the guided start (owned and checked by `src/ui/tutorial.ts`; `undefined` while there is
 *   none – a village from before M8 counts as "tutorial done").
 * - `sound` (M9, version 2): sound on or off as a whole, and music and noises on their own. Default: all on (quiet).
 */
export interface ParentSettings {
  readonly pin: PinRecord | null;
  readonly limitMinutes: number;
  readonly day: string;
  readonly usedMs: number;
  readonly extraMinutes: number;
  readonly pinLost: boolean;
  readonly tutorial: unknown;
  readonly sound: SoundSettings;
}

/** The sound switches (M9): `on` is the one switch behind the gear; `music` and `sfx` are in the parents' menu. */
export interface SoundSettings {
  readonly on: boolean;
  readonly music: boolean;
  readonly sfx: boolean;
}

export const DEFAULT_SOUND: SoundSettings = { on: true, music: true, sfx: true };

export const SETTINGS_FORMAT = 'village-parent';
/** Version 2 (M9): `sound`. Every change of the format raises it and adds a step to {@link SETTINGS_MIGRATIONS}. */
export const SETTINGS_VERSION = 2;

/**
 * Steps from one version of the entry to the next (`from` → `from + 1`), pure functions on plain data. An entry without
 * a version is version 1 (M8 wrote it).
 */
export const SETTINGS_MIGRATIONS: Readonly<Record<number, (data: Readonly<Record<string, unknown>>) => Record<string, unknown>>> = {
  1: (data) => ({ ...data, version: 2, sound: { ...DEFAULT_SOUND } }),
};

/** Brings an entry of an older version up to {@link SETTINGS_VERSION} (newer ones and foreign data stay as they are). */
export function migrateSettings(raw: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  let data = raw;
  let version = typeof data['version'] === 'number' && Number.isInteger(data['version']) ? data['version'] : 1;
  while (version < SETTINGS_VERSION) {
    const step = SETTINGS_MIGRATIONS[version];
    if (!step) {
      break;
    }
    data = step(data);
    version += 1;
  }
  return data;
}

/** Reads the sound switches; anything odd counts as "on" (a broken entry never silences the game for good). */
export function readSound(raw: unknown): SoundSettings {
  const data = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const flag = (name: keyof SoundSettings): boolean => (typeof data[name] === 'boolean' ? (data[name]) : DEFAULT_SOUND[name]);
  return { on: flag('on'), music: flag('music'), sfx: flag('sfx') };
}

/** No day has more minutes than this (a broken entry can not make the game count for ever). */
const MAX_MINUTES = 24 * 60;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function defaultSettings(day: string): ParentSettings {
  return { pin: null, limitMinutes: PARENT_RULES.defaultLimit, day, usedMs: 0, extraMinutes: 0, pinLost: false, tutorial: undefined, sound: DEFAULT_SOUND };
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
    ...(settings.pinLost && settings.pin === null ? { pinLost: true } : {}),
    ...(settings.tutorial === undefined ? {} : { tutorial: settings.tutorial }),
    sound: { on: settings.sound.on, music: settings.sound.music, sfx: settings.sound.sfx },
  };
}

function wholeIn(raw: unknown, min: number, max: number, fallback: number): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(max, Math.max(min, Math.floor(raw))) : fallback;
}

/**
 * Is this an entry of a newer version of the game (Korrekturrunde 1)? It is read as far as it goes (the fields keep
 * their names), but never written over: the parents' session then keeps everything in memory for this visit.
 */
export function newerSettings(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null || (raw as Record<string, unknown>)['format'] !== SETTINGS_FORMAT) {
    return false;
  }
  const version = (raw as Record<string, unknown>)['version'];
  return typeof version === 'number' && version > SETTINGS_VERSION;
}

/**
 * Reads a stored entry, never throws: anything that is not ours gives the defaults; every field is checked on its own
 * (an odd number is brought into its range, an odd PIN counts as "no PIN" – and as `pinLost`). Only a day **after**
 * the stored one starts a fresh account; with a date set back the stored day and its account go on (no time back).
 */
export function readSettings(raw: unknown, today: string): ParentSettings {
  if (typeof raw !== 'object' || raw === null || (raw as Record<string, unknown>)['format'] !== SETTINGS_FORMAT) {
    return defaultSettings(today);
  }
  const data = migrateSettings(raw as Record<string, unknown>);
  const stored = typeof data['day'] === 'string' && DAY_KEY.test(data['day']) ? data['day'] : today;
  const fresh = laterDay(today, stored);
  const rawPin = data['pin'];
  const pin = readPin(rawPin);
  return {
    pin,
    limitMinutes: wholeIn(data['limitMinutes'], 0, MAX_MINUTES, PARENT_RULES.defaultLimit),
    day: fresh ? today : stored,
    usedMs: fresh ? 0 : wholeIn(data['usedMs'], 0, MAX_MINUTES * 60_000, 0),
    extraMinutes: fresh ? 0 : wholeIn(data['extraMinutes'], 0, MAX_MINUTES, 0),
    pinLost: pin === null && ((rawPin !== null && rawPin !== undefined) || data['pinLost'] === true),
    tutorial: data['tutorial'],
    sound: readSound(data['sound']),
  };
}
