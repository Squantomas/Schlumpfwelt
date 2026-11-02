import { midiToHz, type MusicRecipe, type Wave } from './recipes';

/**
 * The calm background music (M9): a melody on a pentatonic scale over a slow bass, made from the recipe and a seed –
 * the same loop every time, `bars` bars long, then it starts again. Pure: the engine asks for the notes of each step.
 */

export interface MusicNote {
  readonly freq: number;
  /** In steps. */
  readonly steps: number;
  readonly gain: number;
  readonly wave: Wave;
}

function hash(seed: number, a: number, b: number): number {
  let h = (seed ^ Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}

/** Steps of one bar (four beats). */
export function stepsPerBar(music: MusicRecipe): number {
  return music.stepsPerBeat * 4;
}

/** Length of one step in seconds. */
export function stepSeconds(music: MusicRecipe): number {
  return 60 / music.bpm / music.stepsPerBeat;
}

/** Steps until the loop starts again. */
export function loopSteps(music: MusicRecipe): number {
  return stepsPerBar(music) * music.bars;
}

/** The scale degree of the melody at a step: it walks up and down by small steps, never jumps far. */
function degreeAt(music: MusicRecipe, step: number): number {
  const bar = Math.floor(step / stepsPerBar(music));
  // A new walk starts every bar (from a note of the bar's chord), so the loop has no drift.
  let degree = 2 + Math.floor(hash(music.seed, bar, 999) * 3);
  for (let s = bar * stepsPerBar(music); s < step; s += 1) {
    const move = hash(music.seed, s, 1);
    degree += move < 0.35 ? -1 : move < 0.7 ? 1 : 0;
    degree = Math.max(0, Math.min(music.scale.length * 2 - 1, degree));
  }
  return degree;
}

/** The notes that start at `step` (the loop repeats). */
export function notesAt(music: MusicRecipe, step: number): MusicNote[] {
  const loop = loopSteps(music);
  const s = ((step % loop) + loop) % loop;
  const perBar = stepsPerBar(music);
  const bar = Math.floor(s / perBar);
  const inBar = s % perBar;
  const chord = music.chords[bar % music.chords.length] ?? 0;
  const notes: MusicNote[] = [];
  // The bass: the root of the chord on the first and third beat.
  if (inBar === 0 || inBar === perBar / 2) {
    notes.push({ freq: midiToHz(music.root - 24 + chord), steps: perBar / 2, gain: music.bassGain, wave: music.bassWave });
  }
  // The melody: some steps rest; the last step of every second bar rests, so the tune breathes.
  const resting = hash(music.seed, s, 2) < music.melodyRest || (bar % 2 === 1 && inBar >= perBar - 2);
  if (!resting) {
    const degree = degreeAt(music, s);
    const octave = Math.floor(degree / music.scale.length);
    const interval = music.scale[degree % music.scale.length] ?? 0;
    notes.push({ freq: midiToHz(music.root + 12 * octave + interval), steps: music.noteSteps, gain: music.melodyGain * (inBar % 2 === 0 ? 1 : 0.75), wave: music.melodyWave });
  }
  return notes;
}
