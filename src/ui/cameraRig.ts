import {
  approach,
  clampView,
  fitRect,
  panView,
  transformView,
  zoomLimits,
  type CameraView,
  type Point,
  type Rect,
  type Size,
  type ZoomLimits,
} from './cameraMath';

export interface CameraRigOptions {
  /** The area the camera may show (map plus some water around it), in world pixels. */
  readonly bounds: Rect;
  /** The area that should be well visible at the start (the island), in world pixels. */
  readonly focus: Rect;
  /** Free space around the focus area at the start, in CSS pixels. */
  readonly focusPadding: number;
  readonly tileSize: number;
  /** Biggest zoom: one tile is this many CSS pixels. */
  readonly maxTileCssPx: number;
}

/** How fast a smooth zoom (wheel, +/− buttons) arrives, in ms. */
const ZOOM_TIME_CONSTANT_MS = 90;
/** Inertia: the speed drops to 37 % in this time. */
const FLING_TIME_CONSTANT_MS = 320;
/** Below this speed (px per ms) the inertia stops. */
const FLING_STOP_SPEED = 0.01;
/** A smooth zoom is finished when the zoom is this close to the target (relative). */
const ZOOM_EPSILON = 0.0005;

/**
 * The camera's state: view, limits, smooth zoom and inertia. Pure maths, no
 * Phaser – the scene reads {@link CameraRig.view} each frame and hands it to
 * the Phaser camera.
 *
 * Everything is in CSS pixels. The first {@link CameraRig.resize} sets the
 * start view (island centred and fully visible); later calls (window resized,
 * device rotated) keep the position and zoom and only re-apply the limits.
 */
export class CameraRig {
  private size: Size = { width: 1, height: 1 };
  private current: CameraView;
  private currentLimits: ZoomLimits = { min: 1, max: 1 };
  private started = false;
  private targetZoom = 1;
  private zoomAnchor: Point = { x: 0, y: 0 };
  private velocity: Point = { x: 0, y: 0 };

  constructor(private readonly options: CameraRigOptions) {
    this.current = { centerX: 0, centerY: 0, zoom: 1 };
  }

  get view(): CameraView {
    return this.current;
  }

  get limits(): ZoomLimits {
    return this.currentLimits;
  }

  get viewSize(): Size {
    return this.size;
  }

  /** Sets the visible area (CSS px). Call at the start and whenever the screen changes. */
  resize(size: Size): void {
    this.size = { width: Math.max(1, size.width), height: Math.max(1, size.height) };
    this.currentLimits = zoomLimits(this.size, this.options.bounds, this.options.tileSize, this.options.maxTileCssPx);
    if (!this.started) {
      this.started = true;
      this.current = this.clamp(fitRect(this.size, this.options.focus, this.options.focusPadding));
    } else {
      this.current = this.clamp(this.current);
    }
    this.targetZoom = this.current.zoom;
    this.zoomAnchor = { x: this.size.width / 2, y: this.size.height / 2 };
  }

  /** Goes back to the start view. */
  reset(): void {
    this.stop();
    this.current = this.clamp(fitRect(this.size, this.options.focus, this.options.focusPadding));
    this.targetZoom = this.current.zoom;
  }

  /** Drags the picture by (dx, dy) screen pixels. */
  pan(dx: number, dy: number): void {
    this.cancelAnimations();
    this.current = panView(this.current, this.size, this.options.bounds, this.currentLimits, dx, dy);
  }

  /** Pinch: see {@link transformView}. */
  pinch(from: Point, to: Point, scale: number): void {
    this.cancelAnimations();
    this.current = transformView(this.current, this.size, this.options.bounds, this.currentLimits, from, to, scale);
    this.targetZoom = this.current.zoom;
  }

  /** Zooms smoothly by `factor` around the screen point `anchor`; repeated calls add up. */
  zoomBy(factor: number, anchor: Point): void {
    if (!(factor > 0) || !Number.isFinite(factor)) {
      return;
    }
    this.velocity = { x: 0, y: 0 };
    this.zoomAnchor = anchor;
    this.targetZoom = Math.min(Math.max(this.targetZoom * factor, this.currentLimits.min), this.currentLimits.max);
  }

  /** Lets the picture glide on after a drag, with this speed (screen px per ms). */
  fling(vx: number, vy: number): void {
    this.velocity = { x: vx, y: vy };
  }

  /** Stops inertia and smooth zoom (a new touch starts). */
  stop(): void {
    this.cancelAnimations();
    this.targetZoom = this.current.zoom;
  }

  /** True while inertia or a smooth zoom is running. */
  get animating(): boolean {
    return this.velocity.x !== 0 || this.velocity.y !== 0 || this.zoomPending;
  }

  /** Advances inertia and smooth zoom. Returns true if the view changed. */
  update(deltaMs: number): boolean {
    const before = this.current;

    if (this.zoomPending) {
      // Ease in log space, so zooming in and out feel the same.
      const zoom = Math.exp(approach(Math.log(this.current.zoom), Math.log(this.targetZoom), deltaMs, ZOOM_TIME_CONSTANT_MS));
      const done = Math.abs(zoom - this.targetZoom) <= this.targetZoom * ZOOM_EPSILON;
      const next = done ? this.targetZoom : zoom;
      this.current = transformView(
        this.current,
        this.size,
        this.options.bounds,
        this.currentLimits,
        this.zoomAnchor,
        this.zoomAnchor,
        next / this.current.zoom,
      );
      if (done || Math.abs(this.current.zoom - next) > next * 1e-9) {
        // Arrived, or the limits stopped the zoom early.
        this.targetZoom = this.current.zoom;
      }
    }

    if (this.velocity.x !== 0 || this.velocity.y !== 0) {
      const dx = this.velocity.x * deltaMs;
      const dy = this.velocity.y * deltaMs;
      const moved = panView(this.current, this.size, this.options.bounds, this.currentLimits, dx, dy);
      // A wall stops the glide on that axis.
      const blockedX = Math.abs(moved.centerX - this.current.centerX) * this.current.zoom < Math.abs(dx) * 0.5;
      const blockedY = Math.abs(moved.centerY - this.current.centerY) * this.current.zoom < Math.abs(dy) * 0.5;
      this.current = moved;
      const decay = Math.exp(-deltaMs / FLING_TIME_CONSTANT_MS);
      const vx = blockedX ? 0 : this.velocity.x * decay;
      const vy = blockedY ? 0 : this.velocity.y * decay;
      this.velocity = Math.hypot(vx, vy) < FLING_STOP_SPEED ? { x: 0, y: 0 } : { x: vx, y: vy };
    }

    return (
      this.current.centerX !== before.centerX || this.current.centerY !== before.centerY || this.current.zoom !== before.zoom
    );
  }

  private get zoomPending(): boolean {
    return Math.abs(this.targetZoom - this.current.zoom) > this.targetZoom * ZOOM_EPSILON;
  }

  private cancelAnimations(): void {
    this.velocity = { x: 0, y: 0 };
    this.targetZoom = this.current.zoom;
  }

  private clamp(view: CameraView): CameraView {
    return clampView(view, this.size, this.options.bounds, this.currentLimits);
  }
}
