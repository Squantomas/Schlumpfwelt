import type { TextKey } from '../data/texts';
import type { Simulation } from '../sim/simulation';
import type { SimState } from '../sim/state';
import type { Autosave } from './autosave';
import type { SaveStore } from './saveStore';
import type { StartKind } from './startup';

/**
 * What the scene needs to know about saving: the simulation, whether and how
 * the village is saved on its own, and the one sentence to show at the start.
 */
export class GameSession {
  private notice: TextKey | undefined;
  /** The tick and the store of the state the game started with (for the page marker: a loaded village can be compared with what was saved). */
  private startTick: number;
  private startStock: Record<string, number>;

  constructor(
    readonly simulation: Simulation,
    readonly store: SaveStore,
    /** `undefined`: nothing is saved on its own (test address, newer save, no storage). */
    readonly autosave: Autosave | undefined,
    readonly kind: StartKind,
    notice: TextKey | undefined,
  ) {
    this.notice = notice;
    this.startTick = simulation.state.tick;
    this.startStock = { ...simulation.state.inventory };
  }

  /** The start sentence, once (a scene that starts again does not repeat it). */
  takeNotice(): TextKey | undefined {
    const notice = this.notice;
    this.notice = undefined;
    return notice;
  }

  /** Does the village save itself? */
  get saves(): boolean {
    return this.autosave !== undefined;
  }

  /**
   * A village from a file replaces the one in the game: it is saved at once (when saving is on), and the scene says so
   * once when it starts again.
   */
  replaceVillage(state: SimState): void {
    this.simulation.load(state);
    this.startTick = state.tick;
    this.startStock = { ...state.inventory };
    this.autosave?.rebase();
    void this.autosave?.saveNow();
    this.notice = 'menu.loaded';
  }

  /** For the page marker (`<html data-save>`): how it started and what was saved so far. */
  describe(): string {
    const stats = this.autosave?.stats;
    return JSON.stringify({
      store: this.store.kind,
      autosave: this.saves,
      start: this.kind,
      startTick: this.startTick,
      startStock: this.startStock,
      saves: stats?.saves ?? 0,
      failures: stats?.failures ?? 0,
      savedTick: stats?.savedTick ?? 0,
    });
  }
}
