import { describe, expect, it } from 'vitest';
import { MemoryStore, type SaveStore } from '../../src/save/saveStore';
import { parseStartParams, prepareStart } from '../../src/save/startup';
import { SAVE_VERSION, toSaveData } from '../../src/sim/saveData';
import { createInitialState } from '../../src/sim/state';

/** A store that reports itself as IndexedDB but is memory – the real one is checked by the smoke test. */
function idbLike(initial?: unknown, inner = new MemoryStore(initial)): SaveStore {
  return { kind: 'indexedDb', load: () => inner.load(), save: (data) => inner.save(data), saveBackup: (data) => inner.saveBackup(data), loadBackups: () => inner.loadBackups() };
}

const random = (): number => 4242;

describe('Startadresse', () => {
  it.each([
    ['', undefined, true],
    ['?foo=1', undefined, true],
    ['?seed=1', 1, false],
    ['?seed=12345', 12345, false],
    ['?seed=1&save=1', 1, true],
    ['?save=1', undefined, true],
    ['?seed=abc', undefined, true],
    ['?seed=', undefined, true],
    ['?seed=-3', undefined, true],
    ['?seed=2.5', undefined, true],
    ['?seed=3&save=0', 3, false],
  ])('%s → Seed %s, speichern: %s', (search, seed, persist) => {
    expect(parseStartParams(search)).toEqual({ seed, persist });
  });
});

describe('Start: Laden beim Start', () => {
  it('mit ?seed=N wird weder geladen noch gespeichert', async () => {
    const store = idbLike(toSaveData(createInitialState(99)));
    const start = await prepareStart(parseStartParams('?seed=1'), store, random);
    expect(start.kind).toBe('new');
    expect(start.state.seed).toBe(1);
    expect(start.autosave).toBe(false);
  });

  it('ohne Spielstand: neue Insel mit Zufalls-Seed, Autosave an', async () => {
    const start = await prepareStart(parseStartParams(''), idbLike(), random);
    expect(start.kind).toBe('new');
    expect(start.state.seed).toBe(4242);
    expect(start.autosave).toBe(true);
    expect(start.notice).toBeUndefined();
  });

  it('?seed=N&save=1 ohne Spielstand: genau diese Insel', async () => {
    const start = await prepareStart(parseStartParams('?seed=7&save=1'), idbLike(), random);
    expect(start.state.seed).toBe(7);
    expect(start.autosave).toBe(true);
  });

  it('lädt den gespeicherten Stand; ein Spielstand schlägt den Seed der Adresse', async () => {
    const saved = createInitialState(99);
    saved.inventory['coins'] = 777;
    saved.tick = 1234;
    const start = await prepareStart(parseStartParams('?seed=7&save=1'), idbLike(toSaveData(saved)), random);
    expect(start.kind).toBe('loaded');
    expect(start.state.seed).toBe(99);
    expect(start.state.inventory['coins']).toBe(777);
    expect(start.state.tick).toBe(1234);
    expect(start.autosave).toBe(true);
    expect(start.notice).toBeUndefined();
  });

  it('unlesbarer Spielstand: neues Spiel mit freundlichem Hinweis, Speichern bleibt an', async () => {
    for (const junk of ['kaputt', 42, { format: 'village-save', version: 2, world: null }, { irgendwas: true }]) {
      const start = await prepareStart(parseStartParams(''), idbLike(junk), random);
      expect(start.kind).toBe('unreadable');
      expect(start.notice).toBe('save.startBroken');
      expect(start.autosave).toBe(true);
      expect(start.state.seed).toBe(4242);
    }
  });

  it('Spielstand aus einer neueren Version: neues Spiel, aber nichts überschreiben', async () => {
    const future = { ...toSaveData(createInitialState(5)), version: SAVE_VERSION + 1 };
    const start = await prepareStart(parseStartParams(''), idbLike(future), random);
    expect(start.kind).toBe('tooNew');
    expect(start.notice).toBe('save.startTooNew');
    expect(start.autosave).toBe(false);
  });

  it('Speicher nicht lesbar: weiterspielen, nichts überschreiben, dezenter Hinweis', async () => {
    const broken: SaveStore = { kind: 'indexedDb', load: () => Promise.reject(new Error('gesperrt')), save: () => Promise.resolve(), saveBackup: () => Promise.resolve(), loadBackups: () => Promise.resolve([]) };
    const start = await prepareStart(parseStartParams(''), broken, random);
    expect(start.kind).toBe('storageFailed');
    expect(start.autosave).toBe(false);
    expect(start.notice).toBe('save.noStorage');
  });

  it('Browser ohne IndexedDB (Speicher nur im Arbeitsspeicher): Hinweis, kein Autosave', async () => {
    const start = await prepareStart(parseStartParams(''), new MemoryStore(), random);
    expect(start.kind).toBe('new');
    expect(start.autosave).toBe(false);
    expect(start.notice).toBe('save.noStorage');
  });

  it('R1: ein unlesbarer Spielstand wird vor dem Ersetzen gesichert – der erste bleibt für immer, spätere gehen an einen zweiten Platz', async () => {
    const inner = new MemoryStore({ format: 'village-save', version: 2, world: null, wichtig: 'erster' });
    const store = idbLike(undefined, inner);
    const first = await prepareStart(parseStartParams(''), store, random);
    expect(first.kind).toBe('unreadable');
    expect(first.autosave).toBe(true);
    expect(await inner.loadBackups()).toEqual([{ format: 'village-save', version: 2, world: null, wichtig: 'erster' }]);
    // Autosave replaces the broken save by a good one; later a second broken one shows up.
    await inner.save({ nochmal: 'kaputt' });
    await prepareStart(parseStartParams(''), store, random);
    await inner.save({ drittes: 'kaputt' });
    await prepareStart(parseStartParams(''), store, random);
    const copies = await inner.loadBackups();
    expect(copies).toHaveLength(2);
    expect(copies[0]).toMatchObject({ wichtig: 'erster' });
    expect(copies[1]).toEqual({ drittes: 'kaputt' });
  });

  it('R1: lässt sich die Kopie nicht anlegen, wird auch nichts darüber geschrieben', async () => {
    const inner = new MemoryStore({ kaputt: true });
    const store: SaveStore = { ...idbLike(undefined, inner), saveBackup: () => Promise.reject(new Error('voll')) };
    const start = await prepareStart(parseStartParams(''), store, random);
    expect(start.kind).toBe('unreadable');
    expect(start.autosave).toBe(false);
  });

  it('R1: ein guter oder ein neuerer Spielstand braucht keine Kopie', async () => {
    const inner = new MemoryStore(toSaveData(createInitialState(3)));
    await prepareStart(parseStartParams(''), idbLike(undefined, inner), random);
    const future = new MemoryStore({ ...toSaveData(createInitialState(3)), version: SAVE_VERSION + 1 });
    await prepareStart(parseStartParams(''), idbLike(undefined, future), random);
    expect(await inner.loadBackups()).toEqual([]);
    expect(await future.loadBackups()).toEqual([]);
  });

  it('R2: ein zweites Fenster liest das Dorf, schreibt aber nichts (auch keine Kopie) und sagt es', async () => {
    const saved = createInitialState(99);
    saved.tick = 777;
    const inner = new MemoryStore(toSaveData(saved));
    const start = await prepareStart(parseStartParams(''), idbLike(undefined, inner), random, false);
    expect(start.kind).toBe('otherWindow');
    expect(start.autosave).toBe(false);
    expect(start.notice).toBe('save.otherWindow');
    expect(start.state.tick).toBe(777);
    expect(inner.writes).toBe(0);
    const broken = new MemoryStore({ kaputt: 1 });
    const second = await prepareStart(parseStartParams(''), idbLike(undefined, broken), random, false);
    expect(second.autosave).toBe(false);
    expect(await broken.loadBackups()).toEqual([]);
  });
});
