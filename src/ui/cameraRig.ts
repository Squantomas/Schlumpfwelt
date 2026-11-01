import {
  approach,
  clampView,
  startView,
  panView,
  transformView,
  zoomLimits,
  type CameraBounds,
  type CameraView,
  type Point,
  type Rect,
  type Size,
  type ZoomLimits,
} from './cameraMath';

export interface CameraRigOptions {
  /** The area the camera may show (map plus some water around it) and where its centre may be, in world pixels. */
  readonly bounds: CameraBounds;
  /** The area that should be well visible at the start (the island), in world pixels. */
  readonly focus: Rect;
  /** Free space around the focus area at the start, in CSS pixels. */
  readonly focusPadding: number;
  readonly tileSize: number;
  /** Biggest zoom: one tile is this many CSS pixels. */
  readonly maxTileCssPx: number;
  /** At the start a tile is at least this many CSS pixels big (zoomed in on {@link startCenter} if the whole island would be smaller). */
  readonly minStartTileCssPx?: number;
  /** Where to look at the start if it has to zoom in (world pixels): the start village. */
  readonly startCenter?: Point;
}

/** How fast a smooth zoom (wheel, +/− buttons) arrives, in ms. */
const ZOOM_TIME_CONSTANT_MS = 90;
/** Inertia: the speed drops to 37 % in this time. */
const FLING_TIME_CONSTANT_MS = 320;
/** Below this speed (px per ms) the inertia stops. */
const FLING_STOP_SPEED = 0.01;
/** A smooth zoom is finished when the zoom is this close to the target (relative). */
const ZOOM_EPSILON = 0.0005;
/** A glide to a place ({@link CameraRig.glideTo}) takes this long at least and at most (ms), longer for a longer way. */
const GLIDE_MIN_MS = 600;
const GLIDE_MAX_MS = 1600;
/** … and this many ms per CSS px of the way. */
const GLIDE_MS_PER_PX = 0.8;
/** One frame moves a glide on by this much real time at most (ms; a frame after a pause does not jump to the end). */
export const GLIDE_MAX_STEP_MS = 250;

interface Glide {
  readonly from: Point;
  readonly to: Point;
  readonly duration: number;
  elapsed: number;
}

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
  private glide: Glide | undefined;

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
      this.current = this.clamp(this.startView());
    } else {
      this.current = this.clamp(this.current);
    }
    this.targetZoom = this.current.zoom;
    this.zoomAnchor = { x: this.size.width / 2, y: this.size.height / 2 };
  }

  private startView(): CameraView {
    const { focus, focusPadding, tileSize, minStartTileCssPx, startCenter } = this.options;
    return startView(this.size, focus, focusPadding, tileSize, minStartTileCssPx, startCenter);
  }

  /** Goes back to the start view. */
  reset(): void {
    this.stop();
    this.current = this.clamp(this.startView());
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
    this.glide = undefined;
    this.zoomAnchor = anchor;
    this.targetZoom = Math.min(Math.max(this.targetZoom * factor, this.currentLimits.min), this.currentLimits.max);
  }

  /**
   * Moves the middle of the picture smoothly to `center` (world px): slow at the start and at the end, never a jump,
   * within the limits of the camera. Any touch, drag, pinch or zoom stops it on the spot ({@link stop}).
   */
  glideTo(center: Point): void {
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) {
      return;
    }
    const from = { x: this.current.centerX, y: this.current.centerY };
    const distance = Math.hypot(center.x - from.x, center.y - from.y) * this.current.zoom;
    this.velocity = { x: 0, y: 0 };
    this.glide = { from, to: center, duration: Math.min(GLIDE_MAX_MS, Math.max(GLIDE_MIN_MS, distance * GLIDE_MS_PER_PX)), elapsed: 0 };
  }

  /** True while the camera glides to a place ({@link glideTo}). */
  get glidingTo(): boolean {
    return this.glide !== undefined;
  }

  /** Ends a glide to a place where the camera is now (inertia and smooth zoom go on). */
  stopGlide(): void {
    this.glide = undefined;
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

  /** True while the picture glides on after a drag (inertia). */
  get gliding(): boolean {
    return this.velocity.x !== 0 || this.velocity.y !== 0;
  }

  /** True while inertia, a smooth zoom or a glide to a place is running. */
  get animating(): boolean {
    return this.velocity.x !== 0 || this.velocity.y !== 0 || this.zoomPending || this.glide !== undefined;
  }

  /**
   * Advances inertia, smooth zoom and a glide to a place. Returns true if the view changed. `glideMs` is the real
   * time since the last frame for the glide (the raw frame time: Phaser's smoothed `delta` lags far behind at a low
   * frame rate, a glide of 1.6 s took 40 s at 2.5 fps); it is capped at {@link GLIDE_MAX_STEP_MS}.
   */
  update(deltaMs: number, glideMs = deltaMs): boolean {
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

    const glide = this.glide;
    if (glide) {
      glide.elapsed += Number.isFinite(glideMs) ? Math.min(GLIDE_MAX_STEP_MS, Math.max(0, glideMs)) : 0;
      const t = Math.min(1, glide.elapsed / glide.duration);
      const eased = t * t * (3 - 2 * t);
      const x = glide.from.x + (glide.to.x - glide.from.x) * eased;
      const y = glide.from.y + (glide.to.y - glide.from.y) * eased;
      const zoom = this.current.zoom;
      this.current = panView(this.current, this.size, this.options.bounds, this.currentLimits, (this.current.centerX - x) * zoom, (this.current.centerY - y) * zoom);
      if (t >= 1) {
        this.glide = undefined;
      }
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
    this.glide = undefined;
  }

  private clamp(view: CameraView): CameraView {
    return clampView(view, this.size, this.options.bounds, this.currentLimits);
  }
}
