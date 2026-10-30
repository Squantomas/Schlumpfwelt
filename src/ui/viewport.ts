import Phaser from 'phaser';
import { computeRenderScale } from './renderScale';

/**
 * Full-screen canvas that is sharp on HiDPI screens.
 *
 * The canvas has `renderScale` device pixels per CSS pixel (see
 * `renderScale.ts`); Phaser runs in `Scale.NONE` with `zoom = 1 / renderScale`
 * and CSS stretches the canvas over the whole container. Every scene camera
 * zooms by `renderScale`, so scenes lay out in **CSS pixels** and never deal
 * with devicePixelRatio themselves – use {@link onViewportChange}.
 */

export interface ViewportMeasure {
  /** Canvas size in device pixels. */
  readonly width: number;
  readonly height: number;
  /** Device pixels per CSS pixel. */
  readonly renderScale: number;
}

export interface ViewSize {
  /** Visible area in CSS pixels. */
  readonly width: number;
  readonly height: number;
}

export function measureViewport(container: HTMLElement): ViewportMeasure {
  const cssWidth = Math.max(1, container.clientWidth);
  const cssHeight = Math.max(1, container.clientHeight);
  const renderScale = computeRenderScale(window.devicePixelRatio, cssWidth, cssHeight);
  return {
    width: Math.max(1, Math.round(cssWidth * renderScale)),
    height: Math.max(1, Math.round(cssHeight * renderScale)),
    renderScale,
  };
}

/** Keeps the canvas resolution in sync with the container size and devicePixelRatio. */
export function watchViewport(game: Phaser.Game, container: HTMLElement): void {
  let pendingFrame = 0;

  const apply = (): void => {
    pendingFrame = 0;
    const view = measureViewport(container);
    const zoom = 1 / view.renderScale;
    if (game.scale.zoom !== zoom) {
      game.scale.setZoom(zoom);
    }
    if (game.scale.width !== view.width || game.scale.height !== view.height) {
      game.scale.resize(view.width, view.height);
    }
  };

  const schedule = (): void => {
    if (pendingFrame === 0) {
      pendingFrame = requestAnimationFrame(apply);
    }
  };

  // Covers window resizes, rotation (portrait/landscape) and browser toolbars.
  new ResizeObserver(schedule).observe(container);

  // devicePixelRatio can change without a size change (window moved to another screen).
  const watchPixelRatio = (): void => {
    matchMedia(`(resolution: ${String(window.devicePixelRatio)}dppx)`).addEventListener(
      'change',
      () => {
        schedule();
        watchPixelRatio();
      },
      { once: true },
    );
  };
  watchPixelRatio();
}

/** Device pixels per CSS pixel for this game. */
export function renderScaleOf(scene: Phaser.Scene): number {
  return 1 / scene.scale.zoom;
}

/** Visible area in CSS pixels. */
export function viewSize(scene: Phaser.Scene): ViewSize {
  const scale = renderScaleOf(scene);
  return { width: scene.scale.width / scale, height: scene.scale.height / scale };
}

/** Lets the main camera show the scene in CSS pixels, starting top left. */
export function fitCamera(scene: Phaser.Scene): void {
  scene.cameras.main
    .setSize(scene.scale.width, scene.scale.height)
    .setOrigin(0, 0)
    .setZoom(renderScaleOf(scene))
    .setScroll(0, 0);
}

/**
 * Calls `layout` right away and after every viewport change until the scene
 * shuts down. The camera is fitted before `layout` runs.
 */
export function onViewportChange(scene: Phaser.Scene, layout: (size: ViewSize) => void): void {
  const handler = (): void => {
    fitCamera(scene);
    layout(viewSize(scene));
  };
  scene.scale.on(Phaser.Scale.Events.RESIZE, handler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.scale.off(Phaser.Scale.Events.RESIZE, handler);
  });
  handler();
}
