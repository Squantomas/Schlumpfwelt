import { describe, expect, it } from 'vitest';
import { SOUND_BOOK, SOUND_KINDS, checkSoundBook, midiToHz, shiftCents } from '../../src/audio/recipes';

describe('Klang-Rezepte (M9)', () => {
  it('sounds.json ist in Ordnung: jede Art da, Lautstärken zwischen 0 und 1, hörbare Frequenzen', () => {
    expect(checkSoundBook(SOUND_BOOK)).toEqual([]);
    expect(Object.keys(SOUND_BOOK.sounds).sort()).toEqual([...SOUND_KINDS].sort());
  });

  it('die Prüfung findet Fehler', () => {
    const broken = { ...SOUND_BOOK, volume: { ...SOUND_BOOK.volume, master: 2 }, sounds: { ...SOUND_BOOK.sounds, tap: { ...SOUND_BOOK.sounds.tap, variants: [] } } };
    expect(checkSoundBook(broken)).toEqual(expect.arrayContaining([expect.stringContaining('volume.master'), expect.stringContaining('tap: keine Variante')]));
  });

  it('leise: Taler sind leiser als Bauen und kommen höchstens alle 1,6 s', () => {
    expect(SOUND_BOOK.sounds.coins.gain).toBeLessThan(SOUND_BOOK.sounds.build.gain);
    expect(SOUND_BOOK.sounds.coins.gapMs).toBeGreaterThanOrEqual(1500);
    expect(SOUND_BOOK.volume.master).toBeLessThanOrEqual(0.6);
    expect(SOUND_BOOK.volume.music).toBeLessThan(SOUND_BOOK.volume.sfx);
  });

  it('Töne: A4 = 440 Hz, 1200 Cent = eine Oktave', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(81)).toBeCloseTo(880);
    expect(shiftCents(440, 1200)).toBeCloseTo(880);
    expect(shiftCents(440, -100)).toBeCloseTo(415.3, 1);
  });
});
