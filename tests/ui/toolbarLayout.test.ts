import { describe, expect, it } from 'vitest';
import { MIN_TAP_SIZE } from '../../src/ui/style';
import { TOOLBAR_EDGE, TOOLBAR_GAP, TOOLBAR_PAD, isComfortable, toolbarLayout } from '../../src/ui/toolbarLayout';

function widthOf(width: number, count: number): number {
  const { size, cols } = toolbarLayout(width, count);
  return cols * size + (cols - 1) * TOOLBAR_GAP + 2 * TOOLBAR_PAD + 2 * TOOLBAR_EDGE;
}

describe('toolbarLayout', () => {
  it.each([5, 6, 7])('passt mit %i Werkzeugen von 320 bis 1920 px ins Bild, Knöpfe ≥ 56 px', (count) => {
    for (const width of [320, 340, 360, 375, 390, 414, 480, 600, 768, 1024, 1280, 1920]) {
      const layout = toolbarLayout(width, count);
      expect(widthOf(width, count), `${String(count)} Werkzeuge bei ${String(width)} px`).toBeLessThanOrEqual(width + 0.001);
      expect(layout.size).toBeGreaterThanOrEqual(56);
      expect(layout.size).toBeGreaterThanOrEqual(MIN_TAP_SIZE);
      expect(layout.cols * layout.rows).toBeGreaterThanOrEqual(count);
    }
  });

  it('nimmt auf dem Tablet eine Reihe mit großen Knöpfen', () => {
    const layout = toolbarLayout(1024, 5);
    expect(layout).toEqual({ size: 96, cols: 5, rows: 1 });
    expect(isComfortable(layout)).toBe(true);
  });

  it('schrumpft auf 56–64 px, bevor es umbricht', () => {
    const layout = toolbarLayout(360, 5);
    expect(layout.rows).toBe(1);
    expect(layout.size).toBeGreaterThanOrEqual(56);
    expect(layout.size).toBeLessThan(64);
  });

  it('bricht bei 6 Werkzeugen auf 320 px in zwei Reihen um', () => {
    const layout = toolbarLayout(320, 6);
    expect(layout.rows).toBe(2);
    expect(layout.cols).toBe(3);
    expect(layout.size).toBeGreaterThanOrEqual(64);
  });
});
