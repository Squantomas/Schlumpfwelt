import { describe, expect, it } from 'vitest';
import { MAX_RENDER_PIXELS, MAX_RENDER_SCALE, MIN_RENDER_SCALE, computeRenderScale } from '../../src/ui/renderScale';

describe('computeRenderScale', () => {
  it('folgt dem devicePixelRatio', () => {
    expect(computeRenderScale(1, 1280, 800)).toBe(1);
    expect(computeRenderScale(1.5, 1280, 800)).toBe(1.5);
    expect(computeRenderScale(2, 1024, 768)).toBe(2);
  });

  it('rendert höchstens doppelt so fein', () => {
    expect(MAX_RENDER_SCALE).toBe(2);
    expect(computeRenderScale(3, 390, 844)).toBe(2);
  });

  it('bleibt im Pixel-Budget', () => {
    const scale = computeRenderScale(2, 2560, 1440);
    expect(scale).toBeLessThan(2);
    expect(2560 * scale * 1440 * scale).toBeLessThanOrEqual(MAX_RENDER_PIXELS);
  });

  it('geht nie unter die Untergrenze', () => {
    expect(computeRenderScale(0.25, 800, 600)).toBe(MIN_RENDER_SCALE);
    expect(computeRenderScale(1, 20000, 20000)).toBe(MIN_RENDER_SCALE);
  });

  it('nimmt 1 bei ungültigem devicePixelRatio', () => {
    expect(computeRenderScale(Number.NaN, 800, 600)).toBe(1);
    expect(computeRenderScale(0, 800, 600)).toBe(1);
    expect(computeRenderScale(-2, 800, 600)).toBe(1);
  });

  it('kommt mit Größe 0 zurecht', () => {
    expect(computeRenderScale(2, 0, 0)).toBe(2);
  });
});
