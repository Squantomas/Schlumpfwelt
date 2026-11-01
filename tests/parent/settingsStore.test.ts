import { describe, expect, it } from 'vitest';
import { IndexedDbSettingsStore, MemorySettingsStore } from '../../src/parent/settingsStore';
import { FakeIdb } from '../save/fakeIdb';

describe('Speicher der Einstellungen (M8)', () => {
  it('im Arbeitsspeicher: leer, dann was zuletzt geschrieben wurde (als Kopie)', async () => {
    const store = new MemorySettingsStore();
    expect(store.kind).toBe('memory');
    expect(await store.load()).toBeUndefined();
    const data = { limit: 30 };
    await store.save(data);
    data.limit = 60;
    expect(await store.load()).toEqual({ limit: 30 });
    expect(store.writes).toBe(1);
  });

  it('in der IndexedDB: ein eigener Eintrag, nichts anderes wird angefasst', async () => {
    const db = new FakeIdb();
    db.data.set('main', 'village');
    const store = new IndexedDbSettingsStore(db.asDatabase());
    expect(store.kind).toBe('indexedDb');
    expect(await store.load()).toBeUndefined();
    await store.save({ limit: 15 });
    await store.save({ limit: 45 });
    expect(await store.load()).toEqual({ limit: 45 });
    expect([...db.data.keys()].sort()).toEqual(['main', 'parent']);
    expect(db.data.get('main')).toBe('village');
  });
});
