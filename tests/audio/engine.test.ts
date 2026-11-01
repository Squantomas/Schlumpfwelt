import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../../src/audio/engine';
import { SOUND_BOOK } from '../../src/audio/recipes';
import { fakeContext } from './fakeContext';

function describeOf(engine: AudioEngine): Record<string, unknown> {
  return JSON.parse(engine.describe()) as Record<string, unknown>;
}

describe('Ton-Maschine ohne echtes AudioContext (M9)', () => {
  it('ohne Web Audio: still, kein Fehler, Zustand „none“', () => {
    const engine = new AudioEngine(SOUND_BOOK, () => undefined);
    engine.unlock();
    engine.play('tap', 0);
    engine.update();
    engine.setHidden(true);
    engine.setMode('night');
    expect(describeOf(engine)).toMatchObject({ state: 'none', musicPlaying: false });
  });

  it('wirft das AudioContext beim Anlegen, bleibt das Spiel still', () => {
    const engine = new AudioEngine(SOUND_BOOK, () => {
      throw new Error('kein Ton');
    });
    expect(() => {
      engine.unlock();
    }).not.toThrow();
    expect(describeOf(engine).state).toBe('none');
  });

  it('vor dem ersten Tipp gesperrt und still; danach läuft es', () => {
    const fake = fakeContext();
    const engine = new AudioEngine(SOUND_BOOK, () => fake.context);
    engine.play('tap', 0);
    expect(fake.started).toHaveLength(0);
    expect(describeOf(engine).state).toBe('locked');
    engine.unlock();
    expect(fake.calls).toContain('resume');
    expect(describeOf(engine).state).toBe('running');
    engine.play('tap', 100);
    expect(fake.started.length).toBeGreaterThan(0);
    expect(describeOf(engine)).toMatchObject({ played: { tap: 1 }, skipped: { tap: 1 } });
  });

  it('Musik wird vorausgeplant, solange es Tag ist; am Abend und in der Nacht keine neuen Töne', () => {
    const fake = fakeContext();
    const engine = new AudioEngine(SOUND_BOOK, () => fake.context);
    engine.unlock();
    engine.update();
    const afterDay = fake.started.length;
    expect(afterDay).toBeGreaterThan(0);
    expect(describeOf(engine).musicPlaying).toBe(true);
    engine.setMode('dusk');
    fake.setTime(10);
    engine.update();
    expect(fake.started.length).toBe(afterDay);
    engine.setMode('night');
    expect(describeOf(engine)).toMatchObject({ mode: 'night', musicPlaying: false });
    engine.setMode('day');
    fake.setTime(20);
    engine.update();
    expect(fake.started.length).toBeGreaterThan(afterDay);
  });

  it('eine versteckte Seite ist sofort still und spielt nichts nach', () => {
    const fake = fakeContext();
    const engine = new AudioEngine(SOUND_BOOK, () => fake.context);
    engine.unlock();
    engine.setHidden(true);
    expect(fake.calls).toContain('suspend');
    const before = fake.started.length;
    engine.play('build', 1000);
    fake.setTime(30);
    engine.update();
    expect(fake.started.length).toBe(before);
    expect(describeOf(engine)).toMatchObject({ state: 'hidden', musicPlaying: false });
    engine.setHidden(false);
    expect(fake.calls.at(-1)).toBe('resume');
  });

  it('Ton aus: keine Geräusche und keine Musik; nur Musik aus: Geräusche klingen weiter', () => {
    const fake = fakeContext();
    const engine = new AudioEngine(SOUND_BOOK, () => fake.context);
    engine.unlock();
    engine.setSwitches({ on: false, music: true, sfx: true });
    engine.play('build', 0);
    engine.update();
    expect(fake.started).toHaveLength(0);
    engine.setSwitches({ on: true, music: false, sfx: true });
    engine.play('build', 1000);
    expect(fake.started.length).toBeGreaterThan(0);
    const noises = fake.started.length;
    engine.update();
    expect(fake.started.length).toBe(noises);
    engine.setSwitches({ on: true, music: true, sfx: false });
    engine.play('build', 2000);
    expect(fake.started.length).toBe(noises);
    expect(describeOf(engine)).toMatchObject({ on: true, music: true, sfx: false });
  });
});
