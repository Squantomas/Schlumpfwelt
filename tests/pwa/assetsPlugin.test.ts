import { describe, expect, it } from 'vitest';
import { assetsPlugin, listRasterFiles, rasterNames } from '../../scripts/assetsPlugin.mjs';
import { ASSETS } from '../../src/art/catalog';
import { chooseSource } from '../../src/art/source';

/** What lies in public/assets/ in the repository (seen by Vite, the same list the build makes). */
const inRepo = Object.keys(import.meta.glob('/public/assets/*', { query: '?url' })).map((path) => path.replace('/public/assets/', ''));

describe('Raster-Dateien: die Liste entsteht beim Bauen (M9)', () => {
  it('nimmt nur Namen, die ein Schlüssel haben kann: klein, Ziffern, Bindestrich, .png oder .webp', () => {
    expect(rasterNames(['bld-bakery.webp', '.gitkeep', 'Tree.PNG', 'a b.png', 'path-3.png', 'notes.txt', 'ui-star.jpg', 'resident-red.png'])).toEqual([
      'bld-bakery.webp',
      'path-3.png',
      'resident-red.png',
    ]);
  });

  it('liest den Ordner public/assets/ (fehlt er, ist die Liste leer)', () => {
    expect(listRasterFiles('public')).toEqual(rasterNames(inRepo));
    expect(listRasterFiles('does-not-exist')).toEqual([]);
  });

  it('bietet die Liste als Modul virtual:raster-assets an', () => {
    const plugin = assetsPlugin() as unknown as {
      configResolved: (config: { publicDir: string }) => void;
      resolveId: (id: string) => string | undefined;
      load: (id: string) => string | undefined;
    };
    plugin.configResolved({ publicDir: 'does-not-exist' });
    const resolved = plugin.resolveId('virtual:raster-assets');
    expect(resolved).toBeDefined();
    expect(plugin.resolveId('./other')).toBeUndefined();
    expect(plugin.load(resolved ?? '')).toBe('export default [];');
    expect(plugin.load('other')).toBeUndefined();
  });

  it('jede Datei im Repository gehört zu einem Schlüssel des Katalogs (keine verwaisten Bilder)', () => {
    const keys = new Set(ASSETS.map((asset) => asset.key));
    for (const name of rasterNames(inRepo)) {
      expect(keys.has(name.replace(/\.(png|webp)$/, '')), name).toBe(true);
    }
  });

  it('eine Datei im Ordner ersetzt das gezeichnete Bild ihres Schlüssels', () => {
    const files = rasterNames(['bld-bakery.png', 'bld-bakery.webp', 'tree-round.png']);
    expect(chooseSource('bld-bakery', files)).toMatchObject({ kind: 'raster' });
    expect(chooseSource('tree-pine', files)).toMatchObject({ kind: 'svg' });
  });
});
