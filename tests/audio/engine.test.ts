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

  it('Musik wird vorausgeplant; am Abend spielt sie weiter und blendet über 5 s aus, nachts keine Töne', () => {
    const fake = fakeContext();
    const engine = new AudioEngine(SOUND_BOOK, () => fake.context);
    engine.unlock();
    engine.update();
    const afterDay = fake.started.length;
    expect(afterDay).toBeGreaterThan(0);
    expect(describeOf(engine).musicPlaying).toBe(true);
    const musicBus = fake.gains[2]?.gain;
    expect(musicBus?.value).toBe(SOUND_BOOK.volume.music);

    fake.setTime(10);
    engine.setMode('dusk');
    // The bus falls to 0 over the whole evening fade, not at once.
    expect(musicBus?.ramps.at(-1)).toEqual([0, 10 + SOUND_BOOK.fadeMs.dusk / 1000]);
    // Frame by frame through the first half of the fade: the loop goes on.
    const notesBefore = describeOf(engine).musicNotes as number;
    for (let time = 10; time < 10 + SOUND_BOOK.fadeMs.dusk / 2000; time += 0.1) {
      fake.setTime(time);
      engine.update();
    }
    expect(describeOf(engine).musicNotes as number).toBeGreaterThan(notesBefore + 2);
    expect(describeOf(engine)).toMatchObject({ mode: 'dusk', musicPlaying: true });

    // After the fade nothing new is planned (it would be silent anyway).
    fake.setTime(10 + SOUND_BOOK.fadeMs.dusk / 1000 + 0.5);
    engine.update();
    const afterFade = fake.started.length;
    fake.setTime(20);
    engine.update();
    expect(fake.started.length).toBe(afterFade);
    expect(describeOf(engine).musicPlaying).toBe(false);

    engine.setMode('night');
    fake.setTime(30);
    engine.update();
    expect(fake.started.length).toBe(afterFade);
    expect(describeOf(engine)).toMatchObject({ mode: 'night', musicPlaying: false, musicGain: 0 });

    engine.setMode('day');
    expect(musicBus?.ramps.at(-1)).toEqual([SOUND_BOOK.volume.music, 30 + SOUND_BOOK.fadeMs.wake / 1000]);
    fake.setTime(40);
    engine.update();
    expect(fake.started.length).toBeGreaterThan(afterFade);
  });

  it('springt die Nacht ohne Abend an (Laden in der Nacht), gibt es keine Musik', () => {
    const fake = fakeContext();
    const engine = new AudioEngine(SOUND_BOOK, () => fake.context);
    engine.setMode('night');
    engine.unlock();
    engine.update();
    expect(fake.started).toHaveLength(0);
  });

  it('ein vom Tablet angehaltenes oder unterbrochenes Audio startet beim nächsten Tipp wieder – nur mit Ton an', () => {
    const fake = fakeContext();
    const engine = new AudioEngine(SOUND_BOOK, () => fake.context);
    engine.unlock();
    const resumes = (): number => fake.calls.filter((call) => call === 'resume').length;
    const first = resumes();
    engine.resumeIfNeeded();
    expect(resumes()).toBe(first);
    fake.setState('interrupted');
    engine.resumeIfNeeded();
    expect(resumes()).toBe(first + 1);
    expect(describeOf(engine).state).toBe('running');
    fake.setState('suspended');
    engine.setSwitches({ on: false, music: true, sfx: true });
    engine.resumeIfNeeded();
    expect(resumes()).toBe(first + 1);
    engine.setSwitches({ on: true, music: true, sfx: true });
    engine.resumeIfNeeded();
    expect(resumes()).toBe(first + 2);
  });

  it('vor dem Start-Tipp weckt ein Tipp nichts (das bleibt der Start-Tipp)', () => {
    const fake = fakeContext();
    const engine = new AudioEngine(SOUND_BOOK, () => fake.context);
    engine.resumeIfNeeded();
    expect(fake.calls).toHaveLength(0);
    expect(describeOf(engine).state).toBe('locked');
  });

  it('ein altes Fenster („Hier weiterspielen“) wird für immer still', () => {
    const fake = fakeContext();
    const engine = new AudioEngine(SOUND_BOOK, () => fake.context);
    engine.unlock();
    engine.update();
    engine.silence();
    expect(fake.calls.at(-1)).toBe('suspend');
    expect(fake.gains[0]?.gain.value).toBe(0);
    const before = fake.started.length;
    engine.play('tap', 5000);
    fake.setTime(30);
    engine.update();
    engine.resumeIfNeeded();
    engine.unlock();
    expect(fake.started.length).toBe(before);
    expect(fake.calls.at(-1)).toBe('suspend');
    expect(describeOf(engine)).toMatchObject({ state: 'silenced', musicPlaying: false });
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
