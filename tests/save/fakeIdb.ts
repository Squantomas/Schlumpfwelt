/**
 * A very small stand-in for IndexedDB (no new dependency): one object store in a `Map`, transactions that run **one after
 * the other** in the order they were created (like real readwrite transactions on one store), requests that are answered
 * later (so code between the requests can interleave with other windows), and a transaction that completes when no request
 * is waiting any more. Only what `IndexedDbStore` uses: `get`, `put`, `delete`, `getAllKeys`.
 */

class FakeRequest<T> {
  result: T | undefined;
  error: DOMException | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

class FakeTransaction {
  error: DOMException | null = null;
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private readonly queue: (() => void)[] = [];

  constructor(private readonly db: FakeIdb) {
    db.enqueue(this);
  }

  objectStore(): FakeObjectStore {
    return new FakeObjectStore(this, this.db.data);
  }

  /** Called by the store: a request to be answered when this transaction runs. */
  add(operation: () => void): void {
    this.queue.push(operation);
  }

  async run(latencyMs: number): Promise<void> {
    const wait = (): Promise<void> =>
      new Promise((resolve) => {
        setTimeout(resolve, latencyMs);
      });
    await wait();
    while (this.queue.length > 0) {
      this.queue.shift()?.();
      // Lets the code that answers the request (promise continuations) issue the next requests.
      await wait();
    }
    this.oncomplete?.();
  }
}

class FakeObjectStore {
  constructor(
    private readonly transaction: FakeTransaction,
    private readonly data: Map<string, unknown>,
  ) {}

  private request<T>(compute: () => T): FakeRequest<T> {
    const request = new FakeRequest<T>();
    this.transaction.add(() => {
      request.result = compute();
      request.onsuccess?.();
    });
    return request;
  }

  get(key: string): FakeRequest<unknown> {
    return this.request(() => this.data.get(key));
  }

  put(value: unknown, key: string): FakeRequest<string> {
    return this.request(() => {
      this.data.set(key, structuredClone(value));
      return key;
    });
  }

  delete(key: string): FakeRequest<undefined> {
    return this.request(() => {
      this.data.delete(key);
      return undefined;
    });
  }

  getAllKeys(): FakeRequest<string[]> {
    return this.request(() => [...this.data.keys()]);
  }
}

export class FakeIdb {
  readonly data = new Map<string, unknown>();
  /** How long every request takes (ms). */
  latencyMs = 0;
  private tail: Promise<void> = Promise.resolve();

  /** Used as `IDBDatabase` by the store. */
  asDatabase(): IDBDatabase {
    return this as unknown as IDBDatabase;
  }

  transaction(_storeName: string, _mode: string): FakeTransaction {
    return new FakeTransaction(this);
  }

  enqueue(transaction: FakeTransaction): void {
    this.tail = this.tail.then(() => transaction.run(this.latencyMs));
  }
}
