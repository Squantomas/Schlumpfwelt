import { describe, expect, it } from 'vitest';
import { ParentSession } from '../../src/parent/parentSession';
import { readSettings } from '../../src/parent/settings';
import { MemorySettingsStore, type SettingsStore } from '../../src/parent/settingsStore';
import type { DayClockOptions } from '../../src/parent/dayClock';

const OPTIONS: DayClockOptions = { warnMs: 5 * 60_000, duskMinMs: 6000, duskMaxMs: 18_000, dawnMs: 3000, maxFrameMs: 250 };
const DAY = '2026-11-01';

async function stored(store: SettingsStore) {
  await Promise.resolve();
  return readSettings(await store.load(), DAY);
}

function frames(session: ParentSession, ms: number, counting = true): void {
  for (let t = 0; t < ms; t += 100) {
    session.update({ frameMs: 100, dayKey: DAY, counting, allAsleep: false });
  }
}

describe('ParentSession: PIN, Limit und Konto, gespeichert neben dem Dorf (M8)', () => {
  it('PIN festlegen, prüfen, ändern', async () => {
    const store = new MemorySettingsStore();
    const session = await ParentSession.open(store, DAY, OPTIONS);
    expect(session.hasPin).toBe(false);
    session.setPin('12', () => 0.5);
    expect(session.hasPin).toBe(false);
    session.setPin('2580', () => 0.5);
    expect(session.hasPin).toBe(true);
    expect(session.checkPin('2580')).toBe(true);
    expect(session.checkPin('0852')).toBe(false);
    await session.flush();
    const again = await ParentSession.open(store, DAY, OPTIONS);
    expect(again.checkPin('2580')).toBe(true);
    again.setPin('1111');
    expect(again.checkPin('2580')).toBe(false);
    expect(again.checkPin('1111')).toBe(true);
    expect(JSON.stringify(await store.load())).not.toMatch(/2580|1111/);
  });

  it('das Limit und „10 Minuten mehr“ werden sofort gespeichert', async () => {
    const store = new MemorySettingsStore();
    const session = await ParentSession.open(store, DAY, OPTIONS);
    session.setLimit(30);
    session.addExtra();
    await session.flush();
    const read = await stored(store);
    expect(read.limitMinutes).toBe(30);
    expect(read.extraMinutes).toBe(10);
  });

  it('die gespielte Zeit wird alle paar Sekunden geschrieben: Neuladen schenkt keine Zeit', async () => {
    const store = new MemorySettingsStore();
    const session = await ParentSession.open(store, DAY, OPTIONS);
    session.setLimit(15);
    await session.flush();
    const writes = store.writes;
    frames(session, 4900);
    expect(store.writes).toBe(writes);
    frames(session, 200);
    await session.flush();
    expect((await stored(store)).usedMs).toBeGreaterThanOrEqual(5000);
    // Not counting (the parents' panel, the background): nothing new to write.
    const counted = store.writes;
    frames(session, 20_000, false);
    expect(store.writes).toBe(counted);
    const reloaded = await ParentSession.open(store, DAY, OPTIONS);
    expect(reloaded.clock.account.usedMs).toBeGreaterThanOrEqual(5000);
  });

  it('Abend und Nacht werden gleich gespeichert; nach dem Neuladen ist sofort Nacht', async () => {
    const store = new MemorySettingsStore({ format: 'village-parent', limitMinutes: 15, day: DAY, usedMs: 15 * 60_000 - 500 });
    const session = await ParentSession.open(store, DAY, OPTIONS);
    frames(session, 600);
    expect(session.clock.phase).toBe('dusk');
    await session.flush();
    const reloaded = await ParentSession.open(store, DAY, OPTIONS);
    expect(reloaded.clock.phase).toBe('night');
  });

  it('nach der Übernahme durch ein neueres Fenster wird nichts mehr geschrieben', async () => {
    const store = new MemorySettingsStore();
    const session = await ParentSession.open(store, DAY, OPTIONS);
    let lost = false;
    session.stopWhen(() => lost);
    session.setLimit(30);
    await session.flush();
    const writes = store.writes;
    lost = true;
    session.setLimit(60);
    frames(session, 10_000);
    await session.flush();
    expect(store.writes).toBe(writes);
    expect((await stored(store)).limitMinutes).toBe(30);
  });

  it('ein Speicher, der nicht lesbar ist: Voreinstellungen, nur für diesen Besuch (nichts wird überschrieben)', async () => {
    let writes = 0;
    const broken: SettingsStore = {
      kind: 'indexedDb',
      load: () => Promise.reject(new Error('nope')),
      save: () => {
        writes += 1;
        return Promise.resolve();
      },
    };
    const session = await ParentSession.open(broken, DAY, OPTIONS);
    session.setLimit(30);
    await session.flush();
    expect(writes).toBe(0);
    expect(session.storeKind).toBe('memory');
    expect(session.takeMemoryNote()).toBe('noStore');
    expect(session.takeMemoryNote()).toBeUndefined();
  });

  it('ein Eintrag einer neueren Version wird gelesen, aber nie überschrieben – einmal ein Satz (Korrekturrunde 1)', async () => {
    let writes = 0;
    const newer = { format: 'village-parent', version: 2, pin: null, limitMinutes: 45, day: DAY, usedMs: 60_000, extraMinutes: 0 };
    const store: SettingsStore = {
      kind: 'indexedDb',
      load: () => Promise.resolve(structuredClone(newer)),
      save: () => {
        writes += 1;
        return Promise.resolve();
      },
    };
    const session = await ParentSession.open(store, DAY, OPTIONS);
    expect(session.clock.limitMinutes).toBe(45);
    session.setLimit(30);
    frames(session, 6000);
    await session.flush();
    expect(writes).toBe(0);
    expect(session.storeKind).toBe('memory');
    expect(JSON.parse(session.describe())).toMatchObject({ store: 'memory', newer: true });
    expect(session.takeMemoryNote()).toBe('newer');
    expect(session.takeMemoryNote()).toBeUndefined();
  });

  it('eine verlorene PIN oder ein Limit ohne PIN: eine neue PIN braucht erst die Rechenfrage (Korrekturrunde 1)', async () => {
    const lost = await ParentSession.open(new MemorySettingsStore({ format: 'village-parent', version: 1, pin: { salt: 'x!', hash: '?' }, limitMinutes: 0, day: DAY }), DAY, OPTIONS);
    expect(lost.hasPin).toBe(false);
    expect(lost.pinGuarded).toBe(true);
    lost.setPin('2580');
    expect(lost.pinGuarded).toBe(false);
    const limited = await ParentSession.open(new MemorySettingsStore({ format: 'village-parent', version: 1, pin: null, limitMinutes: 30, day: DAY }), DAY, OPTIONS);
    expect(limited.pinGuarded).toBe(true);
    // The very first start: no PIN, no limit – whoever opens the menu first sets the PIN.
    const fresh = await ParentSession.open(new MemorySettingsStore(), DAY, OPTIONS);
    expect(fresh.pinGuarded).toBe(false);
  });

  it('ein Schreibfehler wirft nie und wird gezählt', async () => {
    const failing: SettingsStore = { kind: 'indexedDb', load: () => Promise.resolve(undefined), save: () => Promise.reject(new Error('full')) };
    const session = await ParentSession.open(failing, DAY, OPTIONS);
    session.setLimit(30);
    await session.flush();
    expect(JSON.parse(session.describe())).toMatchObject({ failures: 2, limit: 30, phase: 'day' });
  });

  it('das Tutorial eines Test-Dorfs (ohne Speichern) bleibt im Arbeitsspeicher, das gespeicherte bleibt unverändert', async () => {
    const store = new MemorySettingsStore({ format: 'village-parent', limitMinutes: 0, day: DAY, tutorial: { stored: true } });
    const session = await ParentSession.open(store, DAY, OPTIONS);
    session.keepTutorialInMemory();
    session.setTutorial({ step: 3 });
    session.setLimit(15);
    await session.flush();
    expect(session.tutorial).toEqual({ step: 3 });
    const read = await stored(store);
    expect(read.tutorial).toEqual({ stored: true });
    expect(read.limitMinutes).toBe(15);
  });

  it('describe nennt Phase, Sekunden und Speicher für die Seite', async () => {
    const session = await ParentSession.open(new MemorySettingsStore(), DAY, OPTIONS);
    session.setLimit(15);
    frames(session, 2000);
    expect(JSON.parse(session.describe())).toMatchObject({ phase: 'day', used: 2, allowed: 900, limit: 15, extra: 0, warned: false, day: DAY, store: 'memory', pin: false });
  });
});
