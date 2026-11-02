import type Phaser from 'phaser';
import rasterFiles from 'virtual:raster-assets';
import { ASSETS, assetEntry, assetSvg } from '../../art/catalog';
import { assetReport, planAssets, svgDataUrl, unusedRasterFiles, type PlannedAsset } from '../../art/source';

/**
 * Turns every picture of `src/art/catalog.ts` into a texture (M9), once per page: the SVG is drawn into a canvas of
 * the texture size (logical size × scale; the SVG is never re-rendered while playing); a raster file in
 * `public/assets/` with the key as its name is used instead – if it cannot be read, the SVG takes its place
 * (`console.warn`, no error, named in `rasterFailed`). Textures live in the game's texture manager and survive a scene
 * restart. The result is published as `<html data-assets>` for the tests and the project lead.
 *
 * Each picture is painted as soon as it has been read, in the task that read it (Korrekturrunde 2): no long block –
 * the biggest picture takes a few milliseconds – and the throughput is that of the reading, not of the frame rate
 * (Korrekturrunde 1 waited for a frame after every slice of 12 ms: two to three times slower). Meanwhile the start
 * screen shows the name and a moving dot ({@link artProgress}). A picture that cannot be made
 * (a canvas the browser refuses, e.g. Safari at its memory limit) is left out and named in `failed`; loading never
 * rejects. `slice` in the report is the longest block of this work (ms): writing the SVG text of all pictures at the
 * start (one block; spreading it out with pauses made loading slower in the measurements, not shorter in its longest
 * task), or painting one picture.
 */

let loading: Promise<void> | undefined;
const progress = { done: 0, total: ASSETS.length };

/** How far the pictures are (for the start screen). */
export function artProgress(): { readonly done: number; readonly total: number } {
  return progress;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error(`Bild nicht lesbar: ${url.slice(0, 60)}`));
    };
    image.src = url;
  });
}

function svgUrlOf(key: string): string {
  const asset = assetEntry(key);
  return asset ? svgDataUrl(assetSvg(asset)) : '';
}

interface Fetched {
  readonly image: HTMLImageElement | undefined;
  readonly kind: 'svg' | 'raster';
  /** The raster file that could not be read (the SVG stands in). */
  readonly rasterFailed?: string;
}

/** Reads the picture of a plan (the raster file, or else the SVG); never rejects. */
async function fetchOne(plan: PlannedAsset): Promise<Fetched> {
  if (plan.source.kind === 'raster') {
    try {
      return { image: await loadImage(plan.source.url), kind: 'raster' };
    } catch {
      console.warn(`Rasterbild ${plan.source.file} nicht lesbar, nehme das gezeichnete Bild.`);
      const svg = await loadImage(svgUrlOf(plan.key)).catch((error: unknown) => {
        console.warn(error);
        return undefined;
      });
      return { image: svg, kind: 'svg', rasterFailed: plan.source.file };
    }
  }
  try {
    return { image: await loadImage(svgUrlOf(plan.key)), kind: 'svg' };
  } catch (error) {
    console.warn(error);
    return { image: undefined, kind: 'svg' };
  }
}

/** Paints a read picture into its texture; `false` when the browser refuses the canvas (nothing half made stays). */
function paintOne(textures: Phaser.Textures.TextureManager, plan: PlannedAsset, image: HTMLImageElement): boolean {
  if (textures.exists(plan.key)) {
    return true;
  }
  try {
    const texture = textures.createCanvas(plan.key, plan.width, plan.height);
    const ctx = texture?.getContext();
    if (!texture || !ctx) {
      throw new Error('keine Zeichenfläche');
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, plan.width, plan.height);
    texture.refresh();
    return true;
  } catch (error) {
    console.warn(`Bild ${plan.key} nicht gemalt`, error);
    if (textures.exists(plan.key)) {
      textures.remove(plan.key);
    }
    return false;
  }
}

/** Loads all pictures (only the first call does the work; later calls wait for the same promise). Never rejects. */
export function loadArt(scene: Phaser.Scene): Promise<void> {
  loading ??= (async () => {
    const started = performance.now();
    const plans = planAssets(ASSETS, rasterFiles);
    progress.total = plans.length;
    progress.done = 0;
    // Reading runs beside the page (images decode on their own); each picture is painted when it is there.
    let longest = 0;
    const paintWhenRead = async (plan: PlannedAsset): Promise<{ plan: PlannedAsset; got: Fetched; ok: boolean }> => {
      const got = await fetchOne(plan);
      const start = performance.now();
      const ok = got.image !== undefined && paintOne(scene.textures, plan, got.image);
      longest = Math.max(longest, performance.now() - start);
      progress.done += 1;
      return { plan, got, ok };
    };
    const writing = performance.now();
    const painting = plans.map((plan) => paintWhenRead(plan));
    longest = Math.max(longest, performance.now() - writing);
    const painted = await Promise.all(painting);
    const loaded: { key: string; kind: 'svg' | 'raster' }[] = [];
    const failed: string[] = [];
    const rasterFailed: string[] = [];
    for (const { plan, got, ok } of painted) {
      if (got.rasterFailed) {
        rasterFailed.push(got.rasterFailed);
      }
      if (ok) {
        loaded.push({ key: plan.key, kind: got.kind });
      } else {
        failed.push(plan.key);
      }
    }
    const unused = unusedRasterFiles(
      ASSETS.map((asset) => asset.key),
      rasterFiles,
    );
    if (unused.length > 0) {
      console.warn(`Diese Bilder in public/assets/ ersetzen nichts (kein Schlüssel): ${unused.join(', ')}`);
    }
    document.documentElement.dataset.assets = assetReport({ loaded, failed, rasterFailed, unused, ms: performance.now() - started, longestSliceMs: longest });
  })().catch((error: unknown) => {
    // Nothing above should throw; if it does, the game starts with what it has.
    console.warn('Bilder nicht vollständig geladen', error);
  });
  return loading;
}

/** The canvas of a loaded picture (ground patterns and stamps are painted into the ground with it). */
export function artCanvas(scene: Phaser.Scene, key: string): HTMLCanvasElement | undefined {
  if (!scene.textures.exists(key)) {
    return undefined;
  }
  const source = scene.textures.get(key).getSourceImage();
  return source instanceof HTMLCanvasElement ? source : undefined;
}
