/**
 * Where the village is kept between visits. The game only knows this small
 * interface: IndexedDB in the browser (`indexedDbStore.ts`), plain memory for
 * tests and for browsers that do not allow storing (private windows).
 */

export interface SaveStore {
  /** `indexedDb`: kept between visits. `memory`: gone when the page closes (nothing to rely on). */
  readonly kind: 'indexedDb' | 'memory';
  /** The saved data (as stored, not checked), or `undefined` if nothing was saved yet. Rejects if the store can not be read. */
  load(): Promise<unknown>;
  /** Replaces the saved data. Rejects if it could not be written. */
  save(data: unknown): Promise<void>;
}

/** A store that keeps the data in memory only: for tests, and as the quiet fallback when IndexedDB is not available. */
export class MemoryStore implements SaveStore {
  readonly kind = 'memory';
  private data: unknown;
  /** How often `save` was called (for tests). */
  writes = 0;

  constructor(initial?: unknown) {
    this.data = initial === undefined ? undefined : structuredClone(initial);
  }

  load(): Promise<unknown> {
    return Promise.resolve(this.data === undefined ? undefined : structuredClone(this.data));
  }

  save(data: unknown): Promise<void> {
    this.data = structuredClone(data);
    this.writes += 1;
    return Promise.resolve();
  }
}
