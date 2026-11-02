import { describe, expect, it } from 'vitest';
import { PARENT_RULES } from '../../src/data/parent';
import type { Rect } from '../../src/ui/cameraMath';
import { ONE_LINE_PAD, PAD_KEYS, PARENT_MARGIN, SOUND_KEYS, estimateWidth, parentSettingsLayout, pinPadLayout } from '../../src/ui/parentLayout';
import { t } from '../../src/data/texts';
import { MIN_TAP_SIZE } from '../../src/ui/style';

const SCREENS: readonly (readonly [number, number])[] = [
  [320, 568],
  [360, 640],
  [375, 667],
  [414, 896],
  [568, 320],
  [640, 360],
  [667, 375],
  [480, 320],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1920, 1080],
  [400, 400],
  [700, 399],
];

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width - 0.001 && b.x < a.x + a.width - 0.001 && a.y < b.y + b.height - 0.001 && b.y < a.y + a.height - 0.001;
}

function inside(inner: Rect, outer: Rect): boolean {
  return inner.x >= outer.x - 0.001 && inner.y >= outer.y - 0.001 && inner.x + inner.width <= outer.x + outer.width + 0.001 && inner.y + inner.height <= outer.y + outer.height + 0.001;
}

function check(width: number, height: number, panel: Rect, parts: readonly (readonly [string, Rect, boolean])[]): void {
  const screen: Rect = { x: 0, y: 0, width, height };
  expect(inside(panel, screen)).toBe(true);
  expect(panel.x).toBeGreaterThanOrEqual(PARENT_MARGIN - 0.001);
  expect(panel.y).toBeGreaterThanOrEqual(PARENT_MARGIN - 0.001);
  expect(panel.y + panel.height).toBeLessThanOrEqual(height - PARENT_MARGIN + 0.001);
  for (const [name, rect, tap] of parts) {
    expect(inside(rect, panel), `${name} im Feld`).toBe(true);
    if (tap) {
      expect(rect.width, `${name} breit`).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
      expect(rect.height, `${name} hoch`).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
    }
  }
  for (let i = 0; i < parts.length; i += 1) {
    for (let j = i + 1; j < parts.length; j += 1) {
      const a = parts[i];
      const b = parts[j];
      if (a && b) {
        expect(intersects(a[1], b[1]), `${a[0]} überdeckt ${b[0]}`).toBe(false);
      }
    }
  }
}

describe('Eltern-Menü: Ziffernblock und Einstellungen passen auf jeden Schirm (M8)', () => {
  for (const [width, height] of SCREENS) {
    it(`Ziffernblock ${String(width)}×${String(height)}`, () => {
      const layout = pinPadLayout(width, height);
      const keys = PAD_KEYS.filter((key) => key !== 'none').map((key) => [`Taste ${key}`, layout.keys[key], true] as const);
      check(width, height, layout.panel, [
        ['Titel', layout.title, false],
        ['✕', layout.close, true],
        ['Satz', layout.text, false],
        ['Punkte', layout.dots, false],
        ['PIN vergessen', layout.forgot, true],
        ...keys,
      ]);
      expect(layout.text.height).toBeGreaterThanOrEqual(40);
      expect(layout.text.width).toBeGreaterThanOrEqual(160);
      expect(layout.veil).toEqual({ x: 0, y: 0, width, height });
    });

    it(`Einstellungen ${String(width)}×${String(height)}`, () => {
      const layout = parentSettingsLayout(width, height, PARENT_RULES.limitChoices.length);
      expect(layout.choices).toHaveLength(6);
      check(width, height, layout.panel, [
        ['Titel', layout.title, false],
        ['✕', layout.close, true],
        ['Zeile', layout.label, false],
        ...layout.choices.map((rect, index) => [`Wahl ${String(index)}`, rect, true] as const),
        ['Satz', layout.text, false],
        ['10 Minuten mehr', layout.extra, true],
        ['PIN ändern', layout.pin, true],
        ['Tutorial', layout.tutorial, true],
        ['Musik', layout.music, true],
        ['Geräusche', layout.sfx, true],
      ]);
      expect(layout.text.height).toBeGreaterThanOrEqual(40);
      // M9: "Musik aus" and "Geräusche aus" need room for their words (on small screens in two lines).
      expect(layout.music.width).toBeGreaterThanOrEqual(80);
      expect(layout.sfx.width).toBe(layout.music.width);
      // Side by side – or, where that is too narrow for one line (Korrekturrunde 2), the noises under the music.
      expect(layout.sfx.y === layout.music.y || layout.sfx.y > layout.music.y + layout.music.height).toBe(true);
      // Korrekturrunde 1: the row of the sound does not stick to the bottom – below it as much frame as above the title,
      // and it is as high as the buttons above it.
      const top = layout.close.y - layout.panel.y;
      const bottom = layout.panel.y + layout.panel.height - (layout.music.y + layout.music.height);
      expect(bottom).toBeGreaterThanOrEqual(top - 0.001);
      expect(layout.music.height).toBeCloseTo(layout.tutorial.height);
      expect(layout.music.y - (layout.tutorial.y + layout.tutorial.height)).toBeCloseTo(layout.tutorial.y - (layout.pin.y + layout.pin.height));
    });
  }

  for (const [width, height] of SCREENS) {
    it(`${String(width)}×${String(height)}: „Musik an/aus“ und „Geräusche an/aus“ in einer Zeile, mindestens 14 px, wie „PIN ändern“ (Korrekturrunde 2)`, () => {
      const layout = parentSettingsLayout(width, height, PARENT_RULES.limitChoices.length);
      expect(layout.soundFont).toBeGreaterThanOrEqual(14);
      expect(layout.soundFont).toBeLessThanOrEqual(layout.buttonFont);
      for (const key of SOUND_KEYS) {
        // Estimated with 0.58 em per letter (measured: 0.48–0.56) plus the outline.
        expect(estimateWidth(t(key), layout.soundFont) + 2 * ONE_LINE_PAD, `${key} ${String(layout.soundFont)} px`).toBeLessThanOrEqual(layout.music.width + 0.001);
      }
      expect(estimateWidth(t('parent.changePin'), layout.soundFont) + 2 * ONE_LINE_PAD).toBeLessThanOrEqual(layout.pin.width + 0.001);
    });
  }

  it('auf 568×320 bleibt das Feld wie es war, nur die Schrift der rechten Spalte ist gemeinsam', () => {
    const layout = parentSettingsLayout(568, 320, 6);
    expect(layout.music.width).toBeCloseTo(122, 0);
    expect(layout.soundFont).toBe(14);
  });

  it('auf dem quer gehaltenen Handy stehen die Tasten rechts', () => {
    const low = pinPadLayout(568, 320);
    expect(low.low).toBe(true);
    expect(low.keys['1'].x).toBeGreaterThan(low.text.x + low.text.width);
    const tall = pinPadLayout(320, 568);
    expect(tall.low).toBe(false);
    expect(tall.keys['1'].y).toBeGreaterThan(tall.dots.y);
    expect(parentSettingsLayout(568, 320, 6).low).toBe(true);
    expect(parentSettingsLayout(1024, 768, 6).low).toBe(false);
    // M9: the phone held upright keeps the one-column panel with the row of the sound.
    expect(parentSettingsLayout(320, 568, 6).low).toBe(false);
  });

  it('die Tasten sind auf dem Tablet groß (mindestens 64 px hoch)', () => {
    expect(pinPadLayout(1024, 768).keys['5'].height).toBeGreaterThanOrEqual(64);
    expect(pinPadLayout(768, 1024).keys['5'].height).toBeGreaterThanOrEqual(64);
  });
});
