import { describe, expect, it } from 'vitest';
import { PARENT_RULES } from '../../src/data/parent';
import { makePin } from '../../src/parent/pin';
import { DEFAULT_SOUND, SETTINGS_FORMAT, SETTINGS_MIGRATIONS, SETTINGS_VERSION, defaultSettings, migrateSettings, newerSettings, readSettings, readSound, toStored } from '../../src/parent/settings';

const TODAY = '2026-11-01';

describe('Einstellungen der Eltern: lesen und schreiben (M8)', () => {
  it('ohne Eintrag: keine PIN, kein Limit, heute noch nichts gespielt', () => {
    expect(readSettings(undefined, TODAY)).toEqual({ pin: null, limitMinutes: PARENT_RULES.defaultLimit, day: TODAY, usedMs: 0, extraMinutes: 0, pinLost: false, tutorial: undefined, sound: DEFAULT_SOUND });
    expect(PARENT_RULES.defaultLimit).toBe(0);
    expect(PARENT_RULES.limitChoices).toEqual([0, 15, 30, 45, 60, 90]);
  });

  it('was geschrieben wird, kommt genauso wieder (auch der Fortschritt des Tutorials)', () => {
    const settings = { pin: makePin('7531', 'ab12'), limitMinutes: 30, day: TODAY, usedMs: 123_456, extraMinutes: 10, pinLost: false, tutorial: { status: 'active', step: 2 }, sound: { on: false, music: true, sfx: false } };
    const stored = JSON.parse(JSON.stringify(toStored(settings))) as unknown;
    expect(readSettings(stored, TODAY)).toEqual(settings);
    expect(JSON.stringify(stored)).not.toContain('7531');
  });

  it('ein späterer Tag beginnt ein neues Konto; PIN, Limit und Tutorial bleiben', () => {
    const stored = toStored({ pin: makePin('1234', 'ab12'), limitMinutes: 30, day: '2026-10-31', usedMs: 1_800_000, extraMinutes: 10, pinLost: false, tutorial: 'x', sound: DEFAULT_SOUND });
    const read = readSettings(stored, TODAY);
    expect(read.day).toBe(TODAY);
    expect(read.usedMs).toBe(0);
    expect(read.extraMinutes).toBe(0);
    expect(read.limitMinutes).toBe(30);
    expect(read.pin).not.toBeNull();
    expect(read.tutorial).toBe('x');
  });

  it('nie ein Fehler: fremde oder kaputte Einträge geben die Voreinstellung oder sinnvolle Werte', () => {
    for (const raw of [null, 0, 'text', [], { format: 'other' }, { version: 1 }]) {
      expect(readSettings(raw, TODAY)).toEqual(defaultSettings(TODAY));
    }
    const odd = readSettings({ format: SETTINGS_FORMAT, pin: 'x', limitMinutes: -5, day: TODAY, usedMs: Number.NaN, extraMinutes: 1e12 }, TODAY);
    expect(odd).toEqual({ pin: null, limitMinutes: 0, day: TODAY, usedMs: 0, extraMinutes: 24 * 60, pinLost: true, tutorial: undefined, sound: DEFAULT_SOUND });
    const fractions = readSettings({ format: SETTINGS_FORMAT, limitMinutes: 29.7, day: 'gestern', usedMs: 5.5 }, TODAY);
    expect(fractions.limitMinutes).toBe(29);
    // An unreadable day counts as today (the time stays counted: no way round the limit).
    expect(fractions.usedMs).toBe(5);
  });

  it('zufällige Einträge werfen nie und liefern immer gültige Zahlen', () => {
    let seed = 7;
    const random = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const values: unknown[] = [undefined, null, -1, 0, 1, 15, 1e9, Number.NaN, Infinity, 'x', '2026-11-01', [], {}, true];
    for (let i = 0; i < 300; i += 1) {
      const pick = (): unknown => values[Math.floor(random() * values.length)];
      const raw = { format: SETTINGS_FORMAT, pin: pick(), limitMinutes: pick(), day: pick(), usedMs: pick(), extraMinutes: pick(), tutorial: pick() };
      const read = readSettings(raw, TODAY);
      expect(Number.isInteger(read.limitMinutes) && read.limitMinutes >= 0).toBe(true);
      expect(Number.isInteger(read.usedMs) && read.usedMs >= 0).toBe(true);
      expect(Number.isInteger(read.extraMinutes) && read.extraMinutes >= 0).toBe(true);
      // A day after today (here only a broken one or today) is never taken: today, or a later stored day.
      expect(read.day >= TODAY).toBe(true);
    }
  });

  it('ein Datum zurück beginnt kein neues Konto: der gespeicherte Tag und seine Zeit gehen weiter (Korrekturrunde 1)', () => {
    const stored = toStored({ pin: null, limitMinutes: 15, day: '2026-11-02', usedMs: 900_000, extraMinutes: 10, pinLost: false, tutorial: undefined, sound: DEFAULT_SOUND });
    const read = readSettings(stored, TODAY);
    expect(read.day).toBe('2026-11-02');
    expect(read.usedMs).toBe(900_000);
    expect(read.extraMinutes).toBe(10);
    // The real next day after the stored one is later: then a fresh account.
    expect(readSettings(stored, '2026-11-03').usedMs).toBe(0);
  });

  it('eine unlesbare PIN wird als verloren gemerkt, bis eine neue gesetzt ist (Korrekturrunde 1)', () => {
    const broken = readSettings({ format: SETTINGS_FORMAT, version: 1, pin: { salt: 'zz', hash: 1 }, limitMinutes: 30, day: TODAY }, TODAY);
    expect(broken.pin).toBeNull();
    expect(broken.pinLost).toBe(true);
    // Written again (still without a PIN) it stays lost.
    const again = readSettings(JSON.parse(JSON.stringify(toStored(broken))) as unknown, TODAY);
    expect(again.pinLost).toBe(true);
    // No PIN ever: nothing lost.
    expect(readSettings({ format: SETTINGS_FORMAT, pin: null, day: TODAY }, TODAY).pinLost).toBe(false);
    expect(readSettings({ format: SETTINGS_FORMAT, day: TODAY }, TODAY).pinLost).toBe(false);
    // A readable PIN with an old mark: not lost.
    expect(readSettings({ ...toStored({ ...broken, pin: makePin('1234', 'ab12') }), pinLost: true }, TODAY).pinLost).toBe(false);
    expect(toStored({ ...broken, pin: makePin('1234', 'ab12') })).not.toHaveProperty('pinLost');
  });

  it('erkennt einen Eintrag einer neueren Version (Korrekturrunde 1)', () => {
    expect(newerSettings({ format: SETTINGS_FORMAT, version: SETTINGS_VERSION + 1 })).toBe(true);
    expect(newerSettings({ format: SETTINGS_FORMAT, version: SETTINGS_VERSION })).toBe(false);
    expect(newerSettings({ format: SETTINGS_FORMAT })).toBe(false);
    expect(newerSettings({ format: 'other', version: 99 })).toBe(false);
    expect(newerSettings(undefined)).toBe(false);
  });
});

describe('Einstellungen: Ton und Version 2 (M9)', () => {
  it('Version 2 schreibt den Ton mit', () => {
    expect(SETTINGS_VERSION).toBe(2);
    expect(toStored(defaultSettings(TODAY))).toMatchObject({ version: 2, sound: { on: true, music: true, sfx: true } });
  });

  it('Migration 1 → 2: der Ton ist an, alles andere bleibt', () => {
    const v1 = { format: SETTINGS_FORMAT, version: 1, pin: null, limitMinutes: 45, day: TODAY, usedMs: 600_000, extraMinutes: 10 };
    expect(migrateSettings(v1)).toEqual({ ...v1, version: 2, sound: { on: true, music: true, sfx: true } });
    expect(SETTINGS_MIGRATIONS[1]).toBeTypeOf('function');
    // Without a version the entry counts as version 1.
    expect(migrateSettings({ format: SETTINGS_FORMAT, day: TODAY })).toMatchObject({ version: 2, sound: DEFAULT_SOUND });
    const read = readSettings(v1, TODAY);
    expect(read.sound).toEqual(DEFAULT_SOUND);
    expect(read.limitMinutes).toBe(45);
    expect(read.usedMs).toBe(600_000);
  });

  it('eine neuere Version wird nicht umgeschrieben und gilt als neuer', () => {
    const v3 = { format: SETTINGS_FORMAT, version: 3, sound: { on: false, music: false, sfx: false }, day: TODAY };
    expect(migrateSettings(v3)).toBe(v3);
    expect(newerSettings(v3)).toBe(true);
    expect(readSettings(v3, TODAY).sound).toEqual({ on: false, music: false, sfx: false });
  });

  it('kaputte Schalter zählen als an (ein kaputter Eintrag macht das Spiel nie für immer stumm)', () => {
    expect(readSound(undefined)).toEqual(DEFAULT_SOUND);
    expect(readSound({ on: 'nein', music: 0, sfx: false })).toEqual({ on: true, music: true, sfx: false });
    expect(readSettings({ format: SETTINGS_FORMAT, version: 2, day: TODAY, sound: 'aus' }, TODAY).sound).toEqual(DEFAULT_SOUND);
  });
});
