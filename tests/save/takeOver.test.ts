import { describe, expect, it } from 'vitest';
import { MemoryStore, type SaveStore } from '../../src/save/saveStore';
import { takeOverSaving } from '../../src/save/takeOver';

/** A store that says it is IndexedDB; `claim` takes `claimMs` (or fails). */
function idbStore(claimMs: number | 'fail'): SaveStore & { claimed: number; abandoned: number; claimDone: number } {
  const store = {
    kind: 'indexedDb' as const,
    claimed: 0,
    abandoned: 0,
    claimDone: 0,
    load: () => Promise.resolve(undefined),
    save: () => Promise.resolve(),
    saveBackup: () => Promise.resolve(),
    loadBackups: () => Promise.resolve([] as unknown[]),
    claim: () => {
      store.claimed += 1;
      return new Promise<void>((resolve, reject) => {
        if (claimMs === 'fail') {
          reject(new Error('Speicher kaputt'));
          return;
        }
        setTimeout(() => {
          store.claimDone += 1;
          resolve();
        }, claimMs);
      });
    },
    abandonClaim: () => {
      store.abandoned += 1;
    },
  };
  return store;
}

describe('Übernehmen nur, wenn die IndexedDB wirklich geht (B)', () => {
  it('ein Fenster mit Arbeitsspeicher-Speicher stiehlt die Sperre nicht und trägt keinen Besitzer ein', async () => {
    let stolen = 0;
    const memory = new MemoryStore();
    const result = await takeOverSaving(memory, () => {
      stolen += 1;
      return Promise.resolve();
    });
    expect(result).toBe(memory);
    expect(stolen).toBe(0);
  });

  it('eine IndexedDB, die geht: erst der Besitzer-Eintrag, dann die Sperre', async () => {
    const order: string[] = [];
    const base = idbStore(1);
    const store: SaveStore = {
      ...base,
      claim: async () => {
        await base.claim?.();
        order.push('claim');
      },
    };
    const result = await takeOverSaving(store, () => {
      order.push('steal');
      return Promise.resolve();
    });
    expect(result).toBe(store);
    expect(order).toEqual(['claim', 'steal']);
    expect(base.abandoned).toBe(0);
  });

  it('ein Besitzer-Eintrag, der misslingt: Arbeitsspeicher, die Sperre bleibt unberührt, der Eintrag wird aufgegeben', async () => {
    let stolen = 0;
    const store = idbStore('fail');
    const result = await takeOverSaving(store, () => {
      stolen += 1;
      return Promise.resolve();
    });
    expect(result.kind).toBe('memory');
    expect(stolen).toBe(0);
    expect(store.abandoned).toBe(1);
  });

  it('ein Besitzer-Eintrag, der zu lange braucht, zählt nicht – auch wenn er später durchgeht', async () => {
    let stolen = 0;
    const store = idbStore(80);
    const result = await takeOverSaving(
      store,
      () => {
        stolen += 1;
        return Promise.resolve();
      },
      20,
    );
    expect(result.kind).toBe('memory');
    expect(stolen).toBe(0);
    expect(store.abandoned).toBe(1);
    // It goes through later: the store was told to give the claim up (`abandonClaim` made before), nobody steals now.
    await new Promise((resolve) => {
      setTimeout(resolve, 120);
    });
    expect(store.claimDone).toBe(1);
    expect(stolen).toBe(0);
  });
});
