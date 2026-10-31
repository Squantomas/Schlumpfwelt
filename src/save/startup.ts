import type { TextKey } from '../data/texts';
import { fromSaveData } from '../sim/saveData';
import { createInitialState, type SimState } from '../sim/state';
import type { SaveStore } from './saveStore';

/**
 * How the game starts, from the address and from what is stored.
 *
 * Rule for `?seed=N` (tests, sharing a fixed island): such a start neither
 * loads nor saves – every test gets its fresh island and no old village
 * leaks into the next test. Add `&save=1` to load and save as usual (an
 * existing save wins over the seed; the seed only picks the island of a
 * brand new village).
 */
export interface StartParams {
  /** The island picked in the address, if any. */
  readonly seed: number | undefined;
  /** Load at the start and save while playing? */
  readonly persist: boolean;
}

export function parseStartParams(search: string): StartParams {
  const params = new URLSearchParams(search);
  const text = params.get('seed');
  const parsed = text === null || text.trim() === '' ? Number.NaN : Number(text);
  const seed = Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
  return { seed, persist: seed === undefined || params.get('save') === '1' };
}

/** What happened when the saved village was looked for. */
export type StartKind = 'new' | 'loaded' | 'unreadable' | 'tooNew' | 'storageFailed';

export interface StartResult {
  readonly state: SimState;
  readonly kind: StartKind;
  /** Save while playing? (Not when the save is from a newer version, the store failed, or the address says no.) */
  readonly autosave: boolean;
  /** A friendly sentence for the child or the parents, or `undefined`. */
  readonly notice: TextKey | undefined;
}

/**
 * Looks for a saved village and returns the state to start with. Never
 * throws: whatever is stored, the game starts (with a new island if the save is unusable).
 */
export async function prepareStart(params: StartParams, store: SaveStore, randomSeed: () => number): Promise<StartResult> {
  const fresh = (): SimState => createInitialState(params.seed ?? randomSeed());
  if (!params.persist) {
    return { state: fresh(), kind: 'new', autosave: false, notice: undefined };
  }
  const memoryNotice = store.kind === 'memory' ? 'save.noStorage' : undefined;
  let stored: unknown;
  try {
    stored = await store.load();
  } catch {
    // Can not even read: do not write either, a good save may be in there.
    return { state: fresh(), kind: 'storageFailed', autosave: false, notice: 'save.noStorage' };
  }
  if (stored === undefined) {
    return { state: fresh(), kind: 'new', autosave: store.kind === 'indexedDb', notice: memoryNotice };
  }
  const result = fromSaveData(stored);
  if (result.ok) {
    return { state: result.state, kind: 'loaded', autosave: true, notice: undefined };
  }
  if (result.reason === 'tooNew') {
    // Keep the newer save untouched: no saving over it.
    return { state: fresh(), kind: 'tooNew', autosave: false, notice: 'save.startTooNew' };
  }
  return { state: fresh(), kind: 'unreadable', autosave: true, notice: 'save.startBroken' };
}
