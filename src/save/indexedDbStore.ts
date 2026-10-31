import { BACKUP_KEYS, MemoryStore, OwnerLostError, type SaveStore } from './saveStore';

/**
 * One database per address of the game: every copy on the same origin (a copy and a test copy next to it)
 * keeps its own village. `BASE_URL` is the path the game is served under.
 */
const DB_NAME = `village-game${import.meta.env.BASE_URL}`;
const DB_VERSION = 1;
const STORE_NAME = 'saves';
const KEY = 'main';
/** Which window may write: the newest one (see `tabLock.ts`). */
const OWNER_KEY = 'owner';
/** Some browsers never answer when storing is blocked: after this long the memory store takes over (the start screen waits for it, so it is short). */
const OPEN_TIMEOUT_MS = 2000;

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

  constructor(
    private readonly db: IDBDatabase,
    /** The name of this window: the one that opened last owns the saving, an older window never overwrites its village. */
    private readonly session: string,
  ) {}

  /** Takes over the saving for this window (the newest window wins). */
  async claim(): Promise<void> {
    const transaction = this.db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(this.session, OWNER_KEY);
    await transactionDone(transaction);
  }

  async load(): Promise<unknown> {
    const transaction = this.db.transaction(STORE_NAME, 'readonly');
    const value: unknown = await requestPromise(transaction.objectStore(STORE_NAME).get(KEY));
    return value;
  }

  async save(data: unknown): Promise<void> {
    const transaction = this.db.transaction(STORE_NAME, 'readwrite');
    const objects = transaction.objectStore(STORE_NAME);
    let lost = false;
    // Check and write in one transaction: nothing can slip in between.
    const owner = objects.get(OWNER_KEY);
    owner.onsuccess = () => {
      if (owner.result === this.session) {
        objects.put(data, KEY);
      } else {
        lost = true;
        transaction.abort();
      }
    };
    try {
      await transactionDone(transaction);
    } catch (error) {
      throw lost ? new OwnerLostError() : error;
    }
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

/** A random name for this window (no wall clock needed: only "the same or not" matters). */
function newSessionId(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

/**
 * The store of the browser: IndexedDB if it works (within a short time), otherwise a memory store (quietly – the game
 * runs on, saving to a file still works). Opening takes over the saving for this window (the newest window saves) – do it
 * **before** the village is read, so the village that is read is the last one the older window wrote. Also asks the installed
 * web app for lasting storage (see {@link requestPersistentStorage}).
 */
export async function openSaveStore(): Promise<SaveStore> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const open = async (): Promise<SaveStore> => {
      const store = new IndexedDbStore(await openDatabase(), newSessionId());
      // A real read proves that this browser lets us use it (some only fail at the first transaction).
      await store.load();
      await store.claim();
      return store;
    };
    const store = await Promise.race([
      open(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error('IndexedDB did not answer'));
        }, OPEN_TIMEOUT_MS);
      }),
    ]);
    void requestPersistentStorage();
    return store;
  } catch {
    return new MemoryStore();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Asks the browser not to clear the village on its own – but only where that does not pop up a question: the installed
 * web app (Chrome grants it quietly there; Firefox asks in a dialog for a normal tab, so a tab is never asked).
 */
async function requestPersistentStorage(): Promise<void> {
  try {
    if (!window.matchMedia('(display-mode: standalone)').matches || (await navigator.storage.persisted())) {
      return;
    }
    await navigator.storage.persist();
  } catch {
    // Not supported or not allowed: nothing to do.
  }
}
