import { describe, expect, it } from 'vitest';
import { acquireSaveLock, type LockManagerLike } from '../../src/save/tabLock';

/** A tiny Web Locks with `steal`: a new request takes the lock, the request of the old holder ends with an `AbortError`. */
function fakeLocks(): LockManagerLike & { holders: Map<string, (error: Error) => void> } {
  const holders = new Map<string, (error: Error) => void>();
  return {
    holders,
    request: (name, _options, callback) =>
      new Promise((_resolve, reject) => {
        holders.get(name)?.(new DOMException('stolen', 'AbortError'));
        holders.set(name, reject);
        // The holder's promise never ends (the lock is held until the page is gone).
        void callback({ name });
      }),
  };
}

describe('Das neueste Fenster speichert (N1)', () => {
  it('das erste Fenster bekommt die Sperre', async () => {
    const locks = fakeLocks();
    let lost = 0;
    expect(await acquireSaveLock(() => (lost += 1), locks, 'test')).toBe('granted');
    expect(lost).toBe(0);
  });

  it('ein neues Fenster übernimmt mit steal; das alte wird sofort benachrichtigt – genau einmal', async () => {
    const locks = fakeLocks();
    let lostA = 0;
    let lostB = 0;
    await acquireSaveLock(() => (lostA += 1), locks, 'test');
    expect(await acquireSaveLock(() => (lostB += 1), locks, 'test')).toBe('granted');
    await Promise.resolve();
    await Promise.resolve();
    expect(lostA).toBe(1);
    expect(lostB).toBe(0);
    // A third window takes over from the second.
    await acquireSaveLock(() => undefined, locks, 'test');
    await Promise.resolve();
    await Promise.resolve();
    expect(lostB).toBe(1);
    expect(lostA).toBe(1);
  });

  it('andere Namen sperren sich nicht gegenseitig (zwei Kopien des Spiels)', async () => {
    const locks = fakeLocks();
    let lost = 0;
    await acquireSaveLock(() => (lost += 1), locks, 'village-save/eins/');
    await acquireSaveLock(() => undefined, locks, 'village-save/zwei/');
    await Promise.resolve();
    expect(lost).toBe(0);
  });

  it('ohne Web Locks oder bei einem Fehler: „nicht unterstützt“ – dann entscheidet der Eintrag in der Datenbank', async () => {
    expect(await acquireSaveLock(() => undefined, undefined, 'test')).toBe('unsupported');
    const broken: LockManagerLike = { request: () => Promise.reject(new Error('gesperrt')) };
    let lost = 0;
    expect(await acquireSaveLock(() => (lost += 1), broken, 'test')).toBe('unsupported');
    expect(lost).toBe(0);
  });
});
