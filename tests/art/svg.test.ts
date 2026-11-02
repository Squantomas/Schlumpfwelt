import { describe, expect, it } from 'vitest';
import { Svg, circle, darker, hex, lighter, mix, outlineOf, rect, wrapped } from '../../src/art/svg';
import { STYLE } from '../../src/ui/style';

describe('SVG-Bausteine (M9)', () => {
  it('Farben: hex, mischen, dunkler zur Linienfarbe, heller zum warmen Licht', () => {
    expect(hex(0x00ff7f)).toBe('#00ff7f');
    expect(mix(0x000000, 0xffffff, 0.5)).toBe(0x808080);
    expect(darker(0xffffff, 1)).toBe(STYLE.ink);
    expect(lighter(0x000000, 1)).toBe(STYLE.light);
    expect(outlineOf(0xffffff)).toBe(darker(0xffffff, STYLE.outlineMix));
  });

  it('Umriss unter der Füllung: doppelte Breite und paint-order, sonst einfach', () => {
    expect(circle(1, 2, 3, { fill: 0xff0000, stroke: true, width: 2 })).toContain('stroke-width="4"');
    expect(circle(1, 2, 3, { fill: 0xff0000, stroke: true, width: 2 })).toContain('paint-order="stroke"');
    expect(circle(1, 2, 3, { stroke: 0xff0000, width: 2, under: false })).toContain('stroke-width="2"');
    expect(rect(0, 0, 10, 4, 9, { fill: 0 })).toContain('rx="2"');
  });

  it('ein Dokument hat logische Größe als viewBox und die Texturgröße als Breite und Höhe', () => {
    const s = new Svg(40, 68);
    s.add(circle(20, 20, 5, { fill: s.vertical(0xffffff, 0x000000) }));
    const text = s.toString(2);
    expect(text).toContain('width="80" height="136" viewBox="0 0 40 68"');
    expect(text).toContain('<linearGradient id="g0"');
  });

  it('eingesetzte Bilder behalten eigene Verläufe ohne doppelte Namen', () => {
    const s = new Svg(100, 100);
    s.vertical(0, 0);
    const a = s.inner(10, 10);
    a.vertical(0, 0);
    const b = s.inner(10, 10);
    b.vertical(0, 0);
    s.place(a, 0, 0).place(b, 50, 50, 2);
    const ids = [...s.toString().matchAll(/ id="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(s.toString()).toContain('translate(50 50) scale(2)');
  });

  it('nahtlose Muster: was über den Rand ragt, kommt auf der anderen Seite noch einmal', () => {
    const parts = wrapped(2, 64, 4, 128, (x, y) => `${String(x)},${String(y)};`);
    expect(parts).toBe('2,64;130,64;');
    expect(wrapped(64, 64, 4, 128, (x, y) => `${String(x)},${String(y)};`)).toBe('64,64;');
  });
});
