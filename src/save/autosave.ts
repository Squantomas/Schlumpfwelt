import type { DeepReadonly } from '../sim/readonly';
import { toSaveData } from '../sim/saveData';
import type { SimState } from '../sim/state';
import type { SaveStore } from './saveStore';

export interface AutosaveOptions {
  /** Saves at least this often while the game runs (ms). Default: every minute. */
  readonly intervalMs?: number;
  /**
   * After a change of the village (building, demolishing …) it waits this long (ms) before saving. Default 0: the
   * change is saved in the frame after the tick that applied it – a page that is closed hard right after building
   * (tablet, closed tab) must not lose it. Several commands of one tick are one change.
   */
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
export const AUTOSAVE_DEBOUNCE_MS = 0;

/**
 * Saves the village now and then: every minute, right after something was
 * built or changed, and when the page is left (`flush`). It has no timers of
 * its own – the scene calls {@link Autosave.update} once per frame with the
 * time – so it can be tested with made-up times.
 *
 * - Nothing is saved while nothing changed (a paused game stays as it is).
 * - Never two writes at the same time: while one is running, a request (`update`, `flush`, `saveNow`) only
 *   remembers "once more" – the follow-up write takes the state of that moment, so a change that happens during
 *   a write (an import right after a save) is not lost, and a burst of builds is one follow-up, not a storm.
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
  /** Someone asked for a write while one was running. */
  private again: 'no' | 'ifChanged' | 'always' = 'no';
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
    const changed = state.revision !== this.savedRevision;
    // A running write picks up what changed meanwhile as one follow-up when it is done (see `run`).
    if (this.inFlight) {
      if (changed && this.again === 'no') {
        this.again = 'ifChanged';
      }
      return;
    }
    if (nowMs < this.blockedUntil) {
      return;
    }
    const due = (changed && nowMs - this.lastChangeAt >= this.debounceMs) || (state.tick !== this.savedTick && nowMs - this.lastSaveAt >= this.intervalMs);
    if (due) {
      void this.write('ifChanged');
    }
  }

  /** The page is being left or hidden: save at once if anything changed since the last save. */
  flush(): Promise<void> {
    const state = this.read();
    if (!this.seen) {
      this.remember(state, this.lastNow);
    }
    if (state.tick !== this.savedTick || state.revision !== this.savedRevision || this.inFlight) {
      return this.write('ifChanged');
    }
    return Promise.resolve();
  }

  /** Saves right now, whatever changed (after a file was loaded). */
  saveNow(): Promise<void> {
    return this.write('always');
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

  /** Starts a write, or – while one runs – asks for one more after it. The promise is done when everything asked for is written. */
  private write(kind: 'ifChanged' | 'always'): Promise<void> {
    if (this.inFlight) {
      this.again = kind === 'always' || this.again === 'always' ? 'always' : 'ifChanged';
      return this.inFlight;
    }
    const running = this.run(kind).finally(() => {
      this.inFlight = undefined;
    });
    this.inFlight = running;
    return running;
  }

  private async run(first: 'ifChanged' | 'always'): Promise<void> {
    let kind: 'no' | 'ifChanged' | 'always' = first;
    while (kind !== 'no') {
      this.again = 'no';
      // The data is copied now, so what is saved is exactly this moment.
      const state = this.read();
      const { tick, revision } = state;
      if (kind === 'ifChanged' && tick === this.savedTick && revision === this.savedRevision) {
        return;
      }
      const data = toSaveData(state);
      const startedAt = this.lastNow;
      try {
        await this.store.save(data);
      } catch {
        // Full disk, blocked storage …: try again later, quietly.
        this.failures += 1;
        this.blockedUntil = startedAt + this.intervalMs;
        return;
      }
      this.saves += 1;
      this.savedTick = tick;
      this.savedRevision = revision;
      this.lastSaveAt = startedAt;
      kind = this.again;
    }
  }
}
