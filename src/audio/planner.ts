import { SOUND_KINDS, shiftCents, type SoundBook, type SoundKind, type Voice } from './recipes';

/**
 * Which sound is played when (M9) – without any audio: pure and testable. A sound of a kind that was played less than
 * its `gapMs` ago is left out (so 20 paths in a row or a busy market do not pile up – coins have a long gap and a quiet
 * gain, and are not heard on every sale); one of its variants is picked and its pitch moved a little at random; at most
 * `maxVoices` tones sound at once – counting the tones of the new sound (one that does not fit is left out whole).
 * Switched off (all sound, or the noises) nothing is played, but counted.
 */

export interface PlannedSound {
  readonly kind: SoundKind;
  readonly gain: number;
  readonly voices: readonly Voice[];
  /** How long the sound lasts (ms). */
  readonly length: number;
}

export type Counts = Record<SoundKind, number>;

function zeroCounts(): Counts {
  return Object.fromEntries(SOUND_KINDS.map((kind) => [kind, 0])) as Counts;
}

export class SoundPlanner {
  private readonly last = new Map<SoundKind, number>();
  /** End times (ms) of the tones that sound now. */
  private endings: number[] = [];
  readonly played: Counts = zeroCounts();
  readonly skipped: Counts = zeroCounts();

  constructor(
    private readonly book: SoundBook,
    private readonly random: () => number,
  ) {}

  /** A sound is wanted at `now` (ms): the sound to play, or `undefined` when it is left out. */
  request(kind: SoundKind, now: number, allowed: boolean): PlannedSound | undefined {
    const recipe = this.book.sounds[kind];
    const last = this.last.get(kind);
    this.endings = this.endings.filter((end) => end > now);
    if (!allowed || (last !== undefined && now - last < recipe.gapMs && now >= last)) {
      this.skipped[kind] += 1;
      return undefined;
    }
    const variant = recipe.variants[Math.min(recipe.variants.length - 1, Math.floor(this.random() * recipe.variants.length))] ?? [];
    // The new voices count too: a sound that does not fit as a whole is left out (never half a sound).
    if (this.endings.length + variant.length > this.book.maxVoices) {
      this.skipped[kind] += 1;
      return undefined;
    }
    const cents = (this.random() * 2 - 1) * recipe.pitchCents;
    const voices = variant.map((voice) => ({
      ...voice,
      freq: voice.wave === 'noise' ? voice.freq : shiftCents(voice.freq, cents),
      ...(voice.to === undefined ? {} : { to: shiftCents(voice.to, cents) }),
    }));
    const length = Math.max(0, ...voices.map((voice) => (voice.at ?? 0) + voice.dur));
    this.last.set(kind, now);
    this.endings.push(...voices.map((voice) => now + (voice.at ?? 0) + voice.dur));
    this.played[kind] += 1;
    return { kind, gain: recipe.gain, voices, length };
  }
}
