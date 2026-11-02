import type { PlannedAsset } from '../../art/source';

/** What reading the picture of a plan gave. */
export interface Fetched<I> {
  readonly image: I | undefined;
  readonly kind: 'svg' | 'raster';
  /** The raster file that could not be read (the SVG stands in). */
  readonly rasterFailed?: string;
}

/** How a picture is read: `load` reads an address, `svgUrl` writes the SVG of a key (both may fail), `warn` reports. */
export interface PictureReader<I> {
  readonly load: (url: string) => Promise<I>;
  readonly svgUrl: (key: string) => string;
  readonly warn: (...what: unknown[]) => void;
}

/** Reads the SVG of a key; `undefined` when writing or reading it fails (never rejects). */
async function readSvg<I>(key: string, reader: PictureReader<I>): Promise<I | undefined> {
  try {
    return await reader.load(reader.svgUrl(key));
  } catch (error) {
    reader.warn(error);
    return undefined;
  }
}

/**
 * Reads the picture of a plan: the raster file, or else – also when the file cannot be read – the SVG. Never rejects
 * (Korrekturrunde 3: writing the SVG of the fallback could throw outside the catch), so `data-assets` is always set.
 */
export async function fetchPicture<I>(plan: PlannedAsset, reader: PictureReader<I>): Promise<Fetched<I>> {
  if (plan.source.kind === 'raster') {
    try {
      return { image: await reader.load(plan.source.url), kind: 'raster' };
    } catch {
      reader.warn(`Rasterbild ${plan.source.file} nicht lesbar, nehme das gezeichnete Bild.`);
      return { image: await readSvg(plan.key, reader), kind: 'svg', rasterFailed: plan.source.file };
    }
  }
  return { image: await readSvg(plan.key, reader), kind: 'svg' };
}
