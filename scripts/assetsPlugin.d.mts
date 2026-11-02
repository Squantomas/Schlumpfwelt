import type { Plugin } from 'vite';

/** The names a raster file of a key can have, sorted. */
export function rasterNames(names: readonly string[]): string[];

/** The raster files (`*.png`, `*.webp` with a key as name) in `<publicDir>/assets/`, sorted. */
export function listRasterFiles(publicDir: string): string[];

/** The keys of all pictures, from the headings of the prompt templates in `docsDir` (`docs/assets/`), sorted. */
export function promptKeys(docsDir: string): string[];

/** The raster files whose name is no key (they replace nothing), sorted. */
export function unknownRasterFiles(keys: Iterable<string>, files: readonly string[]): string[];

export interface AssetsPluginOptions {
  /** The keys of the catalog (default: read from `docs/assets/`); a raster file without a key gets a warning. */
  readonly keys?: () => readonly string[];
  /** How the folder is read (tests); default {@link listRasterFiles}. */
  readonly list?: (publicDir: string) => string[];
}

/** Offers `virtual:raster-assets`: the list of raster files that replace drawn pictures. */
export function assetsPlugin(options?: AssetsPluginOptions): Plugin;
