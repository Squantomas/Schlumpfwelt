/**
 * Where the parents' settings are kept (M8): one entry in a database of its own – apart from the village, so that
 * saving the village to a file, loading one, or a window taking over the village never touches the PIN or the limit.
 * The game only knows this small interface; tests use {@link MemorySettingsStore}.
 */
export interface SettingsStore {
  /** `indexedDb`: kept between visits. `memory`: only for this visit (the browser does not let us store anything). */
  readonly kind: 'indexedDb' | 'memory';
  /** The stored entry (not checked), `undefined` if there is none. Rejects if it can not be read. */
  load(): Promise<unknown>;
  /** Replaces the entry. Rejects if it could not be written. */
  save(data: unknown): Promise<void>;
}

export class MemorySettingsStore implements SettingsStore {
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

/** One database per address of the game (like the village, see `indexedDbStore.ts`). */
const DB_NAME = `village-settings${import.meta.env.BASE_URL}`;
const DB_VERSION = 1;
const STORE_NAME = 'settings';
const KEY = 'parent';
/** Some browsers never answer when storing is blocked: after this long the memory store takes over. */
const OPEN_TIMEOUT_MS = 2000;

function requestPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    };
  });
}

export class IndexedDbSettingsStore implements SettingsStore {
  readonly kind = 'indexedDb';

  constructor(private readonly db: IDBDatabase) {}

  load(): Promise<unknown> {
    return requestPromise(this.db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY));
  }

  save(data: unknown): Promise<void> {
    const transaction = this.db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(data, KEY);
    // Queued in one go and committed at once: a page that is closed right now still gets it written.
    transaction.commit?.();
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        resolve();
      };
      transaction.onerror = () => {
        reject(transaction.error ?? new Error('IndexedDB transaction failed'));
      };
      transaction.onabort = () => {
        reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
      };
    });
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error('IndexedDB could not be opened'));
    };
    request.onblocked = () => {
      reject(new Error('IndexedDB is blocked'));
    };
  });
}

/**
 * The settings store of the browser: IndexedDB if it works (opened and read within a short time), otherwise – quietly
 * – memory: the settings then hold for this visit only (the parents' menu says so once).
 */
export async function openSettingsStore(): Promise<SettingsStore> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const open = async (): Promise<SettingsStore> => {
      const store = new IndexedDbSettingsStore(await openDatabase());
      await store.load();
      return store;
    };
    return await Promise.race([
      open(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('IndexedDB did not answer'));
        }, OPEN_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return new MemorySettingsStore();
  } finally {
    clearTimeout(timer);
  }
}
