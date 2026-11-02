import { loopSteps, notesAt, stepSeconds } from './music';
import { SoundPlanner, type PlannedSound } from './planner';
import { SOUND_BOOK, type SoundBook, type SoundKind, type Voice } from './recipes';

/**
 * The sound of the game (M9), the only place that uses Web Audio. Tablets allow sound only after a touch: the start
 * screen calls {@link AudioEngine.unlock} in its tap. Without Web Audio (or when it fails) the game stays silent and
 * nothing throws.
 *
 * - Noises: {@link play} asks the {@link SoundPlanner} (gaps, variants, at most a few voices at once).
 * - Music: a calm loop (`music.ts`), scheduled a little ahead from {@link update}, which the game calls every frame (no
 *   timers: a page that does not draw does not play on). In the evening it goes on playing while its bus fades out
 *   (`fadeMs.dusk`); after the fade and at night no notes are made.
 * - A hidden page is silent at once (the context is suspended); a switched-off sound only fades its bus.
 * - A window that has lost the village to a newer one ({@link silence}) stays silent for good.
 * - Tablets suspend or interrupt the context (a call, the lock screen): every tap tries {@link resumeIfNeeded}.
 */

export type AudioMode = 'day' | 'dusk' | 'night';

export interface SoundSwitches {
  readonly on: boolean;
  readonly music: boolean;
  readonly sfx: boolean;
}

type ContextFactory = () => AudioContext | undefined;

/** Look ahead this far when scheduling the music (s). */
const LOOKAHEAD = 0.35;
/** A gain of "nothing" for exponential ramps (they can not reach 0). */
const SILENT = 0.0001;

function browserContext(): AudioContext | undefined {
  const scope = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Context = scope.AudioContext ?? scope.webkitAudioContext;
  if (!Context) {
    return undefined;
  }
  try {
    return new Context({ latencyHint: 'interactive' });
  } catch {
    return undefined;
  }
}

/** A small, fixed random number sequence for the variants and the noise (the same game sounds the same way). */
function sequence(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

export class AudioEngine {
  private ctx: AudioContext | undefined;
  private master: GainNode | undefined;
  private sfxBus: GainNode | undefined;
  private musicBus: GainNode | undefined;
  private noise: AudioBuffer | undefined;
  private readonly planner: SoundPlanner;
  private switches: SoundSwitches = { on: true, music: true, sfx: true };
  private hidden = false;
  private mode: AudioMode = 'day';
  private unlocked = false;
  private failed = false;
  private silenced = false;
  /** Context time at which the evening fade of the music is over. */
  private duskEndsAt = 0;
  private nextStep = 0;
  private nextStepAt = 0;
  private musicNotes = 0;
  private lastRequest = 0;

  constructor(
    private readonly book: SoundBook = SOUND_BOOK,
    private readonly makeContext: ContextFactory = browserContext,
    random: () => number = sequence(97),
  ) {
    this.planner = new SoundPlanner(book, random);
  }

  /** In the first tap (a user gesture): makes and starts the audio context. Later calls only resume it. */
  unlock(): void {
    if (this.failed) {
      return;
    }
    try {
      if (!this.ctx) {
        const ctx = this.makeContext();
        if (!ctx) {
          this.failed = true;
          return;
        }
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.sfxBus = ctx.createGain();
        this.musicBus = ctx.createGain();
        this.master.gain.value = 0;
        this.sfxBus.gain.value = 0;
        this.musicBus.gain.value = 0;
        this.sfxBus.connect(this.master);
        this.musicBus.connect(this.master);
        this.master.connect(ctx.destination);
        this.noise = this.makeNoise(ctx);
      }
      this.unlocked = true;
      if (!this.hidden && !this.silenced && (this.ctx.state as string) !== 'running') {
        void this.ctx.resume().catch(() => undefined);
      }
      this.applyGains(this.book.fadeMs.toggle);
    } catch (error) {
      console.warn('Ton nicht verfügbar', error);
      this.failed = true;
      this.ctx = undefined;
    }
  }

  setSwitches(switches: SoundSwitches): void {
    this.switches = switches;
    this.applyGains(this.book.fadeMs.toggle);
  }

  get soundSwitches(): SoundSwitches {
    return this.switches;
  }

  /** The page is hidden (or shown again): silent at once, no sound piles up. */
  setHidden(hidden: boolean): void {
    if (this.hidden === hidden) {
      return;
    }
    this.hidden = hidden;
    this.applyGains(this.book.fadeMs.hide);
    const ctx = this.ctx;
    if (!ctx) {
      return;
    }
    try {
      if (hidden) {
        void ctx.suspend().catch(() => undefined);
      } else if (this.unlocked) {
        void ctx.resume().catch(() => undefined);
        // Start the music again from now, not from where it stopped (nothing is caught up).
        this.nextStepAt = 0;
      }
    } catch {
      // Ignore: a context that can not be suspended just keeps its (silent) bus.
    }
  }

  /** Day, evening (the music plays on and fades out over `fadeMs.dusk`) or night (no music). */
  setMode(mode: AudioMode): void {
    if (this.mode === mode) {
      return;
    }
    const from = this.mode;
    this.mode = mode;
    if (mode === 'dusk') {
      this.duskEndsAt = (this.ctx?.currentTime ?? 0) + this.book.fadeMs.dusk / 1000;
    }
    this.applyGains(mode === 'dusk' ? this.book.fadeMs.dusk : mode === 'night' && from === 'dusk' ? this.book.fadeMs.toggle : this.book.fadeMs.wake);
    if (mode === 'day') {
      this.nextStepAt = 0;
    }
  }

  /** A newer window has taken over the village: this one makes no sound any more (the page reloads to play on). */
  silence(): void {
    if (this.silenced) {
      return;
    }
    this.silenced = true;
    this.applyGains(this.book.fadeMs.hide);
    try {
      void this.ctx?.suspend().catch(() => undefined);
    } catch {
      // Ignore: the master gain is already silent.
    }
  }

  /**
   * On every tap (a user gesture): a context that the tablet has suspended or interrupted (a call, the lock screen) is
   * started again – only when the sound is on and the page is visible. Cheap when it already runs.
   */
  resumeIfNeeded(): void {
    const ctx = this.ctx;
    if (!ctx || !this.unlocked || this.failed || this.hidden || this.silenced || !this.switches.on) {
      return;
    }
    try {
      if ((ctx.state as string) !== 'running') {
        void ctx.resume().catch(() => undefined);
        this.nextStepAt = 0;
      }
    } catch {
      // Ignore: it stays silent until the next tap.
    }
  }

  /** A noise of the game; `now` is the frame time (ms) – for the gaps between sounds of a kind. */
  play(kind: SoundKind, now: number): void {
    this.lastRequest = now;
    const allowed = this.unlocked && !this.failed && !this.hidden && !this.silenced && this.switches.on && this.switches.sfx;
    const planned = this.planner.request(kind, now, allowed);
    if (planned) {
      this.schedule(planned);
    }
  }

  /** Every frame: schedules the music a little ahead. */
  update(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || !this.musicPlays || ctx.state !== 'running') {
      return;
    }
    const step = stepSeconds(this.book.music);
    if (this.nextStepAt < ctx.currentTime) {
      // First time, or after a pause: begin a moment from now.
      this.nextStepAt = ctx.currentTime + 0.05;
    }
    while (this.nextStepAt < ctx.currentTime + LOOKAHEAD) {
      for (const note of notesAt(this.book.music, this.nextStep)) {
        this.tone(this.musicBus, { wave: note.wave, freq: note.freq, dur: note.steps * step * 1000, gain: note.gain, attack: 30 }, this.nextStepAt, 1);
        this.musicNotes += 1;
      }
      this.nextStep = (this.nextStep + 1) % loopSteps(this.book.music);
      this.nextStepAt += step;
    }
  }

  /** Is music playing now (switched on, a visible page, the day – or the evening until its fade is over)? */
  get musicPlays(): boolean {
    if (!this.musicWanted) {
      return false;
    }
    return this.mode === 'day' || (this.mode === 'dusk' && (this.ctx?.currentTime ?? 0) < this.duskEndsAt);
  }

  /** Switched on and audible at all (unlocked, visible, not silenced) – regardless of the time of day. */
  private get musicWanted(): boolean {
    return this.unlocked && !this.failed && !this.hidden && !this.silenced && this.switches.on && this.switches.music;
  }

  /** For the page marker `<html data-audio>`. */
  describe(): string {
    const state = this.failed ? 'none' : !this.unlocked ? 'locked' : this.silenced ? 'silenced' : this.hidden ? 'hidden' : (this.ctx?.state ?? 'none');
    return JSON.stringify({
      state,
      on: this.switches.on,
      music: this.switches.music,
      sfx: this.switches.sfx,
      mode: this.mode,
      musicPlaying: this.musicPlays && this.ctx?.state === 'running',
      musicNotes: this.musicNotes,
      // The loudness of the music bus right now (0 … volume.music; an evening fade is seen falling).
      musicGain: Math.round((this.musicBus?.gain.value ?? 0) * 1000) / 1000,
      played: this.planner.played,
      skipped: this.planner.skipped,
      last: Math.round(this.lastRequest),
    });
  }

  private get sfxLevel(): number {
    return this.switches.on && this.switches.sfx ? this.book.volume.sfx : 0;
  }

  /** The level the music bus moves to: only by day (in the evening it fades to 0 while the notes go on). */
  private get musicLevel(): number {
    return this.musicWanted && this.mode === 'day' ? this.book.volume.music : 0;
  }

  private applyGains(fadeMs: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.sfxBus || !this.musicBus) {
      return;
    }
    const now = ctx.currentTime;
    const ramp = (node: GainNode, value: number): void => {
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(node.gain.value, now);
      node.gain.linearRampToValueAtTime(value, now + Math.max(0.01, fadeMs / 1000));
    };
    ramp(this.master, this.hidden || this.silenced || !this.switches.on ? 0 : this.book.volume.master);
    ramp(this.sfxBus, this.sfxLevel);
    ramp(this.musicBus, this.musicLevel);
  }

  private schedule(sound: PlannedSound): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) {
      return;
    }
    const start = ctx.currentTime + 0.01;
    for (const voice of sound.voices) {
      this.tone(this.sfxBus, voice, start + (voice.at ?? 0) / 1000, sound.gain);
    }
  }

  private tone(bus: GainNode, voice: Voice, start: number, gain: number): void {
    const ctx = this.ctx;
    if (!ctx) {
      return;
    }
    try {
      const length = voice.dur / 1000;
      const attack = Math.min(length / 2, (voice.attack ?? 8) / 1000);
      const level = Math.max(SILENT * 2, gain * (voice.gain ?? 1));
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(SILENT, start);
      envelope.gain.linearRampToValueAtTime(level, start + attack);
      envelope.gain.exponentialRampToValueAtTime(SILENT, start + length);
      envelope.connect(bus);
      let source: AudioScheduledSourceNode;
      if (voice.wave === 'noise') {
        const noise = ctx.createBufferSource();
        noise.buffer = this.noise ?? null;
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = voice.freq;
        band.Q.value = 0.8;
        noise.connect(band);
        band.connect(envelope);
        source = noise;
      } else {
        const osc = ctx.createOscillator();
        osc.type = voice.wave;
        osc.frequency.setValueAtTime(voice.freq, start);
        if (voice.to !== undefined) {
          osc.frequency.exponentialRampToValueAtTime(voice.to, start + length);
        }
        osc.connect(envelope);
        source = osc;
      }
      source.start(start);
      source.stop(start + length + 0.05);
      source.onended = () => {
        envelope.disconnect();
      };
    } catch {
      // A tone that can not be made is left out.
    }
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const next = sequence(5);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = next() * 2 - 1;
    }
    return buffer;
  }
}
