import { describe, expect, it } from 'vitest';
import { WORLD_TAP_PAUSE_MS, worldTapIgnored } from '../../src/ui/tapPause';

describe('worldTapIgnored (Doppeltipp auf ✓/✕)', () => {
  it('ignoriert einen Welt-Tipp kurz nach einem Tipp auf einen Knopf', () => {
    expect(worldTapIgnored(1100, 1000)).toBe(true);
    expect(worldTapIgnored(1000, 1000)).toBe(true);
    expect(worldTapIgnored(1000 + WORLD_TAP_PAUSE_MS - 1, 1000)).toBe(true);
  });

  it('lässt Welt-Tipps nach der Pause wieder zu', () => {
    expect(worldTapIgnored(1000 + WORLD_TAP_PAUSE_MS, 1000)).toBe(false);
    expect(worldTapIgnored(5000, 1000)).toBe(false);
  });

  it('ignoriert nichts, solange noch nie ein Knopf getippt wurde', () => {
    expect(worldTapIgnored(10, Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it('ignoriert keinen Tipp, der vor dem Knopf-Tipp lag', () => {
    expect(worldTapIgnored(900, 1000)).toBe(false);
  });

  it('wählt die Pause kürzer als eine halbe Sekunde, damit normales Spielen nicht stockt', () => {
    expect(WORLD_TAP_PAUSE_MS).toBeGreaterThanOrEqual(200);
    expect(WORLD_TAP_PAUSE_MS).toBeLessThanOrEqual(500);
  });
});
