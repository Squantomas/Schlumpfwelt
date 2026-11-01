/**
 * Where a picture comes from (M9): a raster file in `public/assets/` with the key as its name replaces the SVG drawn
 * by the game – `<key>.webp` first, then `<key>.png`. The list of files there is known when the game is built
 * (`scripts/assetsPlugin.mjs`), so the game never asks the server for a file that does not exist (no 404).
 */

/** File endings a raster replacement may have, the preferred one first. */
export const RASTER_TYPES = ['webp', 'png'] as const;

export type AssetSource = { readonly kind: 'svg' } | { readonly kind: 'raster'; readonly file: string; readonly url: string };

/** The folder of the raster files, relative to the base of the game (never with a leading `/`). */
export const RASTER_FOLDER = 'assets/';

/** The source of `key`, given the file names (not paths) in `public/assets/`. */
export function chooseSource(key: string, files: Iterable<string>): AssetSource {
  const names = new Set(files);
  for (const type of RASTER_TYPES) {
    const file = `${key}.${type}`;
    if (names.has(file)) {
      return { kind: 'raster', file, url: `${RASTER_FOLDER}${encodeURIComponent(file)}` };
    }
  }
  return { kind: 'svg' };
}

/** The raster files that replace no picture (a typo in a file name): reported so they can be renamed. */
export function unusedRasterFiles(keys: Iterable<string>, files: Iterable<string>): string[] {
  const known = new Set<string>();
  for (const key of keys) {
    for (const type of RASTER_TYPES) {
      known.add(`${key}.${type}`);
    }
  }
  return [...files].filter((file) => RASTER_TYPES.some((type) => file.endsWith(`.${type}`)) && !known.has(file)).sort();
}

/** An SVG document as a `data:` address an `Image` can load (no request to the server). */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export interface PlannedAsset {
  readonly key: string;
  /** Size of the texture in pixels (logical size × scale): a raster file is drawn into this size, whatever its own. */
  readonly width: number;
  readonly height: number;
  readonly source: AssetSource;
}

/** What to load for each picture: its texture size and where it comes from. */
export function planAssets(
  assets: readonly { readonly key: string; readonly width: number; readonly height: number; readonly scale: number }[],
  files: readonly string[],
): PlannedAsset[] {
  return assets.map((asset) => ({
    key: asset.key,
    width: Math.round(asset.width * asset.scale),
    height: Math.round(asset.height * asset.scale),
    source: chooseSource(asset.key, files),
  }));
}

/** The test hook `<html data-assets>`: how many pictures come from SVG and from raster files, per key, and what failed. */
export function assetReport(loaded: readonly { readonly key: string; readonly kind: 'svg' | 'raster' }[], failed: readonly string[], ms: number): string {
  const keys: Record<string, 'svg' | 'raster'> = {};
  for (const { key, kind } of loaded) {
    keys[key] = kind;
  }
  return JSON.stringify({
    svg: loaded.filter((asset) => asset.kind === 'svg').length,
    raster: loaded.filter((asset) => asset.kind === 'raster').length,
    failed,
    ms: Math.round(ms),
    keys,
  });
}
