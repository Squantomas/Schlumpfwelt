import soundsJson from '../data/sounds.json';

/**
 * The sounds and the music of the game as recipes (M9, `src/data/sounds.json`): no sound files – every sound is a few
 * short tones made by the browser (Web Audio). A sound has variants (one is picked each time) and a small random change
 * of pitch, so the same thing never sounds exactly the same; a minimum gap keeps one sound from piling up.
 */

export const SOUND_KINDS = ['tap', 'build', 'path', 'demolish', 'coins', 'unlock', 'boat', 'error', 'moveHome', 'goodNight'] as const;
export type SoundKind = (typeof SOUND_KINDS)[number];

export type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth' | 'noise';

/** One tone: wave, frequency (Hz; for noise the centre of its band), an optional glide, start and length in ms. */
export interface Voice {
  readonly wave: Wave;
  readonly freq: number;
  readonly to?: number;
  readonly at?: number;
  readonly dur: number;
  /** Share of the sound's gain (default 1). */
  readonly gain?: number;
  /** Rise time in ms (default 8). */
  readonly attack?: number;
}

export interface SoundRecipe {
  /** No second sound of this kind sooner than this (ms). */
  readonly gapMs: number;
  readonly gain: number;
  /** Up to this many cents up or down, at random. */
  readonly pitchCents: number;
  readonly variants: readonly (readonly Voice[])[];
}

export interface MusicRecipe {
  readonly bpm: number;
  readonly stepsPerBeat: number;
  /** The loop is this many bars of four beats. */
  readonly bars: number;
  readonly seed: number;
  /** Notes of the scale in semitones above the root (pentatonic: no note sounds wrong). */
  readonly scale: readonly number[];
  /** MIDI number of the root. */
  readonly root: number;
  /** The chord of each bar in semitones above the root, one after the other. */
  readonly chords: readonly number[];
  /** Share of melody steps that stay silent. */
  readonly melodyRest: number;
  readonly melodyGain: number;
  readonly bassGain: number;
  readonly melodyWave: Wave;
  readonly bassWave: Wave;
  /** How long a melody note sounds, in steps. */
  readonly noteSteps: number;
}

export interface SoundBook {
  readonly volume: { readonly master: number; readonly sfx: number; readonly music: number };
  readonly fadeMs: { readonly toggle: number; readonly hide: number; readonly dusk: number; readonly wake: number };
  readonly maxVoices: number;
  readonly sounds: Readonly<Record<SoundKind, SoundRecipe>>;
  readonly music: MusicRecipe;
}

export const SOUND_BOOK: SoundBook = soundsJson as SoundBook;

/** The frequency of a MIDI note. */
export function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** A frequency moved by `cents` (100 cents = one semitone). */
export function shiftCents(freq: number, cents: number): number {
  return freq * 2 ** (cents / 1200);
}

/** Problems in a sound book (empty = fine): checked by a test, so a typo in the JSON is found before it is heard. */
export function checkSoundBook(book: SoundBook): string[] {
  const problems: string[] = [];
  const share = (name: string, value: number): void => {
    if (!(value >= 0 && value <= 1)) {
      problems.push(`${name}: ${String(value)} liegt nicht zwischen 0 und 1`);
    }
  };
  share('volume.master', book.volume.master);
  share('volume.sfx', book.volume.sfx);
  share('volume.music', book.volume.music);
  for (const kind of SOUND_KINDS) {
    const recipe = (book.sounds as Partial<Record<SoundKind, SoundRecipe>>)[kind];
    if (!recipe) {
      problems.push(`${kind}: fehlt`);
      continue;
    }
    share(`${kind}.gain`, recipe.gain);
    if (recipe.variants.length === 0) {
      problems.push(`${kind}: keine Variante`);
    }
    if (!(recipe.gapMs >= 30)) {
      problems.push(`${kind}: gapMs zu klein`);
    }
    for (const voice of recipe.variants.flat()) {
      if (!['sine', 'triangle', 'square', 'sawtooth', 'noise'].includes(voice.wave)) {
        problems.push(`${kind}: Welle ${voice.wave}`);
      }
      if (!(voice.freq >= 20 && voice.freq <= 8000) || (voice.to !== undefined && !(voice.to >= 20 && voice.to <= 8000))) {
        problems.push(`${kind}: Frequenz außerhalb 20–8000 Hz`);
      }
      if (!(voice.dur > 0 && voice.dur <= 2000)) {
        problems.push(`${kind}: Dauer ${String(voice.dur)}`);
      }
      share(`${kind}.voice.gain`, voice.gain ?? 1);
    }
  }
  const music = book.music;
  if (music.scale.length === 0 || music.chords.length === 0 || !(music.bpm >= 40 && music.bpm <= 140)) {
    problems.push('music: Tonleiter, Akkorde oder Tempo');
  }
  share('music.melodyGain', music.melodyGain);
  share('music.bassGain', music.bassGain);
  return problems;
}
