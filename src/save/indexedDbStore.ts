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
/** The village of one window is stored under this prefix plus the name of the window. */
const DATA_PREFIX = 'data:';
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

/**
 * Where the village lives: **one key per window** (`data:<window>`) and an `owner` entry that names the newest window.
 * Why not one key `main` with a check "am I still the owner?" before every write: that check is a read whose answer has to
 * come back to the page before the write can be issued – a page that is closed hard in between loses its last write
 * (the page is busy drawing, answers take a while). Writing to the own key needs no answer: the write is queued in one go
 * and the browser completes it even when the page is gone. The check still happens, but afterwards (see `save`).
 *
 * - `load` reads the village of the owner (or the old single key `main`, which tests and old versions wrote).
 * - `claim` makes this window the owner and copies the village of the former owner into its own key, tidying up old keys in the same transaction.
 * - `save` writes the own key; if the owner is someone else by then, it says so (`OwnerLostError`) – what it wrote is in
 *   the own key, where nobody reads it, so a window that was taken over can never write over the newer village.
 */
export class IndexedDbStore implements SaveStore {
  readonly kind = 'indexedDb';
  private readonly dataKey: string;
  private abandoned = false;
  private claimed: { readonly previousOwner: unknown } | undefined;

  constructor(
    private readonly db: IDBDatabase,
    /** The name of this window: the one that opened last owns the saving, an older window never overwrites its village. */
    private readonly session: string,
  ) {
    this.dataKey = `${DATA_PREFIX}${session}`;
  }

  /** The village of the current owner (or of the old key), read inside an open transaction. */
  private async current(objects: IDBObjectStore): Promise<{ readonly owner: unknown; readonly data: unknown }> {
    const owner: unknown = await requestPromise(objects.get(OWNER_KEY));
    if (typeof owner === 'string') {
      const data: unknown = await requestPromise(objects.get(`${DATA_PREFIX}${owner}`));
      if (data !== undefined) {
        return { owner, data };
      }
    }
    const legacy: unknown = await requestPromise(objects.get(KEY));
    return { owner, data: legacy };
  }

  /**
   * Takes over the saving for this window (the newest window wins) and keeps the village as it is – **all in one
   * transaction**: copy the village of the former owner into the own key, name this window the owner, and only then
   * remove the villages of earlier windows (and the old single key). Nothing is deleted unless the copy and the owner
   * entry are written in the same step, so two windows that claim at nearly the same time (the transactions run one
   * after the other) always leave exactly one readable village with the owner.
   */
  async claim(): Promise<void> {
    const transaction = this.db.transaction(STORE_NAME, 'readwrite');
    const objects = transaction.objectStore(STORE_NAME);
    const { owner, data } = await this.current(objects);
    objects.put(this.session, OWNER_KEY);
    if (data !== undefined) {
      objects.put(data, this.dataKey);
    }
    const keys = await requestPromise(objects.getAllKeys());
    for (const key of keys) {
      if (key === KEY || (typeof key === 'string' && key.startsWith(DATA_PREFIX) && key !== this.dataKey)) {
        objects.delete(key);
      }
    }
    await transactionDone(transaction);
    this.claimed = { previousOwner: owner };
    if (this.abandoned) {
      await this.restore();
    }
  }

  /** The claim took too long and the window plays without saving: it must not stay the owner (nobody else could save then). */
  abandonClaim(): void {
    this.abandoned = true;
    if (this.claimed) {
      void this.restore().catch(() => undefined);
    }
  }

  /**
   * Gives the saving back to the former owner, again in one transaction and with the same rule: the own key (which holds
   * the village) is deleted only after the village is written to where the former owner is read from – unless that key
   * still has a village (the former window may have written on), which then stays as it is. If another window has
   * claimed in the meantime it is the owner, and only this window's own key is removed.
   */
  private async restore(): Promise<void> {
    const previous = this.claimed?.previousOwner;
    const transaction = this.db.transaction(STORE_NAME, 'readwrite');
    const objects = transaction.objectStore(STORE_NAME);
    const owner: unknown = await requestPromise(objects.get(OWNER_KEY));
    if (owner === this.session) {
      const mine: unknown = await requestPromise(objects.get(this.dataKey));
      const target = typeof previous === 'string' ? `${DATA_PREFIX}${previous}` : KEY;
      const existing: unknown = await requestPromise(objects.get(target));
      if (existing === undefined && mine !== undefined) {
        objects.put(mine, target);
      }
      if (typeof previous === 'string') {
        objects.put(previous, OWNER_KEY);
      } else {
        objects.delete(OWNER_KEY);
      }
    }
    objects.delete(this.dataKey);
    await transactionDone(transaction);
  }

  async load(): Promise<unknown> {
    const transaction = this.db.transaction(STORE_NAME, 'readonly');
    const { data } = await this.current(transaction.objectStore(STORE_NAME));
    return data;
  }

  async save(data: unknown): Promise<void> {
    const transaction = this.db.transaction(STORE_NAME, 'readwrite');
    const objects = transaction.objectStore(STORE_NAME);
    // Both requests are issued at once: nothing has to come back to the page before the write is queued.
    objects.put(data, this.dataKey);
    const owner = objects.get(OWNER_KEY);
    let lost = false;
    owner.onsuccess = () => {
      lost = owner.result !== this.session;
    };
    // Say "that was everything" at once (where the browser knows `commit`): the transaction does not wait for the page to come back, so a page that is closed now still gets it written.
    transaction.commit?.();
    await transactionDone(transaction);
    if (lost) {
      throw new OwnerLostError();
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
 * runs on, saving to a file still works). Opening does not yet take over the saving: only a store that works is worth taking
 * over for (see `takeOver.ts`). Also asks the installed web app for lasting storage (see {@link requestPersistentStorage}).
 */
export async function openSaveStore(): Promise<SaveStore> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const open = async (): Promise<SaveStore> => {
      const store = new IndexedDbStore(await openDatabase(), newSessionId());
      // A real read proves that this browser lets us use it (some only fail at the first transaction).
      await store.load();
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
