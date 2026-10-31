import { describe, expect, it } from 'vitest';
import { pickerLayout, PICKER_ARROW } from '../../src/ui/pickerLayout';
import { toolbarLayout, TOOLBAR_EDGE, TOOLBAR_GAP, TOOLBAR_PAD } from '../../src/ui/toolbarLayout';

/** Oberkante der Werkzeugleiste und Unterkante der Hinweisleiste für eine Bildschirmgröße (wie in BuildUI). */
function bands(width: number, height: number, tools = 5): { top: number; bottom: number } {
  const { size, rows } = toolbarLayout(width, tools, height);
  const panelH = rows * size + (rows - 1) * TOOLBAR_GAP + 2 * TOOLBAR_PAD;
  const toolbarTop = height - TOOLBAR_EDGE - panelH;
  return { top: 12 + 72 + 8, bottom: toolbarTop - 8 };
}

const SCREENS: readonly (readonly [number, number])[] = [
  [320, 568],
  [568, 320],
  [360, 640],
  [640, 360],
  [375, 667],
  [667, 375],
  [768, 1024],
  [1024, 768],
  [1280, 800],
];

describe('pickerLayout', () => {
  it.each(SCREENS)('passt bei %i×%i für 3 und 6 Varianten ins Bild, unter die Hinweisleiste und über die Werkzeugleiste', (width, height) => {
    const { top, bottom } = bands(width, height);
    for (const count of [3, 6]) {
      const layout = pickerLayout(width, count, top, bottom);
      const { rect } = layout;
      expect(rect.x, `${String(count)} Varianten`).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width + 0.001);
      expect(rect.y).toBeGreaterThanOrEqual(top - 0.001);
      expect(rect.y + rect.height).toBeLessThanOrEqual(bottom + 0.001);
      expect(layout.cellH).toBeGreaterThanOrEqual(64);
      expect(layout.cols * layout.rows * layout.pages).toBeGreaterThanOrEqual(count);
    }
  });

  it('zeigt auf dem Tablet alle Varianten ohne Blättern', () => {
    const { top, bottom } = bands(1024, 768);
    const layout = pickerLayout(1024, 6, top, bottom);
    expect(layout.paged).toBe(false);
    expect(layout.rows).toBe(1);
  });

  it('wird auf einem quer gehaltenen Handy einzeilig mit großen Pfeilen und mehreren Seiten', () => {
    const { top, bottom } = bands(568, 320);
    const layout = pickerLayout(568, 6, top, bottom);
    expect(layout.paged).toBe(true);
    expect(layout.rows).toBe(1);
    expect(layout.pages).toBeGreaterThan(1);
    expect(layout.perPage * layout.pages).toBeGreaterThanOrEqual(6);
    expect(PICKER_ARROW).toBeGreaterThanOrEqual(48);
  });

  it('bleibt bei wenigen Varianten (3 Häuser) ohne Blättern, wo es passt', () => {
    const { top, bottom } = bands(1024, 768);
    expect(pickerLayout(1024, 3, top, bottom).paged).toBe(false);
  });

  it('nimmt auf einem hochkant gehaltenen Handy mehrere Zeilen', () => {
    const { top, bottom } = bands(320, 568);
    const layout = pickerLayout(320, 6, top, bottom);
    expect(layout.rows).toBeGreaterThanOrEqual(2);
  });
});

describe('Werkzeugleiste bei geringer Höhe', () => {
  it('lässt auf 568×320 mehr als die Hälfte der Höhe frei', () => {
    const { size, rows } = toolbarLayout(568, 5, 320);
    const panelH = rows * size + (rows - 1) * TOOLBAR_GAP + 2 * TOOLBAR_PAD + TOOLBAR_EDGE;
    expect(panelH).toBeLessThan(160);
    expect(size).toBeGreaterThanOrEqual(56);
  });
});
