import { describe, expect, it } from 'vitest';
import type { PlannedAsset } from '../../../src/art/source';
import { fetchPicture, type PictureReader } from '../../../src/scenes/art/fetchPicture';

const raster: PlannedAsset = { key: 'ui-star', width: 2, height: 2, source: { kind: 'raster', file: 'ui-star.png', url: 'assets/ui-star.png' } };
const svg: PlannedAsset = { key: 'ui-star', width: 2, height: 2, source: { kind: 'svg' } };

function reader(options: { readonly rasterOk?: boolean; readonly svgThrows?: boolean; readonly svgLoadFails?: boolean }): PictureReader<string> & { warnings: unknown[] } {
  const warnings: unknown[] = [];
  return {
    warnings,
    load: (url) => {
      if (url.startsWith('assets/')) {
        return options.rasterOk === true ? Promise.resolve(`bild:${url}`) : Promise.reject(new Error('kaputt'));
      }
      return options.svgLoadFails === true ? Promise.reject(new Error('svg kaputt')) : Promise.resolve(`bild:${url}`);
    },
    svgUrl: (key) => {
      if (options.svgThrows === true) {
        throw new Error('SVG nicht geschrieben');
      }
      return `data:${key}`;
    },
    warn: (...what) => {
      warnings.push(...what);
    },
  };
}

describe('Bild lesen (M9, Korrekturrunde 3): fetchPicture lehnt nie ab', () => {
  it('eine lesbare Rasterdatei wird genommen', async () => {
    expect(await fetchPicture(raster, reader({ rasterOk: true }))).toEqual({ image: 'bild:assets/ui-star.png', kind: 'raster' });
  });

  it('eine kaputte Rasterdatei fällt auf das SVG zurück und wird genannt', async () => {
    const read = reader({});
    expect(await fetchPicture(raster, read)).toEqual({ image: 'bild:data:ui-star', kind: 'svg', rasterFailed: 'ui-star.png' });
    expect(read.warnings).toHaveLength(1);
  });

  it('wirft das Schreiben des SVG im Rückfall, kommt trotzdem ein Ergebnis (ohne Bild)', async () => {
    const read = reader({ svgThrows: true });
    await expect(fetchPicture(raster, read)).resolves.toEqual({ image: undefined, kind: 'svg', rasterFailed: 'ui-star.png' });
    expect(read.warnings).toHaveLength(2);
  });

  it('auch ohne Rasterdatei: Schreib- oder Lesefehler des SVG ergeben ein Ergebnis ohne Bild', async () => {
    await expect(fetchPicture(svg, reader({ svgThrows: true }))).resolves.toEqual({ image: undefined, kind: 'svg' });
    await expect(fetchPicture(svg, reader({ svgLoadFails: true }))).resolves.toEqual({ image: undefined, kind: 'svg' });
    await expect(fetchPicture(raster, reader({ svgLoadFails: true }))).resolves.toEqual({ image: undefined, kind: 'svg', rasterFailed: 'ui-star.png' });
  });
});
