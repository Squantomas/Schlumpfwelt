import { describe, expect, it } from 'vitest';
import { assetReport, chooseSource, planAssets, svgDataUrl, unusedRasterFiles } from '../../src/art/source';

describe('Rasterbild oder SVG (M9)', () => {
  it('ohne Datei bleibt das gezeichnete SVG', () => {
    expect(chooseSource('tree-round', [])).toEqual({ kind: 'svg' });
    expect(chooseSource('tree-round', ['tree-pine.png', 'tree-round.jpg', 'tree-round.png.bak'])).toEqual({ kind: 'svg' });
  });

  it('eine PNG-Datei mit dem Schlüssel als Namen ersetzt das Bild, relativ geladen', () => {
    expect(chooseSource('tree-round', ['tree-round.png'])).toEqual({ kind: 'raster', file: 'tree-round.png', url: 'assets/tree-round.png' });
  });

  it('WebP geht vor PNG', () => {
    expect(chooseSource('bld-market', ['bld-market.png', 'bld-market.webp'])).toMatchObject({ kind: 'raster', file: 'bld-market.webp' });
  });

  it('die Adresse beginnt nie mit einem Schrägstrich (das Spiel liegt unter einem Unterpfad)', () => {
    const source = chooseSource('ui-star', ['ui-star.png']);
    expect(source.kind === 'raster' && source.url.startsWith('/')).toBe(false);
  });

  it('Dateien, die zu keinem Schlüssel passen, werden gemeldet', () => {
    expect(unusedRasterFiles(['tree-round', 'ui-star'], ['tree-round.png', 'tre-round.png', 'notes.txt', 'ui-star.webp'])).toEqual(['tre-round.png']);
  });

  it('der Plan nennt die Texturgröße (logisch × Maßstab) und die Quelle', () => {
    const plan = planAssets(
      [
        { key: 'a', width: 40, height: 68, scale: 2 },
        { key: 'b', width: 128, height: 128, scale: 1 },
      ],
      ['b.png'],
    );
    expect(plan).toEqual([
      { key: 'a', width: 80, height: 136, source: { kind: 'svg' } },
      { key: 'b', width: 128, height: 128, source: { kind: 'raster', file: 'b.png', url: 'assets/b.png' } },
    ]);
  });

  it('das SVG wird als data:-Adresse geladen (keine Anfrage an den Server)', () => {
    const url = svgDataUrl('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><circle cx="1" cy="1" r="1" fill="#ff0000"/></svg>');
    expect(url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decodeURIComponent(url.slice(url.indexOf(',') + 1))).toContain('fill="#ff0000"');
    expect(url).not.toContain('#');
  });

  it('der Bericht für data-assets zählt SVG und Raster, nennt jeden Schlüssel, kaputte und unbenutzte Rasterdateien', () => {
    const report = JSON.parse(
      assetReport({
        loaded: [
          { key: 'a', kind: 'svg' },
          { key: 'b', kind: 'raster' },
        ],
        failed: ['c'],
        rasterFailed: ['a.png'],
        unused: ['tre-round.png'],
        ms: 12.4,
      }),
    ) as unknown;
    expect(report).toEqual({ svg: 1, raster: 1, failed: ['c'], rasterFailed: ['a.png'], unused: ['tre-round.png'], ms: 12, keys: { a: 'svg', b: 'raster' } });
  });
});
