import { BACKUP_KEYS, MemoryStore, type SaveStore } from './saveStore';

const DB_NAME = 'village-game';
const DB_VERSION = 1;
const STORE_NAME = 'saves';
const KEY = 'main';
/** Some browsers never answer when storing is blocked: after this long the memory store takes over. */
const OPEN_TIMEOUT_MS = 4000;

/** Turns the callbacks of an IndexedDB request into a promise. */
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

/** Waits until a write transaction is really stored (`complete`), not just queued. */
function transactionDone(transaction: IDBTransaction): Promise<void> {
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

class IndexedDbStore implements SaveStore {
  readonly kind = 'indexedDb';

  constructor(private readonly db: IDBDatabase) {}

  async load(): Promise<unknown> {
    const transaction = this.db.transaction(STORE_NAME, 'readonly');
    const value: unknown = await requestPromise(transaction.objectStore(STORE_NAME).get(KEY));
    return value;
  }

  async save(data: unknown): Promise<void> {
    const transaction = this.db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(data, KEY);
    await transactionDone(transaction);
  }

  async saveBackup(data: unknown): Promise<void> {
    const transaction = this.db.transaction(STORE_NAME, 'readwrite');
    const objects = transaction.objectStore(STORE_NAME);
    const first = objects.get(BACKUP_KEYS[0]);
    first.onsuccess = () => {
      // The first copy stays; later ones only replace the second place.
      objects.put(data, first.result === undefined ? BACKUP_KEYS[0] : BACKUP_KEYS[1]);
    };
    await transactionDone(transaction);
  }

  async loadBackups(): Promise<unknown[]> {
    const objects = this.db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
    const found: unknown[] = [];
    for (const key of BACKUP_KEYS) {
      const value: unknown = await requestPromise(objects.get(key));
      if (value !== undefined) {
        found.push(value);
      }
    }
    return found;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    // Reading `indexedDB` can already throw (storage blocked): the caller falls back to memory.
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
 * The store of the browser: IndexedDB if it works, otherwise a memory store
 * (quietly – the game runs on, saving to a file still works). Also asks the
 * browser not to clear the data on its own (best effort, no question is shown
 * for it in most browsers).
 */
export async function openSaveStore(): Promise<SaveStore> {
  try {
    const opened = await Promise.race([
      openDatabase(),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error('IndexedDB did not answer'));
        }, OPEN_TIMEOUT_MS);
      }),
    ]);
    const store = new IndexedDbStore(opened);
    // A real read proves that this browser lets us use it (some only fail at the first transaction).
    await store.load();
    void requestPersistentStorage();
    return store;
  } catch {
    return new MemoryStore();
  }
}

async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage.persist();
  } catch {
    // Not supported or not allowed: nothing to do.
  }
}
