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
 * The pictures are painted in slices of about {@link SLICE_MS} with a frame in between (Korrekturrunde 1): no long
 * block, the start screen shows the name and a moving dot meanwhile ({@link artProgress}). A picture that cannot be made
 * (a canvas the browser refuses, e.g. Safari at its memory limit) is left out and named in `failed`; loading never
 * rejects.
 */

/** Paint for about this long, then let a frame be drawn (ms). */
const SLICE_MS = 12;

let loading: Promise<void> | undefined;
const progress = { done: 0, total: ASSETS.length };

/** How far the pictures are (for the start screen). */
export function artProgress(): { readonly done: number; readonly total: number } {
  return progress;
}

/** The next frame – or a short pause in a page that draws no frames (a background tab). */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 100);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      resolve();
    });
  });
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
    // Reading runs beside the page (images decode on their own); painting is done in slices, one after the other.
    const fetched = plans.map((plan) => fetchOne(plan));
    const loaded: { key: string; kind: 'svg' | 'raster' }[] = [];
    const failed: string[] = [];
    const rasterFailed: string[] = [];
    let sliceStart = performance.now();
    for (const [index, plan] of plans.entries()) {
      const got = await (fetched[index] ?? Promise.resolve<Fetched>({ image: undefined, kind: 'svg' }));
      if (got.rasterFailed) {
        rasterFailed.push(got.rasterFailed);
      }
      if (got.image && paintOne(scene.textures, plan, got.image)) {
        loaded.push({ key: plan.key, kind: got.kind });
      } else {
        failed.push(plan.key);
      }
      progress.done = index + 1;
      if (performance.now() - sliceStart >= SLICE_MS) {
        await nextFrame();
        sliceStart = performance.now();
      }
    }
    const unused = unusedRasterFiles(
      ASSETS.map((asset) => asset.key),
      rasterFiles,
    );
    if (unused.length > 0) {
      console.warn(`Diese Bilder in public/assets/ ersetzen nichts (kein Schlüssel): ${unused.join(', ')}`);
    }
    document.documentElement.dataset.assets = assetReport({ loaded, failed, rasterFailed, unused, ms: performance.now() - started });
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
