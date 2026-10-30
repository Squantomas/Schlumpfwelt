import type { Point } from './cameraMath';

/**
 * Tells apart tap, drag and two-finger pinch – without Phaser, so it can be
 * unit-tested. The scene feeds in pointer events (CSS pixels, milliseconds)
 * and gets calls back.
 *
 * - One pointer that moves less than `tapMaxMovePx` and is released: **tap**.
 * - One pointer that moves further: **pan** (from the start position on, so the
 *   picture does not jump when the threshold is crossed). On release with
 *   speed: **fling** (for inertia).
 * - Two pointers: **pinch** (zoom around the middle between the fingers). A
 *   gesture that was ever a pinch never ends as a tap. A finger that stays
 *   when the other one is lifted keeps panning without a jump.
 * - More than two pointers: the extra ones are ignored.
 */

export interface GestureHandlers {
  /**
   * A new gesture starts (first pointer down): stop inertia and the like.
   * Return true if this touch only stopped a moving picture – it then never
   * counts as a tap (stopping the map must not select a tile).
   */
  begin(): boolean;
  /** Drag by this many screen pixels since the last call. */
  pan(dx: number, dy: number): void;
  /** The middle between the fingers moved from `from` to `to`, the distance changed by `scale`. */
  pinch(from: Point, to: Point, scale: number): void;
  /** Short touch without moving. */
  tap(at: Point): void;
  /** Released while moving: speed in screen pixels per millisecond. */
  fling(vx: number, vy: number): void;
}

export interface GestureOptions {
  /** Movement up to this distance (CSS px) still counts as a tap. */
  readonly tapMaxMovePx: number;
}

/** Only movement during this window before release counts for the fling speed. */
const FLING_WINDOW_MS = 100;
/** If the finger rested this long before release, there is no fling. */
const FLING_MAX_IDLE_MS = 60;
/** Slower releases do not fling (px per ms). */
const FLING_MIN_SPEED = 0.15;
/** Upper limit for the fling speed (px per ms). */
const FLING_MAX_SPEED = 4;

interface Tracked {
  x: number;
  y: number;
  readonly startX: number;
  readonly startY: number;
}

interface Sample {
  readonly t: number;
  readonly x: number;
  readonly y: number;
}

type Mode = 'idle' | 'pending' | 'pan' | 'pinch';

export class GestureTracker {
  private readonly pointers = new Map<number, Tracked>();
  private mode: Mode = 'idle';
  private samples: Sample[] = [];
  private lastX = 0;
  private lastY = 0;
  /** False when this touch stopped a gliding picture. */
  private tapAllowed = true;

  constructor(
    private readonly handlers: GestureHandlers,
    private readonly options: GestureOptions,
  ) {}

  /** True while at least one finger or button is down for a gesture. */
  get active(): boolean {
    return this.mode !== 'idle';
  }

  down(id: number, x: number, y: number, timeMs: number): void {
    if (this.pointers.has(id) || this.pointers.size >= 2) {
      return;
    }
    this.pointers.set(id, { x, y, startX: x, startY: y });
    if (this.pointers.size === 1) {
      this.tapAllowed = !this.handlers.begin();
      this.mode = 'pending';
      this.lastX = x;
      this.lastY = y;
      this.samples = [{ t: timeMs, x, y }];
    } else {
      this.mode = 'pinch';
      this.samples = [];
    }
  }

  move(id: number, x: number, y: number, timeMs: number): void {
    const pointer = this.pointers.get(id);
    if (!pointer) {
      return;
    }
    if (this.mode === 'pinch') {
      const before = this.pinchState();
      pointer.x = x;
      pointer.y = y;
      const after = this.pinchState();
      if (before && after) {
        const scale = before.distance > 1 ? after.distance / before.distance : 1;
        this.handlers.pinch(before.middle, after.middle, scale);
      }
      return;
    }

    pointer.x = x;
    pointer.y = y;
    if (this.mode === 'pending') {
      if (Math.hypot(x - pointer.startX, y - pointer.startY) <= this.options.tapMaxMovePx) {
        return;
      }
      this.mode = 'pan';
    }
    if (this.mode === 'pan') {
      this.handlers.pan(x - this.lastX, y - this.lastY);
      this.lastX = x;
      this.lastY = y;
      this.samples.push({ t: timeMs, x, y });
      this.samples = this.samples.filter((sample) => timeMs - sample.t <= FLING_WINDOW_MS);
    }
  }

  up(id: number, x: number, y: number, timeMs: number): void {
    const pointer = this.pointers.get(id);
    if (!pointer) {
      return;
    }
    this.pointers.delete(id);
    switch (this.mode) {
      case 'pending':
        this.mode = 'idle';
        // The moves may have been merged into this one event: check the distance again.
        if (Math.hypot(x - pointer.startX, y - pointer.startY) > this.options.tapMaxMovePx) {
          this.handlers.pan(x - this.lastX, y - this.lastY);
        } else if (this.tapAllowed) {
          this.handlers.tap({ x, y });
        }
        break;
      case 'pan':
        this.mode = 'idle';
        this.fling(timeMs);
        break;
      case 'pinch':
        this.continueWithRemaining();
        break;
      case 'idle':
        break;
    }
  }

  /** The system took the pointer away (for example the touch was interrupted): neither tap nor fling. */
  cancel(id: number): void {
    if (!this.pointers.delete(id)) {
      return;
    }
    if (this.mode === 'pinch') {
      this.continueWithRemaining();
    } else {
      this.mode = 'idle';
    }
  }

  private pinchState(): { middle: Point; distance: number } | undefined {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) {
      return undefined;
    }
    return { middle: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
  }

  /** After one finger of a pinch is gone: the other one drags on, but can never tap. */
  private continueWithRemaining(): void {
    const [rest] = [...this.pointers.values()];
    if (!rest) {
      this.mode = 'idle';
      return;
    }
    this.mode = 'pan';
    this.lastX = rest.x;
    this.lastY = rest.y;
    this.samples = [];
  }

  private fling(releaseMs: number): void {
    const samples = this.samples;
    this.samples = [];
    const first = samples[0];
    const last = samples[samples.length - 1];
    if (!first || !last || last === first || releaseMs - last.t > FLING_MAX_IDLE_MS) {
      return;
    }
    const duration = last.t - first.t;
    if (duration <= 0) {
      return;
    }
    const vx = (last.x - first.x) / duration;
    const vy = (last.y - first.y) / duration;
    const speed = Math.hypot(vx, vy);
    if (speed < FLING_MIN_SPEED) {
      return;
    }
    const limit = Math.min(1, FLING_MAX_SPEED / speed);
    this.handlers.fling(vx * limit, vy * limit);
  }
}
