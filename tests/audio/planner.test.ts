import { describe, expect, it } from 'vitest';
import { SoundPlanner } from '../../src/audio/planner';
import { SOUND_BOOK } from '../../src/audio/recipes';

function steps(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length] ?? 0;
}

describe('Wann ein Geräusch klingt (M9)', () => {
  it('zwischen zwei gleichen Geräuschen liegt mindestens ihr Abstand', () => {
    const planner = new SoundPlanner(SOUND_BOOK, steps([0.5]));
    expect(planner.request('build', 1000, true)).toBeDefined();
    expect(planner.request('build', 1000 + SOUND_BOOK.sounds.build.gapMs - 1, true)).toBeUndefined();
    expect(planner.request('build', 1000 + SOUND_BOOK.sounds.build.gapMs, true)).toBeDefined();
    expect(planner.played.build).toBe(2);
    expect(planner.skipped.build).toBe(1);
  });

  it('verschiedene Geräusche stören sich nicht', () => {
    const planner = new SoundPlanner(SOUND_BOOK, steps([0.5]));
    expect(planner.request('build', 0, true)).toBeDefined();
    expect(planner.request('coins', 10, true)).toBeDefined();
    expect(planner.request('tap', 20, true)).toBeDefined();
  });

  it('ein voller Markt: höchstens ein Taler-Klang alle 1,6 s', () => {
    const planner = new SoundPlanner(SOUND_BOOK, steps([0.3, 0.7]));
    for (let time = 0; time < 16_000; time += 100) {
      planner.request('coins', time, true);
    }
    expect(planner.played.coins).toBe(10);
    expect(planner.skipped.coins).toBe(150);
  });

  it('abwechslungsreich: Variante und Tonhöhe ändern sich, die Tonhöhe höchstens um pitchCents', () => {
    const planner = new SoundPlanner(SOUND_BOOK, steps([0, 0, 0.99, 0.99]));
    const first = planner.request('coins', 0, true);
    const second = planner.request('coins', 5000, true);
    expect(first?.voices[0]?.freq).not.toBe(second?.voices[0]?.freq);
    const base = SOUND_BOOK.sounds.coins.variants.flat().map((voice) => voice.freq);
    for (const voice of [...(first?.voices ?? []), ...(second?.voices ?? [])]) {
      const nearest = Math.min(...base.map((freq) => Math.abs(1200 * Math.log2(voice.freq / freq))));
      expect(nearest).toBeLessThanOrEqual(SOUND_BOOK.sounds.coins.pitchCents + 1e-6);
    }
  });

  it('ausgeschaltet klingt nichts, wird aber gezählt', () => {
    const planner = new SoundPlanner(SOUND_BOOK, steps([0.5]));
    expect(planner.request('tap', 0, false)).toBeUndefined();
    expect(planner.skipped.tap).toBe(1);
    expect(planner.played.tap).toBe(0);
    // Not playing does not start a gap.
    expect(planner.request('tap', 1, true)).toBeDefined();
  });

  it('nie mehr als maxVoices Töne zugleich', () => {
    const planner = new SoundPlanner({ ...SOUND_BOOK, maxVoices: 4 }, steps([0.5]));
    expect(planner.request('unlock', 0, true)?.voices).toHaveLength(4);
    expect(planner.request('build', 0, true)).toBeUndefined();
    expect(planner.request('build', 1000, true)).toBeDefined();
  });

  it('die Stimmen des neuen Geräuschs zählen mit: nie über maxVoices, ein Geräusch passt ganz oder gar nicht', () => {
    const book = { ...SOUND_BOOK, maxVoices: 10 };
    const planner = new SoundPlanner(book, steps([0.5]));
    const kinds = ['tap', 'path', 'error', 'build', 'moveHome', 'boat', 'demolish', 'coins', 'goodNight', 'unlock'] as const;
    let sounding = 0;
    for (const kind of kinds) {
      const sound = planner.request(kind, 0, true);
      if (sound) {
        sounding += sound.voices.length;
      }
      expect(sounding).toBeLessThanOrEqual(book.maxVoices);
    }
    // Nine tones sound; a sound of four does not fit and is left out whole.
    const longTap = { ...SOUND_BOOK.sounds.tap, gapMs: 30, variants: [[{ wave: 'sine' as const, freq: 880, dur: 5000 }]] };
    const nine = new SoundPlanner({ ...SOUND_BOOK, maxVoices: 10, sounds: { ...SOUND_BOOK.sounds, tap: longTap } }, steps([0.5]));
    for (let i = 0; i < 9; i += 1) {
      expect(nine.request('tap', i * 100, true)).toBeDefined();
    }
    expect(SOUND_BOOK.sounds.unlock.variants[0]).toHaveLength(4);
    expect(nine.request('unlock', 900, true)).toBeUndefined();
    expect(nine.skipped.unlock).toBe(1);
    expect(nine.request('tap', 1000, true)).toBeDefined();
  });

  it('die Länge eines Geräuschs reicht bis zum Ende seines letzten Tons', () => {
    const planner = new SoundPlanner(SOUND_BOOK, steps([0]));
    const sound = planner.request('goodNight', 0, true);
    expect(sound?.length).toBe(760 + 900);
  });
});
