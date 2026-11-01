import { buildingType } from '../data/buildings';
import { buildingAtPoint } from '../sim/buildings';
import type { Command } from '../sim/commands';
import { checkHome, type HomeResult } from '../sim/residents';
import type { Point } from './cameraMath';
import { TILE_SIZE } from './style';

/**
 * Carrying a resident to a new home (M7), without Phaser. While looking, a
 * press on a resident picks them up (`grab`); moving the finger carries them
 * (`carry`) and shows the house under the finger – green with room, red when
 * it is full ("2/2"), when it is their own or when it is no house at all.
 * Released on a house with room (`drop`), the command `assignHome` goes out;
 * released anywhere else nothing happens, the resident just goes back.
 *
 * The house is hit by its picture (a roof counts like the footprint, see
 * `buildingAtPoint`), among houses only – a flower in front of a house does
 * not hide it. Decoration, paths and production buildings are no target.
 */

/** The house under the finger and what a drop there would do. */
export interface HomeTarget {
  readonly houseId: number;
  readonly result: HomeResult;
  /** Residents living there now, and its room (for the "2/2"). */
  readonly used: number;
  readonly capacity: number;
}

export interface Carried {
  readonly residentId: number;
  /** Where the finger is (world px). */
  readonly at: Point;
  readonly target: HomeTarget | undefined;
}

/** What a drop did: `moved` sent `assignHome`; otherwise the house that said no (if any) and why. */
export interface DropResult {
  readonly residentId: number;
  readonly moved: boolean;
  readonly target: HomeTarget | undefined;
}

export type DragView = Parameters<typeof checkHome>[0];

/** The house whose picture covers the world point, if any (only houses count). */
export function houseAtPoint(view: Pick<DragView, 'buildings'>, at: Point): number | undefined {
  const houses = view.buildings.filter((building) => buildingType(building.type)?.category === 'house');
  return buildingAtPoint({ buildings: houses }, at.x, at.y, TILE_SIZE)?.id;
}

/** The house under the world point and what moving `residentId` in would do. */
export function homeTargetAt(view: DragView, residentId: number, at: Point): HomeTarget | undefined {
  const houseId = houseAtPoint(view, at);
  if (houseId === undefined) {
    return undefined;
  }
  return { houseId, ...checkHome(view, residentId, houseId) };
}

export class ResidentDrag {
  /** The resident under the finger since the press, and whether they were carried yet. */
  private held: { readonly residentId: number; at: Point; carried: boolean; target: HomeTarget | undefined } | undefined;
  private changes = 0;

  constructor(
    private readonly getState: () => DragView,
    private readonly send: (command: Command) => void,
  ) {}

  /**
   * Counts every change that redraws the preview: carrying starts or ends, or the house under the finger (or what it
   * says) changes. Moving over the meadow does not count – the figure follows the finger by itself ({@link carried}).
   */
  get version(): number {
    return this.changes;
  }

  /** The resident being carried (from the first move on), where and over which house. */
  get carried(): Carried | undefined {
    const held = this.held;
    return held?.carried ? { residentId: held.residentId, at: held.at, target: held.target } : undefined;
  }

  /**
   * A press on resident `residentId` at world point `at`: can they be carried? Not while they are still on the boat
   * (they move house once they are on land) and not if they are not there.
   */
  grab(residentId: number, at: Point): boolean {
    this.held = undefined;
    const state = this.getState();
    const resident = state.residents.find((r) => r.id === residentId);
    if (!resident || resident.doing === 'boat') {
      return false;
    }
    this.held = { residentId, at, carried: false, target: undefined };
    return true;
  }

  /** The finger moved to `at` (world px) while holding; `overUi`: it is over a bar or a card (no house there). */
  carry(at: Point, overUi = false): void {
    const held = this.held;
    if (!held) {
      return;
    }
    const target = overUi ? undefined : homeTargetAt(this.getState(), held.residentId, at);
    if (!held.carried || !sameTarget(held.target, target)) {
      this.changes += 1;
    }
    held.at = at;
    held.carried = true;
    held.target = target;
  }

  /**
   * Released at `at` (world px): into the house under the finger if it has room; anywhere else (also over a bar or a
   * card, `overUi`) nothing happens.
   */
  drop(at: Point, overUi = false): DropResult | undefined {
    const held = this.held;
    if (!held) {
      return undefined;
    }
    this.held = undefined;
    this.changes += 1;
    // The state may have changed since the last move (a guest moved in): look again.
    const target = overUi ? undefined : homeTargetAt(this.getState(), held.residentId, at);
    const moved = target?.result === 'ok';
    if (target && moved) {
      this.send({ type: 'assignHome', residentId: held.residentId, houseId: target.houseId });
    }
    return { residentId: held.residentId, moved, target };
  }

  /** Let go without a drop (released without moving, a second finger, the system took the pointer). */
  cancel(): void {
    if (this.held) {
      const wasCarried = this.held.carried;
      this.held = undefined;
      if (wasCarried) {
        this.changes += 1;
      }
    }
  }
}

function sameTarget(a: HomeTarget | undefined, b: HomeTarget | undefined): boolean {
  return a === b || (a !== undefined && b !== undefined && a.houseId === b.houseId && a.result === b.result && a.used === b.used && a.capacity === b.capacity);
}
