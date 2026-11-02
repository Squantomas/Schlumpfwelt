import { describe, expect, it } from 'vitest';
import { assetsPlugin, listRasterFiles, promptKeys, rasterNames, unknownRasterFiles } from '../../scripts/assetsPlugin.mjs';
import { ASSETS } from '../../src/art/catalog';
import { chooseSource, unusedRasterFiles } from '../../src/art/source';

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

  it('warnt beim Bauen vor Dateien, deren Name kein Schlüssel ist (Tippfehler), und liefert sie trotzdem nicht als Ersatz', () => {
    const warnings: string[] = [];
    const plugin = assetsPlugin({
      list: () => ['tre-round.png', 'tree-round.png'],
      keys: () => ASSETS.map((asset) => asset.key),
    }) as unknown as { configResolved: (config: { publicDir: string }) => void; buildStart: (this: { warn: (text: string) => void }) => void };
    plugin.configResolved({ publicDir: 'public' });
    plugin.buildStart.call({ warn: (text) => warnings.push(text) });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('tre-round.png');
    expect(warnings[0]).not.toContain('tree-round.png,');
    expect(chooseSource('tree-round', ['tre-round.png'])).toMatchObject({ kind: 'svg' });
  });

  it('ohne unbekannte Dateien keine Warnung', () => {
    const warnings: string[] = [];
    const plugin = assetsPlugin({ list: () => ['tree-round.png'], keys: () => ['tree-round'] }) as unknown as {
      buildStart: (this: { warn: (text: string) => void }) => void;
    };
    plugin.buildStart.call({ warn: (text) => warnings.push(text) });
    expect(warnings).toEqual([]);
  });

  it('die Schlüssel kommen aus den Prompt-Vorlagen in docs/assets/ – genau die des Katalogs', () => {
    expect(promptKeys('docs/assets')).toEqual(ASSETS.map((asset) => asset.key).sort());
    expect(promptKeys('gibt-es-nicht')).toEqual([]);
  });

  it('dieselben unbekannten Dateien wie im Spiel (`unused` in data-assets)', () => {
    const files = ['tre-round.png', 'tree-round.png', 'tree-round.webp', 'ui-stär.png', 'bld-bakery.webp'];
    const keys = ASSETS.map((asset) => asset.key);
    expect(unknownRasterFiles(keys, files)).toEqual(unusedRasterFiles(keys, rasterNames(files)));
    expect(unknownRasterFiles(keys, files)).toEqual(['tre-round.png']);
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
