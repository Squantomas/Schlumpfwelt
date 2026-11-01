import type Phaser from 'phaser';
import rasterFiles from 'virtual:raster-assets';
import { ASSETS, assetEntry, assetSvg } from '../../art/catalog';
import { assetReport, planAssets, svgDataUrl, type PlannedAsset } from '../../art/source';

/**
 * Turns every picture of `src/art/catalog.ts` into a texture (M9), once per page: the SVG is drawn into a canvas of
 * the texture size (logical size × scale; the SVG is never re-rendered while playing); a raster file in
 * `public/assets/` with the key as its name is used instead – if it cannot be read, the SVG takes its place
 * (`console.warn`, no error). Textures live in the game's texture manager and survive a scene restart.
 * The result is published as `<html data-assets>` for the tests.
 */

let loading: Promise<void> | undefined;

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

async function loadOne(textures: Phaser.Textures.TextureManager, plan: PlannedAsset): Promise<'svg' | 'raster' | 'failed'> {
  let kind: 'svg' | 'raster' = plan.source.kind;
  let image: HTMLImageElement;
  try {
    image = await loadImage(plan.source.kind === 'raster' ? plan.source.url : svgUrlOf(plan.key));
  } catch (error) {
    if (plan.source.kind !== 'raster') {
      console.warn(error);
      return 'failed';
    }
    console.warn(`Rasterbild ${plan.source.file} nicht lesbar, nehme das gezeichnete Bild.`);
    kind = 'svg';
    try {
      image = await loadImage(svgUrlOf(plan.key));
    } catch (svgError) {
      console.warn(svgError);
      return 'failed';
    }
  }
  if (textures.exists(plan.key)) {
    return kind;
  }
  const texture = textures.createCanvas(plan.key, plan.width, plan.height);
  const ctx = texture?.getContext();
  if (!texture || !ctx) {
    return 'failed';
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, plan.width, plan.height);
  texture.refresh();
  return kind;
}

/** Loads all pictures (only the first call does the work; later calls wait for the same promise). */
export function loadArt(scene: Phaser.Scene): Promise<void> {
  loading ??= (async () => {
    const started = performance.now();
    const plans = planAssets(ASSETS, rasterFiles);
    const results = await Promise.all(plans.map(async (plan) => ({ key: plan.key, result: await loadOne(scene.textures, plan) })));
    const loaded = results.flatMap(({ key, result }) => (result === 'failed' ? [] : [{ key, kind: result }]));
    const failed = results.filter(({ result }) => result === 'failed').map(({ key }) => key);
    document.documentElement.dataset.assets = assetReport(loaded, failed, performance.now() - started);
  })();
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
