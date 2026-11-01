import { PARENT_RULES } from '../data/parent';
import { DayClock, DAY_CLOCK_OPTIONS, type DayClockOptions, type DayEvent, type DayInput } from './dayClock';
import { isPin, makePin, newSalt, pinMatches } from './pin';
import { newerSettings, readSettings, toStored, type ParentSettings } from './settings';
import { MemorySettingsStore, type SettingsStore } from './settingsStore';

/**
 * The parents' side of the game while it runs (M8): the settings (PIN, limit, tutorial progress), today's account and
 * the course of the evening ({@link DayClock}), and keeping them stored.
 *
 * Writing:
 * - a change the parents make (PIN, limit, more time) and a change of the tutorial are written at once;
 * - the counted play time every `saveEverySeconds` of play, at every turn of the day (evening, night, morning, new
 *   day) and when the page is left (`flush`) – a reload never gives time back (at most a few seconds);
 * - writes run one after the other, in order; a failed write is not retried on its own (the next one carries
 *   everything), and never throws;
 * - a window that another window has taken over (M5: the newest window saves) writes nothing any more (`stopWhen`);
 * - an entry of a newer version of the game is read, but never written over: everything stays in memory for this
 *   visit (Korrekturrunde 1), and the parents' menu says so once.
 */
export class ParentSession {
  readonly clock: DayClock;
  private pin: ParentSettings['pin'];
  private pinLost: boolean;
  private tutorialRecord: unknown;
  private sinceSaveMs = 0;
  private writing: Promise<void> = Promise.resolve();
  private stopped: () => boolean = () => false;
  private saves = 0;
  private failures = 0;
  private toldMemory = false;
  /** Keep the tutorial in memory only (a test village that is not saved must not touch the progress of the real one). */
  private tutorialInMemory = false;
  /** The tutorial progress read at the start: written back unchanged while the tutorial is kept in memory. */
  private storedTutorial: unknown = undefined;

  private constructor(
    private readonly store: SettingsStore,
    settings: ParentSettings,
    options: DayClockOptions,
    private readonly newer = false,
  ) {
    this.pin = settings.pin;
    this.pinLost = settings.pinLost;
    this.tutorialRecord = settings.tutorial;
    this.clock = new DayClock({ day: settings.day, usedMs: settings.usedMs, extraMinutes: settings.extraMinutes }, settings.limitMinutes, options);
  }

  /** Reads the settings (never throws: a store that can not be read gives the defaults, kept in memory for this visit). */
  static async open(store: SettingsStore, today: string, options: DayClockOptions = DAY_CLOCK_OPTIONS): Promise<ParentSession> {
    let raw: unknown;
    let used = store;
    try {
      raw = await store.load();
    } catch {
      // Not readable: do not write over what may be in there.
      raw = undefined;
      used = new MemorySettingsStore();
    }
    // A newer version wrote this: read what it can, never write over it.
    const newer = newerSettings(raw);
    return new ParentSession(newer ? new MemorySettingsStore() : used, readSettings(raw, today), options, newer);
  }

  /** Where the settings are kept: `memory` means only for this visit. */
  get storeKind(): SettingsStore['kind'] {
    return this.store.kind;
  }

  /** Writes stop for good once this says so (another window has taken over). */
  stopWhen(stopped: () => boolean): void {
    this.stopped = stopped;
  }

  /** The tutorial of a village that is never saved (test address) stays in memory; the stored progress is kept as it is. */
  keepTutorialInMemory(): void {
    if (!this.tutorialInMemory) {
      this.storedTutorial = this.tutorialRecord;
      this.tutorialInMemory = true;
    }
  }

  /** Once per frame; returns what happened (see {@link DayClock.update}). */
  update(input: DayInput): DayEvent[] {
    const before = this.clock.account.usedMs;
    const events = this.clock.update(input);
    const after = this.clock.account;
    this.sinceSaveMs += Math.max(0, after.usedMs - before);
    if (events.length > 0 || this.sinceSaveMs >= PARENT_RULES.saveEverySeconds * 1000) {
      void this.save();
    }
    return events;
  }

  get hasPin(): boolean {
    return this.pin !== null;
  }

  /**
   * No PIN, but there should be one (Korrekturrunde 1): the stored PIN can not be read, or a limit is set (only the
   * parents set it, behind a PIN). Then a new PIN needs the question of "PIN vergessen?" first.
   */
  get pinGuarded(): boolean {
    return this.pin === null && (this.pinLost || this.clock.limitMinutes > 0);
  }

  checkPin(pin: string): boolean {
    return pinMatches(this.pin, pin);
  }

  /** Sets a new PIN (only a salted hash is kept). Ignored unless it is a PIN. */
  setPin(pin: string, random: () => number = Math.random): void {
    if (!isPin(pin)) {
      return;
    }
    this.pin = makePin(pin, newSalt(random));
    this.pinLost = false;
    void this.save();
  }

  setLimit(minutes: number): void {
    this.clock.setLimit(minutes);
    void this.save();
  }

  addExtra(minutes: number = PARENT_RULES.extraMinutes): void {
    this.clock.addExtra(minutes);
    void this.save();
  }

  get tutorial(): unknown {
    return this.tutorialRecord;
  }

  setTutorial(record: unknown): void {
    this.tutorialRecord = structuredClone(record);
    if (!this.tutorialInMemory) {
      void this.save();
    }
  }

  /**
   * Is this the first time the parents' menu may say that nothing is kept? (Once per visit.) `newer`: the entry is
   * from a newer version of the game; `noStore`: this browser keeps nothing.
   */
  takeMemoryNote(): 'noStore' | 'newer' | undefined {
    if (this.store.kind !== 'memory' || this.toldMemory) {
      return undefined;
    }
    this.toldMemory = true;
    return this.newer ? 'newer' : 'noStore';
  }

  /** Writes now (the page is left). Resolves when written (or failed). */
  flush(): Promise<void> {
    return this.save();
  }

  /** What is stored. */
  snapshot(): ParentSettings {
    const account = this.clock.account;
    return {
      pin: this.pin,
      limitMinutes: this.clock.limitMinutes,
      day: account.day,
      usedMs: Math.round(account.usedMs),
      extraMinutes: account.extraMinutes,
      pinLost: this.pinLost,
      tutorial: this.tutorialRecord,
    };
  }

  private save(): Promise<void> {
    if (this.stopped()) {
      return this.writing;
    }
    this.sinceSaveMs = 0;
    const settings = this.snapshot();
    // The tutorial of a village that is not saved is not written; the one that is stored stays.
    const data = toStored(this.tutorialInMemory ? { ...settings, tutorial: this.storedTutorial } : settings);
    this.writing = this.writing.then(async () => {
      try {
        await this.store.save(data);
        this.saves += 1;
      } catch {
        this.failures += 1;
      }
    });
    return this.writing;
  }

  /** For the page marker (`<html data-limit>`). */
  describe(): string {
    const account = this.clock.account;
    const allowed = this.clock.allowedMs;
    return JSON.stringify({
      phase: this.clock.phase,
      used: Math.floor(account.usedMs / 1000),
      allowed: allowed === undefined ? null : Math.floor(allowed / 1000),
      limit: this.clock.limitMinutes,
      extra: account.extraMinutes,
      warned: this.clock.warned,
      day: account.day,
      store: this.store.kind,
      ...(this.newer ? { newer: true } : {}),
      pin: this.pin !== null,
      saves: this.saves,
      failures: this.failures,
    });
  }
}
