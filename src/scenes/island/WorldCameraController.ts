import Phaser from 'phaser';
import { CameraRig } from '../../ui/cameraRig';
import { screenToWorld, type Point, type Rect, type Size } from '../../ui/cameraMath';
import { GestureTracker } from '../../ui/gestures';
import { renderScaleOf } from '../../ui/viewport';

export interface WorldCameraOptions {
  readonly bounds: Rect;
  readonly focus: Rect;
  readonly focusPadding: number;
  readonly tileSize: number;
  readonly maxTileCssPx: number;
  readonly minStartTileCssPx?: number;
  readonly startCenter?: Point;
  readonly tapMaxMovePx: number;
  readonly wheelZoomPerPixel: number;
  /**
   * Presses on such objects (the +/− buttons) belong to the object and never
   * move the camera. Only UI objects count: things in the world are picked
   * through the `tile-tap` event, not through their own input.
   */
  readonly blocksCamera: (object: Phaser.GameObjects.GameObject) => boolean;
  /** Presses on a panel (toolbar, picker) also belong to the UI, even between its buttons. Point in CSS px. */
  readonly blocksPoint?: (x: number, y: number) => boolean;
  /** Is the mouse wheel at this point (CSS px) not for the island (a panel, the menu, the open shop)? Defaults to `blocksPoint`. */
  readonly blocksWheel?: (x: number, y: number) => boolean;
  /** A tap on the world (not on a button): the world point and the screen point (CSS px). */
  readonly onTap: (world: Point, screen: Point, eventTime: number) => void;
  /**
   * Optional (M7): does a first press here pick something up (a resident)? Then moving the finger carries it
   * (`onCarry`) instead of moving the camera, and the release puts it down (`onDrop`). Released without moving it
   * stays a tap (`onCancelCarry`, then `onTap`); a second finger cancels it and pinches.
   */
  readonly onGrab?: (world: Point, screen: Point) => boolean;
  readonly onCarry?: (world: Point, screen: Point) => void;
  readonly onDrop?: (world: Point, screen: Point, eventTime: number) => void;
  readonly onCancelCarry?: () => void;
}

/** Largest wheel step that is taken into account (some mice send huge values). */
const MAX_WHEEL_DELTA = 240;

/**
 * Connects the pure camera ({@link CameraRig}, {@link GestureTracker}) to
 * Phaser: finger/mouse input goes in, the Phaser world camera comes out.
 *
 * - One finger or the left mouse button drags, two fingers pinch (zoom around
 *   the middle between them), the mouse wheel zooms around the pointer.
 * - Presses that start on a game object (the +/− buttons) never move the camera.
 * - A press on something the scene lets pick up (a resident, M7) carries it
 *   instead of moving the camera; a press beside it moves the camera as always.
 * - The world camera zooms by `rig zoom × render scale`, so the game zoom and
 *   the canvas resolution multiply cleanly (see `viewport.ts`).
 */
export class WorldCameraController {
  private readonly rig: CameraRig;
  private readonly tracker: GestureTracker;
  /** Browser time of the release that is being handled (for the tap callback). */
  private upTime = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly camera: Phaser.Cameras.Scene2D.Camera,
    private readonly options: WorldCameraOptions,
  ) {
    this.rig = new CameraRig(options);
    this.tracker = new GestureTracker(
      {
        begin: () => {
          const wasGliding = this.rig.gliding;
          this.rig.stop();
          return wasGliding;
        },
        pan: (dx, dy) => this.rig.pan(dx, dy),
        pinch: (from, to, scale) => this.rig.pinch(from, to, scale),
        tap: (at) => options.onTap(this.toWorld(at), at, this.upTime),
        fling: (vx, vy) => this.rig.fling(vx, vy),
        grab: (at) => options.onGrab?.(this.toWorld(at), at) === true,
        carry: (at) => options.onCarry?.(this.toWorld(at), at),
        drop: (at) => options.onDrop?.(this.toWorld(at), at, this.upTime),
        cancelCarry: () => options.onCancelCarry?.(),
      },
      { tapMaxMovePx: options.tapMaxMovePx },
    );

    // Three touch pointers allow a pinch plus a stray finger. Pointers stay after a scene restart: add only what is missing.
    const missing = 3 - scene.input.manager.pointersTotal;
    if (missing > 0) {
      scene.input.addPointer(missing);
    }
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUpOutside);
    scene.input.on(Phaser.Input.Events.POINTER_WHEEL, this.onWheel);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown);
      scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove);
      scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp);
      scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUpOutside);
      scene.input.off(Phaser.Input.Events.POINTER_WHEEL, this.onWheel);
    });
  }

  get view(): CameraRig['view'] {
    return this.rig.view;
  }

  /** True while something picked up is being carried (the camera stands still). */
  get carrying(): boolean {
    return this.tracker.carrying;
  }

  private toWorld(at: Point): Point {
    return screenToWorld(this.rig.view, this.rig.viewSize, at);
  }

  get viewSize(): Size {
    return this.rig.viewSize;
  }

  get limits(): CameraRig['limits'] {
    return this.rig.limits;
  }

  /** Call whenever the visible area changes (start, resize, rotation). Size in CSS px. */
  layout(size: Size): void {
    const scale = renderScaleOf(this.scene);
    this.camera.setSize(Math.round(size.width * scale), Math.round(size.height * scale));
    this.rig.resize(size);
    this.apply();
  }

  /** Zooms smoothly by `factor` around the middle of the screen (for the +/− buttons). */
  zoomBy(factor: number): void {
    const { width, height } = this.rig.viewSize;
    this.rig.zoomBy(factor, { x: width / 2, y: height / 2 });
  }

  /** Glides gently so that the world point `center` comes to the middle (a touch stops it). */
  glideTo(center: Point): void {
    this.rig.glideTo(center);
  }

  /** True while the camera glides to a place. */
  get glidingTo(): boolean {
    return this.rig.glidingTo;
  }

  /** Ends a glide to a place where the camera is now. */
  stopGlide(): void {
    this.rig.stopGlide();
  }

  /** Advances inertia, smooth zoom and a glide (that one by `glideMs`, the raw frame time); call once per frame. */
  update(deltaMs: number, glideMs = deltaMs): void {
    this.rig.update(deltaMs, glideMs);
    this.apply();
  }

  /**
   * When the browser event happened. Phaser handles all events of a frame
   * together, so the frame time would make every move of a slow frame look
   * simultaneous – the event's own time keeps the swipe speed right.
   */
  private timeOf(pointer: Phaser.Input.Pointer): number {
    return pointer.event?.timeStamp ?? this.scene.time.now;
  }

  /** Pointer position in CSS px. */
  private cssPoint(pointer: Phaser.Input.Pointer): Point {
    const scale = renderScaleOf(this.scene);
    return { x: pointer.x / scale, y: pointer.y / scale };
  }

  private readonly onDown = (pointer: Phaser.Input.Pointer, currentlyOver: readonly Phaser.GameObjects.GameObject[]): void => {
    // Buttons handle their own presses; only the left mouse button drags.
    const { x, y } = this.cssPoint(pointer);
    if (
      currentlyOver.some(this.options.blocksCamera) ||
      this.options.blocksPoint?.(x, y) === true ||
      (!pointer.wasTouch && !pointer.leftButtonDown())
    ) {
      return;
    }
    this.tracker.down(pointer.id, x, y, this.timeOf(pointer));
  };

  private readonly onMove = (pointer: Phaser.Input.Pointer): void => {
    if (!pointer.isDown) {
      return;
    }
    const { x, y } = this.cssPoint(pointer);
    this.tracker.move(pointer.id, x, y, this.timeOf(pointer));
  };

  private readonly onUp = (pointer: Phaser.Input.Pointer): void => {
    // An interrupted touch (touchcancel) is neither a tap nor a swipe.
    if (pointer.wasCanceled) {
      this.tracker.cancel(pointer.id);
      return;
    }
    // Releasing another mouse button (right click while dragging) does not end the left-button gesture.
    if (!pointer.wasTouch && pointer.button !== 0) {
      return;
    }
    const { x, y } = this.cssPoint(pointer);
    this.upTime = this.timeOf(pointer);
    this.tracker.up(pointer.id, x, y, this.upTime);
  };

  /** Released outside the canvas (and the browser window): the gesture is over, without a tap. */
  private readonly onUpOutside = (pointer: Phaser.Input.Pointer): void => {
    this.tracker.cancel(pointer.id);
  };

  private readonly onWheel = (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, deltaY: number): void => {
    const point = this.cssPoint(pointer);
    // The wheel over a panel, the menu or the open shop does not zoom the island behind it.
    if ((this.options.blocksWheel ?? this.options.blocksPoint)?.(point.x, point.y) === true) {
      return;
    }
    const delta = Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, deltaY));
    this.rig.zoomBy(Math.exp(-delta * this.options.wheelZoomPerPixel), point);
  };

  private apply(): void {
    const { zoom, centerX, centerY } = this.rig.view;
    this.camera.setZoom(zoom * renderScaleOf(this.scene));
    this.camera.centerOn(centerX, centerY);
  }
}
