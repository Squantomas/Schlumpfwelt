import { MemoryStore, type SaveStore } from './saveStore';

/** The claim is one small write into a database that was just opened and read: if it needs longer, something is wrong with the storage. */
export const CLAIM_TIMEOUT_MS = 2000;

/**
 * Makes this window the one that saves (the newest window saves) – but only if the storage really works:
 * 1. only a store that shared between windows (IndexedDB) is claimed at all; a memory store neither takes the lock nor
 *    writes an owner entry (it would make the other windows' saving stop for nothing);
 * 2. the owner entry is written first (the older window can not write over the village any more, and this window reads the
 *    last village it wrote), then the Web Lock is taken (`steal`), which tells the older window at once;
 * 3. a claim that fails or takes longer than `timeoutMs` is given up (`abandonClaim`, so it does not count even if it goes
 *    through later) and the window plays on with a memory store – without taking the lock from anyone.
 */
export async function takeOverSaving(store: SaveStore, steal: () => Promise<unknown>, timeoutMs = CLAIM_TIMEOUT_MS): Promise<SaveStore> {
  if (store.kind !== 'indexedDb' || store.claim === undefined) {
    return store;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      store.claim(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('the claim took too long'));
        }, timeoutMs);
      }),
    ]);
  } catch {
    store.abandonClaim?.();
    return new MemoryStore();
  } finally {
    clearTimeout(timer);
  }
  await steal();
  return store;
}
