import type { Plugin } from 'vite';

/** The raster files (`*.png`, `*.webp` with a key as name) in `<publicDir>/assets/`, sorted. */
export function listRasterFiles(publicDir: string): string[];

/** Offers `virtual:raster-assets`: the list of raster files that replace drawn pictures. */
export function assetsPlugin(): Plugin;
