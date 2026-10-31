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
  /**
   * Keeps a copy of data that could not be read, before it is replaced: the first one stays for good (`backup`), later
   * ones go to a second place that is overwritten (`backup-latest`) – at most two copies, so a bug in a future
   * migration never costs a village. Rejects if the copy could not be written.
   */
  saveBackup(data: unknown): Promise<void>;
  /**
   * Only for stores that several windows share (IndexedDB): makes this window the owner – the newest window saves – and
   * keeps the village as it is. Rejects if that did not work.
   */
  claim?(): Promise<void>;
  /** The claim took too long: the window plays without saving and must not stay the owner, even if the claim goes through later. */
  abandonClaim?(): void;
  /** The copies made by {@link SaveStore.saveBackup}, first the one that stays (for tests and for rescuing by hand). */
  loadBackups(): Promise<unknown[]>;
}

/** The two places of the copies. */
export const BACKUP_KEYS = ['backup', 'backup-latest'] as const;

/** A store that keeps the data in memory only: for tests, and as the quiet fallback when IndexedDB is not available. */
export class MemoryStore implements SaveStore {
  readonly kind = 'memory';
  private data: unknown;
  private readonly backups = new Map<string, unknown>();
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

  saveBackup(data: unknown): Promise<void> {
    this.backups.set(this.backups.has('backup') ? 'backup-latest' : 'backup', structuredClone(data));
    return Promise.resolve();
  }

  loadBackups(): Promise<unknown[]> {
    return Promise.resolve(BACKUP_KEYS.filter((key) => this.backups.has(key)).map((key) => structuredClone(this.backups.get(key))));
  }
}

/**
 * Thrown by `save` when another window has taken over the saving (the newest window saves, see `tabLock.ts`): this
 * window has to stop writing for good – what it holds may be older than what the other window saved.
 */
export class OwnerLostError extends Error {
  constructor() {
    super('another window saves now');
    this.name = 'OwnerLostError';
  }
}
