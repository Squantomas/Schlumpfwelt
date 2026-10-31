import { describe, expect, it } from 'vitest';
import { Autosave } from '../../src/save/autosave';
import { saveWhenLeaving } from '../../src/save/lifecycle';
import { MemoryStore, type SaveStore } from '../../src/save/saveStore';
import { fromSaveData } from '../../src/sim/saveData';
import { createInitialState, type SimState } from '../../src/sim/state';

const MINUTE = 60_000;

/** A store whose writes the test finishes (or fails) by hand. */
class SlowStore implements SaveStore {
  readonly kind = 'memory';
  writes: unknown[] = [];
  failing = false;
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

  it('speichert eine Weile nach einer Bauaktion, nicht bei jedem Bild', async () => {
    const { state, autosave, store } = setup();
    autosave.update(0);
    state.revision += 1;
    autosave.update(100);
    autosave.update(900);
    await settle();
    expect(store.writes).toBe(0);
    // Another change keeps postponing it …
    state.revision += 1;
    autosave.update(1500);
    autosave.update(2900);
    await settle();
    expect(store.writes).toBe(0);
    // … until it was quiet long enough.
    autosave.update(3100);
    await settle();
    expect(store.writes).toBe(1);
    autosave.update(3200);
    await settle();
    expect(store.writes).toBe(1);
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
    const stop = saveWhenLeaving(autosave, doc, win);

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
