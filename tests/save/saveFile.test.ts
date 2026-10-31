import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../src/save/saveStore';
import { fileSafe, isAppleTouchDevice, saveFileName } from '../../src/save/saveFile';

describe('Dateiname', () => {
  it.each([
    ['Spielwelt', 'spielwelt'],
    ['Süße Größe', 'suesse-groesse'],
    ['  Dorf  Nr. 1!! ', 'dorf-nr-1'],
    ['', 'village'],
    ['!!!', 'village'],
    ['Café', 'cafe'],
  ])('%s → %s', (input, expected) => {
    expect(fileSafe(input)).toBe(expected);
  });

  it('besteht aus Spielname, Datum und .json', () => {
    const name = saveFileName(new Date(2026, 9, 31, 12, 0, 0));
    expect(name).toMatch(/^[a-z0-9-]+-2026-10-31\.json$/);
    expect(saveFileName(new Date(2027, 0, 5))).toMatch(/-2027-01-05\.json$/);
  });
});

describe('MemoryStore', () => {
  it('gibt zurück, was gespeichert wurde – als Kopie', async () => {
    const store = new MemoryStore();
    expect(await store.load()).toBeUndefined();
    const data = { a: [1, 2, 3] };
    await store.save(data);
    data.a.push(4);
    expect(await store.load()).toEqual({ a: [1, 2, 3] });
    const loaded = (await store.load()) as { a: number[] };
    loaded.a.push(9);
    expect(await store.load()).toEqual({ a: [1, 2, 3] });
    expect(store.writes).toBe(1);
  });
});

describe('iPad und iPhone bekommen das Teilen-Blatt (R4)', () => {
  it.each([
    ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone', 5, true],
    ['iPad (mobile Seite)', 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X)', 'iPad', 5, true],
    ['iPad (Desktop-Seite, meldet sich als Mac)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5, true],
    ['Mac', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0, false],
    ['Windows', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 10, false],
    ['Linux', 'Mozilla/5.0 (X11; Linux x86_64)', 'Linux x86_64', 0, false],
    ['Android', 'Mozilla/5.0 (Linux; Android 14)', 'Linux armv81', 5, false],
  ])('%s', (_name, userAgent, platform, maxTouchPoints, expected) => {
    expect(isAppleTouchDevice({ userAgent, platform, maxTouchPoints })).toBe(expected);
  });
});
