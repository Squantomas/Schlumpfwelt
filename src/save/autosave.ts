import type { DeepReadonly } from '../sim/readonly';
import { toSaveData } from '../sim/saveData';
import type { SimState } from '../sim/state';
import type { SaveStore } from './saveStore';

export interface AutosaveOptions {
  /** Saves at least this often while the game runs (ms). Default: every minute. */
  readonly intervalMs?: number;
  /** After a change of the village (building, demolishing …) it saves once things have been quiet for this long (ms). */
  readonly debounceMs?: number;
}

/** What has happened so far (for the page marker and for tests). */
export interface AutosaveStats {
  readonly saves: number;
  readonly failures: number;
  /** The tick of the state that was saved last. */
  readonly savedTick: number;
}

export const AUTOSAVE_INTERVAL_MS = 60_000;
export const AUTOSAVE_DEBOUNCE_MS = 1500;

/**
 * Saves the village now and then: every minute, a moment after something was
 * built or changed, and when the page is left (`flush`). It has no timers of
 * its own – the scene calls {@link Autosave.update} once per frame with the
 * time – so it can be tested with made-up times.
 *
 * - Nothing is saved while nothing changed (a paused game stays as it is).
 * - A save in flight is never overlapped by a second one.
 * - A failed write is retried after a minute, never every frame, and never throws.
 * - The state that was loaded counts as saved (`update` remembers it on the first call).
 */
export class Autosave {
  private readonly intervalMs: number;
  private readonly debounceMs: number;
  private seen = false;
  private savedTick = 0;
  private savedRevision = 0;
  private lastSaveAt = 0;
  private lastChangeAt = 0;
  private seenRevision = 0;
  private blockedUntil = Number.NEGATIVE_INFINITY;
  private inFlight: Promise<void> | undefined;
  private lastNow = 0;
  private saves = 0;
  private failures = 0;

  constructor(
    private readonly store: SaveStore,
    private readonly read: () => DeepReadonly<SimState>,
    options: AutosaveOptions = {},
  ) {
    this.intervalMs = options.intervalMs ?? AUTOSAVE_INTERVAL_MS;
    this.debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
  }

  get stats(): AutosaveStats {
    return { saves: this.saves, failures: this.failures, savedTick: this.savedTick };
  }

  /** Call once per frame with a time in ms that only goes up. */
  update(nowMs: number): void {
    this.lastNow = nowMs;
    const state = this.read();
    if (!this.seen) {
      this.remember(state, nowMs);
      return;
    }
    if (state.revision !== this.seenRevision) {
      this.seenRevision = state.revision;
      this.lastChangeAt = nowMs;
    }
    if (nowMs < this.blockedUntil) {
      return;
    }
    const changed = state.revision !== this.savedRevision;
    const due = (changed && nowMs - this.lastChangeAt >= this.debounceMs) || (state.tick !== this.savedTick && nowMs - this.lastSaveAt >= this.intervalMs);
    if (due) {
      void this.write(state, nowMs);
    }
  }

  /** The page is being left or hidden: save at once if anything changed since the last save. */
  flush(): Promise<void> {
    const state = this.read();
    if (!this.seen) {
      this.remember(state, this.lastNow);
    }
    if (state.tick !== this.savedTick || state.revision !== this.savedRevision) {
      return this.write(state, this.lastNow);
    }
    return this.inFlight ?? Promise.resolve();
  }

  /** Saves right now, whatever changed (after a file was loaded). */
  saveNow(): Promise<void> {
    return this.write(this.read(), this.lastNow);
  }

  /** The state was replaced from outside (a file was loaded): what is in the game now is the new starting point. */
  rebase(nowMs = this.lastNow): void {
    this.remember(this.read(), nowMs);
  }

  private remember(state: DeepReadonly<SimState>, nowMs: number): void {
    this.seen = true;
    this.savedTick = state.tick;
    this.savedRevision = state.revision;
    this.seenRevision = state.revision;
    this.lastSaveAt = nowMs;
    this.lastChangeAt = nowMs;
  }

  private write(state: DeepReadonly<SimState>, nowMs: number): Promise<void> {
    if (this.inFlight) {
      // Wait for the running save, then look again: whatever changed meanwhile is saved by the next update.
      return this.inFlight;
    }
    // The data is copied now, so what is saved is exactly this moment.
    const data = toSaveData(state);
    const { tick, revision } = state;
    let saving: Promise<void>;
    try {
      saving = this.store.save(data);
    } catch (error) {
      saving = Promise.reject(error instanceof Error ? error : new Error('save failed'));
    }
    const done = saving
      .then(() => {
        this.saves += 1;
        this.savedTick = tick;
        this.savedRevision = revision;
        this.lastSaveAt = nowMs;
      })
      .catch(() => {
        // Full disk, blocked storage …: try again later, quietly.
        this.failures += 1;
        this.blockedUntil = nowMs + this.intervalMs;
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    this.inFlight = done;
    return done;
  }
}
