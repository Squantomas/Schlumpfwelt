/**
 * Only one window may save the village: with the web app and a browser tab open at once, the one with the older
 * state would write over the progress of the other when it closes. A Web Lock (held until the page is gone) says
 * who saves; the second window plays on without saving and says so.
 */

/** The part of `navigator.locks` that is used (so tests can bring their own). */
export interface LockManagerLike {
  request(name: string, options: { ifAvailable: boolean }, callback: (lock: unknown) => Promise<void> | undefined): Promise<unknown>;
}

/**
 * - `granted`: this window saves.
 * - `taken`: another window already has the lock – this one does not save.
 * - `unsupported`: no Web Locks in this browser (the store then lets the newest window save).
 */
export type LockResult = 'granted' | 'taken' | 'unsupported';

export const LOCK_NAME = `village-save${import.meta.env.BASE_URL}`;

/**
 * Tries to take the lock. A window that is being replaced by a reload may still hold it for a moment, so a "taken"
 * is asked again a few times (`tries` × `waitMs`) before it counts.
 */
export async function acquireSaveLock(
  locks: LockManagerLike | undefined = typeof navigator === 'undefined' ? undefined : (navigator as { locks?: LockManagerLike }).locks,
  name = LOCK_NAME,
  tries = 3,
  waitMs = 150,
): Promise<LockResult> {
  if (!locks) {
    return 'unsupported';
  }
  for (let attempt = 0; attempt < tries; attempt += 1) {
    try {
      const granted = await new Promise<boolean>((resolve, reject) => {
        locks
          .request(name, { ifAvailable: true }, (lock) => {
            resolve(lock !== null);
            // Hold the lock until this page is gone (the promise never ends).
            return lock === null ? undefined : new Promise<void>(() => undefined);
          })
          .catch(reject);
      });
      if (granted) {
        return 'granted';
      }
    } catch {
      return 'unsupported';
    }
    if (attempt + 1 < tries) {
      await new Promise((resolve) => {
        setTimeout(resolve, waitMs);
      });
    }
  }
  return 'taken';
}
