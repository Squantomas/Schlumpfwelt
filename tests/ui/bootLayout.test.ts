import { describe, expect, it } from 'vitest';
import { BOOT_DOTS, bootLayout, litDots } from '../../src/ui/bootLayout';
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

describe('Startschirm: Name sofort, ruhiger Ladepunkt, dann Titelbild und Knopf (M9, Korrekturrunde 1)', () => {
  for (const [width, height] of SCREENS) {
    it(`${String(width)}×${String(height)}: alles im Bild, beim Laden Name über Satz über Punkten`, () => {
      const layout = bootLayout({ width, height });
      const { loading } = layout;
      expect(loading.title.y).toBeLessThan(loading.hint.y - loading.hint.size / 2 - loading.title.size / 2);
      expect(loading.hint.y + loading.hint.size / 2).toBeLessThan(loading.dots.y - loading.dots.radius);
      const left = loading.dots.x - ((BOOT_DOTS - 1) / 2) * loading.dots.gap - loading.dots.radius;
      const right = loading.dots.x + ((BOOT_DOTS - 1) / 2) * loading.dots.gap + loading.dots.radius;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeLessThanOrEqual(width);
      expect(loading.dots.y + loading.dots.radius).toBeLessThanOrEqual(height);
      expect(loading.title.size).toBeGreaterThanOrEqual(34);
      expect(loading.hint.size).toBeGreaterThanOrEqual(16);

      const { ready } = layout;
      expect(ready.button.radius * 2).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
      expect(ready.button.y + ready.button.radius).toBeLessThanOrEqual(height);
      expect(ready.picture.x).toBeGreaterThanOrEqual(0);
      expect(ready.picture.x + ready.picture.w).toBeLessThanOrEqual(width + 0.001);
      expect(ready.picture.y + ready.picture.h).toBeLessThanOrEqual(height + 0.001);
    });
  }

  it('die Punkte füllen sich mit dem Fortschritt, nie mehr als alle', () => {
    expect(litDots(0, 113)).toBe(0);
    expect(litDots(57, 113)).toBe(Math.floor((57 / 113) * BOOT_DOTS));
    expect(litDots(113, 113)).toBe(BOOT_DOTS);
    expect(litDots(200, 113)).toBe(BOOT_DOTS);
    expect(litDots(5, 0)).toBe(BOOT_DOTS);
  });
});
