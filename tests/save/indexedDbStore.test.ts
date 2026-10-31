import { describe, expect, it } from 'vitest';
import { IndexedDbStore } from '../../src/save/indexedDbStore';
import { MemoryStore, OwnerLostError } from '../../src/save/saveStore';
import { takeOverSaving } from '../../src/save/takeOver';
import { FakeIdb } from './fakeIdb';

const village = (name: string): { name: string; tick: number } => ({ name, tick: 100 });

/** Lets everything that is still running (transactions, restore after an abandoned claim) finish. */
async function settle(db: FakeIdb): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 60 * Math.max(1, db.latencyMs));
  });
}

function open(db: FakeIdb, session: string): IndexedDbStore {
  return new IndexedDbStore(db.asDatabase(), session);
}

/** The rule of the store: if there is an owner, its village can be read – exactly one readable village, at the owner. */
function expectOneReadableVillage(db: FakeIdb, expectedVillage: unknown): void {
  const owner = db.data.get('owner');
  expect(typeof owner).toBe('string');
  const keys = [...db.data.keys()].filter((key) => key.startsWith('data:'));
  expect(keys).toEqual([`data:${String(owner)}`]);
  expect(db.data.get(`data:${String(owner)}`)).toEqual(expectedVillage);
  expect(db.data.has('main')).toBe(false);
}

describe('IndexedDbStore: lesen, übernehmen, schreiben', () => {
  it('ein leerer Speicher: nichts zu lesen; nach dem Übernehmen schreibt und liest das Fenster sein Dorf', async () => {
    const db = new FakeIdb();
    const a = open(db, 'A');
    expect(await a.load()).toBeUndefined();
    await a.claim();
    await a.save(village('a'));
    expect(await a.load()).toEqual(village('a'));
    expect(db.data.get('owner')).toBe('A');
  });

  it('Übernehmen kopiert das Dorf des bisherigen Besitzers; das alte Fenster kann danach nichts Neueres überschreiben', async () => {
    const db = new FakeIdb();
    const a = open(db, 'A');
    await a.claim();
    await a.save(village('von A'));
    const b = open(db, 'B');
    await b.claim();
    expect(await b.load()).toEqual(village('von A'));
    expectOneReadableVillage(db, village('von A'));
    await b.save(village('neuer von B'));
    // The old window writes (it does not know yet) – it is told, and nobody reads what it wrote.
    await expect(a.save(village('altes A'))).rejects.toBeInstanceOf(OwnerLostError);
    expect(await open(db, 'C').load()).toEqual(village('neuer von B'));
  });

  it('der alte Einzelschlüssel „main“ wird gelesen und beim Übernehmen kopiert und entfernt', async () => {
    const db = new FakeIdb();
    db.data.set('main', village('alt'));
    const a = open(db, 'A');
    expect(await a.load()).toEqual(village('alt'));
    await a.claim();
    expectOneReadableVillage(db, village('alt'));
  });

  it('ein Besitzer ohne Dorf: gelesen wird dann der alte Schlüssel', async () => {
    const db = new FakeIdb();
    db.data.set('owner', 'X');
    db.data.set('main', village('main'));
    expect(await open(db, 'A').load()).toEqual(village('main'));
  });
});

describe('W1: zwei Fenster übernehmen fast gleichzeitig', () => {
  it.each([0, 1, 3])('mit %i ms je Schritt bleibt genau ein lesbares Dorf beim Besitzer – das Dorf geht nicht verloren', async (latency) => {
    const db = new FakeIdb();
    db.latencyMs = latency;
    db.data.set('owner', 'A');
    db.data.set('data:A', village('das Dorf'));
    const b = open(db, 'B');
    const c = open(db, 'C');
    await Promise.all([b.claim(), c.claim()]);
    await settle(db);
    expectOneReadableVillage(db, village('das Dorf'));
    expect(await open(db, 'D').load()).toEqual(village('das Dorf'));
  });

  it('auch drei Fenster zugleich, und danach schreibt nur noch der Besitzer in das gelesene Dorf', async () => {
    const db = new FakeIdb();
    db.latencyMs = 1;
    db.data.set('owner', 'A');
    db.data.set('data:A', village('das Dorf'));
    const windows = ['B', 'C', 'D'].map((name) => open(db, name));
    await Promise.all(windows.map((w) => w.claim()));
    await settle(db);
    expectOneReadableVillage(db, village('das Dorf'));
    const ownerName = String(db.data.get('owner'));
    const owner = windows[['B', 'C', 'D'].indexOf(ownerName)];
    await owner?.save(village('weitergespielt'));
    expect(await open(db, 'E').load()).toEqual(village('weitergespielt'));
  });
});

describe('W2: Übernehmen fertig, dann wird es aufgegeben', () => {
  it('der frühere Besitzer bekommt sein Dorf zurück, der eigene Schlüssel verschwindet', async () => {
    const db = new FakeIdb();
    db.data.set('owner', 'A');
    db.data.set('data:A', village('das Dorf'));
    const b = open(db, 'B');
    await b.claim();
    expect(db.data.has('data:A')).toBe(false);
    b.abandonClaim();
    await settle(db);
    expect(db.data.get('owner')).toBe('A');
    expectOneReadableVillage(db, village('das Dorf'));
  });

  it('ein Abbruch, während das Übernehmen noch läuft, stellt es danach wieder her', async () => {
    const db = new FakeIdb();
    db.latencyMs = 3;
    db.data.set('owner', 'A');
    db.data.set('data:A', village('das Dorf'));
    const b = open(db, 'B');
    const claim = b.claim();
    b.abandonClaim();
    await claim;
    await settle(db);
    expect(db.data.get('owner')).toBe('A');
    expectOneReadableVillage(db, village('das Dorf'));
  });

  it('über takeOverSaving: das Übernehmen dauert zu lange, das Fenster spielt mit Arbeitsspeicher, später ist der Besitzer wieder der alte', async () => {
    const db = new FakeIdb();
    db.latencyMs = 6;
    db.data.set('owner', 'A');
    db.data.set('data:A', village('das Dorf'));
    let stolen = 0;
    const result = await takeOverSaving(
      open(db, 'B'),
      () => {
        stolen += 1;
        return Promise.resolve();
      },
      15,
    );
    expect(result).toBeInstanceOf(MemoryStore);
    expect(stolen).toBe(0);
    await settle(db);
    await settle(db);
    expect(db.data.get('owner')).toBe('A');
    expectOneReadableVillage(db, village('das Dorf'));
  });

  it('hat inzwischen ein anderes Fenster übernommen, bleibt es Besitzer; nur der eigene Schlüssel geht', async () => {
    const db = new FakeIdb();
    db.data.set('owner', 'A');
    db.data.set('data:A', village('das Dorf'));
    const b = open(db, 'B');
    await b.claim();
    const c = open(db, 'C');
    await c.claim();
    await c.save(village('von C'));
    b.abandonClaim();
    await settle(db);
    expect(db.data.get('owner')).toBe('C');
    expectOneReadableVillage(db, village('von C'));
  });

  it('der frühere Besitzer hat nach dem Übernehmen noch weitergeschrieben: sein neuerer Stand bleibt', async () => {
    const db = new FakeIdb();
    db.data.set('owner', 'A');
    db.data.set('data:A', village('alt'));
    const a = open(db, 'A');
    const b = open(db, 'B');
    await b.claim();
    await expect(a.save(village('A war weiter'))).rejects.toBeInstanceOf(OwnerLostError);
    b.abandonClaim();
    await settle(db);
    expect(db.data.get('owner')).toBe('A');
    expectOneReadableVillage(db, village('A war weiter'));
  });

  it('beim alten Einzelschlüssel: aufgeben schreibt das Dorf wieder nach „main“ und entfernt den Besitzer', async () => {
    const db = new FakeIdb();
    db.data.set('main', village('alt'));
    const b = open(db, 'B');
    await b.claim();
    b.abandonClaim();
    await settle(db);
    expect(db.data.has('owner')).toBe(false);
    expect([...db.data.keys()]).toEqual(['main']);
    expect(db.data.get('main')).toEqual(village('alt'));
  });
});
