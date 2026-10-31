/**
 * The newest window saves the village. With the web app and a browser tab open at once, only one of them may write:
 * a window that was forgotten in the background (an old tab) must not keep the saving for ever, and the one with the
 * older state must never write over the newer progress of the other.
 *
 * Two layers, the same rule ("the newest window saves"):
 * - The **owner entry** in the database (`indexedDbStore.ts`): every window enters its own name when it opens, and
 *   every write checks in the same transaction that the name is still its own. This is what protects the data, in every
 *   browser: the window that opened first can not write after the newer one has opened and loaded.
 * - The **Web Lock** (here): the newest window takes the lock with `steal`, the old window is told at once (its request
 *   ends with an `AbortError`) and stops, instead of finding out at its next write – up to a minute later. Without Web
 *   Locks the old window finds out at its next write.
 */

/** The part of `navigator.locks` that is used (so tests can bring their own). */
export interface LockManagerLike {
  request(name: string, options: { steal: boolean }, callback: (lock: unknown) => Promise<void> | undefined): Promise<unknown>;
}

/** `granted`: this window holds the lock (the older window was told). `unsupported`: no Web Locks – the owner entry alone decides. */
export type LockResult = 'granted' | 'unsupported';

export const LOCK_NAME = `village-save${import.meta.env.BASE_URL}`;

/**
 * Takes the lock from whoever holds it. `onLost` is called when a newer window takes it from this one (once). The lock is
 * held until the page is gone.
 */
export async function acquireSaveLock(
  onLost: () => void,
  locks: LockManagerLike | undefined = typeof navigator === 'undefined' ? undefined : (navigator as { locks?: LockManagerLike }).locks,
  name = LOCK_NAME,
): Promise<LockResult> {
  if (!locks) {
    return 'unsupported';
  }
  try {
    return await new Promise<LockResult>((resolve) => {
      locks
        .request(name, { steal: true }, () => {
          resolve('granted');
          // Hold the lock until this page is gone (the promise never ends).
          return new Promise<void>(() => undefined);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') {
            // A newer window stole the lock: this one saves no more.
            onLost();
          }
          resolve('unsupported');
        });
    });
  } catch {
    return 'unsupported';
  }
}
