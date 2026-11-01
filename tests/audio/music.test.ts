import { describe, expect, it } from 'vitest';
import { loopSteps, notesAt, stepSeconds, stepsPerBar } from '../../src/audio/music';
import { SOUND_BOOK, midiToHz } from '../../src/audio/recipes';

const MUSIC = SOUND_BOOK.music;

describe('Hintergrundmusik (M9)', () => {
  it('ruhiges Tempo und eine Schleife aus ganzen Takten', () => {
    expect(MUSIC.bpm).toBeLessThanOrEqual(90);
    expect(stepSeconds(MUSIC)).toBeCloseTo(60 / MUSIC.bpm / MUSIC.stepsPerBeat);
    expect(loopSteps(MUSIC)).toBe(stepsPerBar(MUSIC) * MUSIC.bars);
  });

  it('immer dieselbe Melodie, und nach einer Schleife beginnt sie von vorn', () => {
    for (let step = 0; step < loopSteps(MUSIC); step += 1) {
      expect(notesAt(MUSIC, step)).toEqual(notesAt(MUSIC, step));
      expect(notesAt(MUSIC, step + loopSteps(MUSIC))).toEqual(notesAt(MUSIC, step));
    }
  });

  it('jeder Ton der Melodie liegt auf der Tonleiter, der Bass auf dem Grundton des Takts', () => {
    const allowed = new Set<number>();
    for (let octave = -3; octave <= 3; octave += 1) {
      for (const interval of MUSIC.scale) {
        allowed.add(Math.round(midiToHz(MUSIC.root + interval + 12 * octave) * 100));
      }
    }
    let melody = 0;
    let bass = 0;
    for (let step = 0; step < loopSteps(MUSIC); step += 1) {
      for (const note of notesAt(MUSIC, step)) {
        if (note.wave === MUSIC.bassWave && note.steps === stepsPerBar(MUSIC) / 2) {
          bass += 1;
          const bar = Math.floor(step / stepsPerBar(MUSIC));
          expect(note.freq).toBeCloseTo(midiToHz(MUSIC.root - 24 + (MUSIC.chords[bar % MUSIC.chords.length] ?? 0)));
        } else {
          melody += 1;
          expect(allowed.has(Math.round(note.freq * 100)), String(note.freq)).toBe(true);
        }
      }
    }
    expect(bass).toBe(MUSIC.bars * 2);
    // Some steps rest (it breathes), most do not.
    expect(melody).toBeGreaterThan(loopSteps(MUSIC) * 0.4);
    expect(melody).toBeLessThan(loopSteps(MUSIC) * 0.9);
  });

  it('die Melodie springt nie weit (höchstens zwei Stufen von Ton zu Ton)', () => {
    let last: number | undefined;
    for (let step = 0; step < loopSteps(MUSIC); step += 1) {
      const note = notesAt(MUSIC, step).find((entry) => entry.wave === MUSIC.melodyWave);
      if (note) {
        if (last !== undefined) {
          expect(Math.abs(1200 * Math.log2(note.freq / last))).toBeLessThanOrEqual(1200);
        }
        last = note.freq;
      }
    }
  });
});
