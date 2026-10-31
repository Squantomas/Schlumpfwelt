import { describe, expect, it } from 'vitest';
import { acquireSaveLock, type LockManagerLike } from '../../src/save/tabLock';

/** A tiny Web Locks: `ifAvailable` gives the lock to the first, `null` to the others; the lock is held until `release`. */
function fakeLocks(): LockManagerLike & { held: Set<string>; release: (name: string) => void; calls: number } {
  const held = new Set<string>();
  const api = {
    held,
    calls: 0,
    release: (name: string) => held.delete(name),
    request: (name: string, _options: { ifAvailable: boolean }, callback: (lock: unknown) => Promise<void> | undefined) => {
      api.calls += 1;
      if (held.has(name)) {
        void callback(null);
        return Promise.resolve();
      }
      held.add(name);
      return callback({ name }) ?? Promise.resolve();
    },
  };
  return api;
}

describe('Ein Fenster speichert (R2)', () => {
  it('das erste Fenster bekommt die Sperre, das zweite nicht', async () => {
    const locks = fakeLocks();
    expect(await acquireSaveLock(locks, 'test', 2, 1)).toBe('granted');
    expect(await acquireSaveLock(locks, 'test', 2, 1)).toBe('taken');
    expect(locks.calls).toBe(3);
  });

  it('ein Fenster, das gerade neu lädt, gibt die Sperre gleich frei: der Neustart bekommt sie noch', async () => {
    const locks = fakeLocks();
    await acquireSaveLock(locks, 'test', 1, 1);
    setTimeout(() => {
      locks.release('test');
    }, 20);
    expect(await acquireSaveLock(locks, 'test', 5, 15)).toBe('granted');
  });

  it('andere Namen sperren sich nicht gegenseitig (zwei Kopien des Spiels)', async () => {
    const locks = fakeLocks();
    expect(await acquireSaveLock(locks, 'village-save/Schlumpfwelt/', 1, 1)).toBe('granted');
    expect(await acquireSaveLock(locks, 'village-save/anderes/', 1, 1)).toBe('granted');
  });

  it('ohne Web Locks oder bei einem Fehler: „nicht unterstützt“, das Spiel läuft trotzdem', async () => {
    expect(await acquireSaveLock(undefined, 'test', 1, 1)).toBe('unsupported');
    const broken: LockManagerLike = { request: () => Promise.reject(new Error('gesperrt')) };
    expect(await acquireSaveLock(broken, 'test', 1, 1)).toBe('unsupported');
  });
});
