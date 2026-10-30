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
  /** A tap on the world (not on a button): the world point and the screen point (CSS px). */
  readonly onTap: (world: Point, screen: Point) => void;
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
 * - The world camera zooms by `rig zoom × render scale`, so the game zoom and
 *   the canvas resolution multiply cleanly (see `viewport.ts`).
 */
export class WorldCameraController {
  private readonly rig: CameraRig;
  private readonly tracker: GestureTracker;

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
        tap: (at) => options.onTap(screenToWorld(this.rig.view, this.rig.viewSize, at), at),
        fling: (vx, vy) => this.rig.fling(vx, vy),
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

  /** Advances inertia and smooth zoom; call once per frame. */
  update(deltaMs: number): void {
    this.rig.update(deltaMs);
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
    this.tracker.up(pointer.id, x, y, this.timeOf(pointer));
  };

  /** Released outside the canvas (and the browser window): the gesture is over, without a tap. */
  private readonly onUpOutside = (pointer: Phaser.Input.Pointer): void => {
    this.tracker.cancel(pointer.id);
  };

  private readonly onWheel = (pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, deltaY: number): void => {
    const delta = Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, deltaY));
    this.rig.zoomBy(Math.exp(-delta * this.options.wheelZoomPerPixel), this.cssPoint(pointer));
  };

  private apply(): void {
    const { zoom, centerX, centerY } = this.rig.view;
    this.camera.setZoom(zoom * renderScaleOf(this.scene));
    this.camera.centerOn(centerX, centerY);
  }
}
