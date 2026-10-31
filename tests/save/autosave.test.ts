import { describe, expect, it } from 'vitest';
import { Autosave } from '../../src/save/autosave';
import { saveWhenLeaving } from '../../src/save/lifecycle';
import { MemoryStore, OwnerLostError, type SaveStore } from '../../src/save/saveStore';
import { fromSaveData } from '../../src/sim/saveData';
import { createInitialState, type SimState } from '../../src/sim/state';

const MINUTE = 60_000;

/** A store whose writes the test finishes (or fails) by hand. */
class SlowStore implements SaveStore {
  readonly kind = 'memory';
  writes: unknown[] = [];
  failing = false;
  saveBackup(): Promise<void> {
    return Promise.resolve();
  }

  loadBackups(): Promise<unknown[]> {
    return Promise.resolve([]);
  }

  private pending: { resolve: () => void; reject: (error: Error) => void }[] = [];

  load(): Promise<unknown> {
    return Promise.resolve(undefined);
  }

  save(data: unknown): Promise<void> {
    this.writes.push(data);
    return new Promise((resolve, reject) => {
      if (this.failing) {
        reject(new Error('Speicher voll'));
        return;
      }
      this.pending.push({ resolve, reject });
    });
  }

  /** The writes that are running now fail. */
  fail(): void {
    for (const entry of this.pending.splice(0)) {
      entry.reject(new Error('Speicher voll'));
    }
  }

  finish(): void {
    for (const entry of this.pending.splice(0)) {
      entry.resolve();
    }
  }
}

function setup(): { state: SimState; store: MemoryStore; autosave: Autosave } {
  const state = createInitialState(2);
  const store = new MemoryStore();
  return { state, store, autosave: new Autosave(store, () => state) };
}

/** Lets the promises of the store finish. */
async function settle(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

describe('Autosave: wann gespeichert wird', () => {
  it('speichert nichts, solange sich nichts ändert (der geladene Stand gilt als gespeichert)', async () => {
    const { autosave, store } = setup();
    for (let now = 0; now < 5 * MINUTE; now += 1000) {
      autosave.update(now);
    }
    await settle();
    expect(store.writes).toBe(0);
  });

  it('speichert jede Minute, wenn die Zeit läuft', async () => {
    const { state, autosave, store } = setup();
    autosave.update(0);
    for (let now = 1000; now <= 3 * MINUTE + 500; now += 1000) {
      state.tick += 10;
      autosave.update(now);
      await settle();
    }
    // At 60 s, 120 s and 180 s.
    expect(store.writes).toBe(3);
  });

  it('speichert eine Bauaktion sofort im nächsten Bild (hartes Schließen gleich danach darf nichts kosten)', async () => {
    const { state, autosave, store } = setup();
    autosave.update(0);
    state.revision += 1;
    autosave.update(100);
    await settle();
    expect(store.writes).toBe(1);
    // Nothing changed: nothing more is written.
    autosave.update(200);
    autosave.update(300);
    await settle();
    expect(store.writes).toBe(1);
  });

  it('mehrere Befehle im selben Tick sind eine Änderung: ein Schreibvorgang', async () => {
    const { state, autosave, store } = setup();
    autosave.update(0);
    state.revision += 3;
    autosave.update(100);
    autosave.update(100);
    await settle();
    expect(store.writes).toBe(1);
  });

  it('wartet mit debounceMs, wenn man es verlangt', async () => {
    const state = createInitialState(2);
    const store = new MemoryStore();
    const autosave = new Autosave(store, () => state, { debounceMs: 1500 });
    autosave.update(0);
    state.revision += 1;
    autosave.update(100);
    autosave.update(900);
    await settle();
    expect(store.writes).toBe(0);
    autosave.update(1700);
    await settle();
    expect(store.writes).toBe(1);
  });

  it('eine Serie von Bauaktionen während eines Schreibvorgangs ergibt genau einen Nachschlag, keinen Sturm', async () => {
    const state = createInitialState(2);
    const store = new SlowStore();
    const autosave = new Autosave(store, () => state);
    autosave.update(0);
    state.revision += 1;
    autosave.update(100);
    expect(store.writes).toHaveLength(1);
    for (let i = 0; i < 20; i += 1) {
      state.revision += 1;
      autosave.update(200 + i * 100);
    }
    expect(store.writes).toHaveLength(1);
    store.finish();
    await settle();
    // The follow-up has the newest state of all the builds.
    expect(store.writes).toHaveLength(2);
    store.finish();
    await settle();
    expect(autosave.stats.saves).toBe(2);
    expect((store.writes[1] as { revision: number }).revision).toBe(state.revision);
    autosave.update(5000);
    await settle();
    expect(store.writes).toHaveLength(2);
  });

  it('saveNow und flush während eines Schreibvorgangs gehen nicht verloren (Import gleich nach einem Speichern)', async () => {
    const state = createInitialState(2);
    const store = new SlowStore();
    const autosave = new Autosave(store, () => state);
    autosave.update(0);
    state.revision += 1;
    autosave.update(100);
    expect(store.writes).toHaveLength(1);
    // A village from a file replaces the state while the write runs.
    state.inventory['coins'] = 4242;
    autosave.rebase(150);
    const done = autosave.saveNow();
    store.finish();
    await settle();
    expect(store.writes).toHaveLength(2);
    expect((store.writes[1] as { inventory: Record<string, number> }).inventory['coins']).toBe(4242);
    store.finish();
    await done;
    expect(autosave.stats.saves).toBe(2);
    // flush while a write runs: the change after it is written as well.
    state.revision += 1;
    autosave.update(300);
    state.tick += 5;
    const flushed = autosave.flush();
    store.finish();
    await settle();
    store.finish();
    await flushed;
    expect((store.writes[store.writes.length - 1] as { tick: number }).tick).toBe(state.tick);
  });

  it('flush speichert sofort, aber nur bei Änderungen', async () => {
    const { state, autosave, store } = setup();
    autosave.update(0);
    await autosave.flush();
    expect(store.writes).toBe(0);
    state.tick += 5;
    await autosave.flush();
    expect(store.writes).toBe(1);
    await autosave.flush();
    expect(store.writes).toBe(1);
  });

  it('der gespeicherte Stand lässt sich wieder laden und ist eine Momentaufnahme', async () => {
    const { state, autosave, store } = setup();
    autosave.update(0);
    state.inventory['coins'] = 4321;
    state.tick = 99;
    await autosave.flush();
    state.inventory['coins'] = 1;
    const loaded = fromSaveData(await store.load());
    expect(loaded.ok && loaded.state.inventory['coins']).toBe(4321);
    expect(loaded.ok && loaded.state.tick).toBe(99);
  });

  it('rebase: ein neu geladener Stand gilt als gespeichert; saveNow schreibt trotzdem', async () => {
    const { state, autosave, store } = setup();
    autosave.update(0);
    state.tick = 500;
    state.revision = 40;
    autosave.rebase(1000);
    autosave.update(1500);
    autosave.update(5000);
    await settle();
    expect(store.writes).toBe(0);
    await autosave.saveNow();
    expect(store.writes).toBe(1);
  });

  it('überlappt nie zwei Speicherungen', async () => {
    const state = createInitialState(2);
    const store = new SlowStore();
    const autosave = new Autosave(store, () => state);
    autosave.update(0);
    state.tick = 1;
    autosave.update(MINUTE);
    state.revision += 1;
    autosave.update(MINUTE + 3000);
    autosave.update(MINUTE + 4000);
    expect(store.writes).toHaveLength(1);
    store.finish();
    await settle();
    // Now the change that came meanwhile is saved.
    autosave.update(MINUTE + 5000);
    expect(store.writes).toHaveLength(2);
    store.finish();
    await settle();
    expect(autosave.stats.saves).toBe(2);
  });
});

describe('Autosave: wenn das Speichern scheitert', () => {
  it('wirft nichts, zählt den Fehler und versucht es erst nach einer Minute wieder', async () => {
    const state = createInitialState(2);
    const store = new SlowStore();
    store.failing = true;
    const autosave = new Autosave(store, () => state);
    autosave.update(0);
    state.revision += 1;
    for (let now = 100; now < 40_000; now += 500) {
      autosave.update(now);
      await settle();
    }
    expect(store.writes).toHaveLength(1);
    expect(autosave.stats.failures).toBe(1);
    expect(autosave.stats.saves).toBe(0);
    // After the pause it tries again – and works when the store does.
    store.failing = false;
    autosave.update(100 + MINUTE + 2000);
    store.finish();
    await settle();
    expect(store.writes).toHaveLength(2);
    expect(autosave.stats.saves).toBe(1);
  });

  it('ein Speicher, der sofort wirft, bringt das Spiel nicht zum Absturz', async () => {
    const state = createInitialState(2);
    const broken: SaveStore = {
      kind: 'indexedDb',
      load: () => Promise.resolve(undefined),
      saveBackup: () => Promise.resolve(),
      loadBackups: () => Promise.resolve([]),
      save: () => {
        throw new Error('kaputt');
      },
    };
    const autosave = new Autosave(broken, () => state);
    autosave.update(0);
    state.tick = 1;
    expect(() => {
      autosave.update(MINUTE);
    }).not.toThrow();
    await settle();
    expect(autosave.stats.failures).toBe(1);
  });
});

describe('Speichern beim Verlassen der Seite', () => {
  it('speichert, wenn die Seite versteckt wird oder schließt – nicht, wenn sie wieder sichtbar wird', async () => {
    const { state, autosave, store } = setup();
    autosave.update(0);
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' }) as unknown as Document;
    const win = new EventTarget() as unknown as Window;
    const stop = saveWhenLeaving(autosave, () => undefined, doc, win);

    state.tick = 7;
    (doc as unknown as { visibilityState: string }).visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(store.writes).toBe(0);

    (doc as unknown as { visibilityState: string }).visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(store.writes).toBe(1);

    state.tick = 9;
    win.dispatchEvent(new Event('pagehide'));
    await settle();
    expect(store.writes).toBe(2);

    stop();
    state.tick = 12;
    win.dispatchEvent(new Event('pagehide'));
    await settle();
    expect(store.writes).toBe(2);
  });
});

describe('Autosave: ein Schreibvorgang, der misslingt, vergisst den Import nicht (N5)', () => {
  it('ein wartendes saveNow wird nach der Pause nachgeholt', async () => {
    const state = createInitialState(2);
    const store = new SlowStore();
    const autosave = new Autosave(store, () => state);
    autosave.update(0);
    state.revision += 1;
    autosave.update(100);
    expect(store.writes).toHaveLength(1);
    // The village of an imported file is waiting while this write fails.
    state.inventory['coins'] = 4242;
    autosave.rebase(150);
    const done = autosave.saveNow();
    store.fail();
    await done;
    expect(autosave.stats.failures).toBe(1);
    // Nothing is written during the pause …
    autosave.update(5_000);
    await settle();
    expect(store.writes).toHaveLength(1);
    // … and after it the import is written although nothing else changed.
    autosave.update(100 + 60_000 + 1);
    expect(store.writes).toHaveLength(2);
    store.finish();
    await settle();
    expect((store.writes[1] as { inventory: Record<string, number> }).inventory['coins']).toBe(4242);
    expect(autosave.stats.saves).toBe(1);
    autosave.update(200_000);
    await settle();
    expect(store.writes).toHaveLength(2);
  });
});

describe('Autosave: ein anderes Fenster hat übernommen (N1, N4)', () => {
  function lostStore(): SaveStore & { writes: number } {
    const store = {
      kind: 'indexedDb' as const,
      writes: 0,
      load: () => Promise.resolve(undefined),
      saveBackup: () => Promise.resolve(),
      loadBackups: () => Promise.resolve([] as unknown[]),
      save: () => {
        store.writes += 1;
        return Promise.reject(new OwnerLostError());
      },
    };
    return store;
  }

  it('beim ersten Abbruch wegen eines fremden Besitzers ist Schluss: kein zweiter Versuch, nie wieder ein Schreibvorgang', async () => {
    const state = createInitialState(2);
    const store = lostStore();
    const autosave = new Autosave(store, () => state);
    autosave.update(0);
    state.revision += 1;
    autosave.update(100);
    await settle();
    expect(store.writes).toBe(1);
    expect(autosave.isLost).toBe(true);
    expect(autosave.stats.failures).toBe(0);
    for (let now = 1000; now < 300_000; now += 5000) {
      state.tick += 50;
      state.revision += 1;
      autosave.update(now);
    }
    await autosave.flush();
    await autosave.saveNow();
    await settle();
    expect(store.writes).toBe(1);
  });

  it('markLost (die Web Lock wurde übernommen) schaltet den Autosave ab, ohne noch einmal zu schreiben', async () => {
    const { state, autosave, store } = setup();
    autosave.update(0);
    autosave.markLost();
    expect(autosave.isLost).toBe(true);
    state.revision += 1;
    state.tick += 100;
    autosave.update(100);
    await autosave.flush();
    await autosave.saveNow();
    await settle();
    expect(store.writes).toBe(0);
  });

  it('ein Schreibvorgang, der beim Übernehmen läuft, zieht keinen Nachschlag mehr nach', async () => {
    const state = createInitialState(2);
    const store = new SlowStore();
    const autosave = new Autosave(store, () => state);
    autosave.update(0);
    state.revision += 1;
    autosave.update(100);
    state.revision += 1;
    autosave.update(200);
    autosave.markLost();
    store.finish();
    await settle();
    expect(store.writes).toHaveLength(1);
  });

  it('prepare läuft vor dem Speichern: ein Befehl, dessen Tick nicht mehr kam, ist im gespeicherten Stand', async () => {
    const state = createInitialState(2);
    const store = new MemoryStore();
    const autosave = new Autosave(store, () => state);
    autosave.update(0);
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' }) as unknown as Document;
    const win = new EventTarget() as unknown as Window;
    // The command is "applied" by the prepare step (in the game: `simulation.applyPending()`).
    const stop = saveWhenLeaving(
      autosave,
      () => {
        state.revision += 1;
        state.inventory['coins'] = 4242;
      },
      doc,
      win,
    );
    win.dispatchEvent(new Event('pagehide'));
    await settle();
    expect(store.writes).toBe(1);
    const saved = (await store.load()) as { inventory: Record<string, number> };
    expect(saved.inventory['coins']).toBe(4242);
    stop();
  });

  it('flush beim Verlassen startet neben einem laufenden Schreibvorgang sofort einen zweiten (die Seite erlebt den Nachschlag nicht mehr)', async () => {
    const state = createInitialState(2);
    const store = new SlowStore();
    const autosave = new Autosave(store, () => state);
    autosave.update(0);
    state.revision += 1;
    autosave.update(100);
    expect(store.writes).toHaveLength(1);
    // A second building while the first write is still running, then the page is left.
    state.revision += 1;
    state.tick += 3;
    const done = autosave.flush();
    expect(store.writes).toHaveLength(2);
    expect((store.writes[1] as { revision: number }).revision).toBe(state.revision);
    store.finish();
    await done;
    await settle();
    // Nothing more to write afterwards.
    autosave.update(5000);
    await settle();
    expect(store.writes).toHaveLength(2);
    expect(autosave.stats.saves).toBe(2);
  });
});
