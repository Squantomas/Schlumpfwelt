import type Phaser from 'phaser';
import { hash2 } from '../../sim/random';
import { boatPoint, residentPoint } from '../../sim/residents';
import type { Simulation } from '../../sim/simulation';
import type { ResidentSpot } from '../../ui/residentHit';
import { TILE_SIZE, clamp } from '../../ui/style';
import { goodTextureKey } from './goodTextures';
import { TEXTURE_SCALE } from './objectTextures';
import {
  BOAT_BACK_KEY,
  BOAT_FRONT_KEY,
  BOAT_ORIGIN,
  BOAT_SEAT_Y,
  RESIDENT_CARRY_Y,
  RESIDENT_ORIGIN,
  RESIDENT_RING_KEY,
  residentTextureKey,
} from './residentTextures';

/** Size of the carried good over the head (world px); far out it grows to stay at least this many CSS px. */
const CARRY_SIZE = 26;
const CARRY_MIN_CSS = 16;
/** How far the residents stand apart on one tile (fraction of a tile), so the two at one door do not cover each other. */
const SPREAD_X = 0.44;
const SPREAD_Y = 0.26;
/** The feet stand a little below the middle of the tile (fraction of a tile). */
const FOOT_DOWN = 0.12;
/** The water line of a boat below the middle of its tile (world px). */
const BOAT_WATER_DOWN = 10;

interface Figure {
  readonly sprite: Phaser.GameObjects.Image;
  hat: number;
  carry: Phaser.GameObjects.Image | undefined;
  carrying: string | null;
  /** 1: looks right, -1: looks left (keeps the last way they walked). */
  facing: number;
  depth: number;
}

/** Where a resident is drawn (feet, world px) and whether the carried good shows over their head. */
export interface DrawnResident {
  readonly x: number;
  readonly y: number;
  readonly carry: boolean;
}

interface BoatFigure {
  readonly back: Phaser.GameObjects.Image;
  readonly front: Phaser.GameObjects.Image;
  facing: number;
}

/**
 * The residents and their boats on the island (M6), in the world layer. Every
 * frame it puts each resident where the simulation says they are – between
 * two ticks it goes on at their speed (`residentPoint` with `alpha`), so the
 * walk is smooth although the simulation ticks only 10 times per second.
 * Residents are sorted by their feet like trees and houses, bob while they
 * walk, look the way they go and carry the good of their workplace (a small
 * picture over the head) to the market. A boat is drawn in two parts with
 * the passenger between them. The figures take no taps themselves: the scene
 * asks {@link spots} (see `residentHit.ts`).
 */
export class ResidentView {
  private readonly figures = new Map<number, Figure>();
  private readonly boats = new Map<number, BoatFigure>();
  private readonly ring: Phaser.GameObjects.Image;
  private spotList: ResidentSpot[] = [];
  /** Where each resident was drawn this frame (feet, world px) and whether the good they carry is shown over the head. */
  private readonly drawn = new Map<number, DrawnResident>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly layer: Phaser.GameObjects.Layer,
    private readonly simulation: Simulation,
  ) {
    this.ring = scene.add.image(0, 0, RESIDENT_RING_KEY).setVisible(false).setScale(1 / TEXTURE_SCALE);
    layer.add(this.ring);
  }

  /** Where the residents are drawn now (feet, world px), for the hit test. */
  get spots(): readonly ResidentSpot[] {
    return this.spotList;
  }

  /** Where a resident is drawn now (feet, world px, and whether the carried good shows), or `undefined`. */
  positionOf(id: number): DrawnResident | undefined {
    return this.drawn.get(id);
  }

  /**
   * Draws the residents `alpha` (0 … 1) of a tick after the current state.
   * `seconds` is the smooth simulation time (for bobbing), `zoom` CSS px per
   * world px, `selected` the resident whose card is open (a ring under them).
   */
  update(alpha: number, seconds: number, zoom: number, selected: number | undefined): void {
    const state = this.simulation.state;
    const seen = new Set<number>();
    const spots: ResidentSpot[] = [];
    this.drawn.clear();
    const carrySize = clamp(CARRY_MIN_CSS / Math.max(zoom, 0.01), CARRY_SIZE, CARRY_SIZE * 2);
    let ringAt: { x: number; y: number; scale: number } | undefined;

    for (const resident of state.residents) {
      seen.add(resident.id);
      let figure = this.figures.get(resident.id);
      if (!figure) {
        const sprite = this.scene.add
          .image(0, 0, residentTextureKey(resident.hat))
          .setOrigin(RESIDENT_ORIGIN.x, RESIDENT_ORIGIN.y)
          .setScale(1 / TEXTURE_SCALE);
        this.layer.add(sprite);
        figure = { sprite, hat: resident.hat, carry: undefined, carrying: null, facing: hash2(resident.id, 2, 9) < 0.5 ? -1 : 1, depth: Number.NaN };
        this.figures.set(resident.id, figure);
      }
      if (figure.hat !== resident.hat) {
        figure.hat = resident.hat;
        figure.sprite.setTexture(residentTextureKey(resident.hat));
      }
      const point = residentPoint(state, resident, alpha);
      if (!point) {
        // On the boat: the boat draws them.
        figure.sprite.setVisible(false);
        figure.carry?.setVisible(false);
        continue;
      }
      if (point.dx !== 0) {
        figure.facing = point.dx;
      }
      const footX = (point.x + (hash2(resident.id, 17, 3) - 0.5) * SPREAD_X) * TILE_SIZE;
      const footY = (point.y + FOOT_DOWN + (hash2(resident.id, 5, 11) - 0.5) * SPREAD_Y) * TILE_SIZE;
      const phase = seconds * 11 + resident.id * 1.3;
      let lift = 0;
      let angle = 0;
      if (point.moving) {
        lift = Math.abs(Math.sin(phase)) * 3.2;
        angle = Math.sin(phase) * 5;
      } else if (resident.doing === 'stay' && resident.goal === 'work') {
        // Busy at work: a small hop now and then.
        lift = Math.max(0, Math.sin(seconds * 6 + resident.id)) * 2.2;
      }
      figure.sprite
        .setVisible(true)
        .setPosition(footX, footY - lift)
        .setAngle(angle)
        .setFlipX(figure.facing < 0);
      if (figure.depth !== footY) {
        figure.depth = footY;
        figure.sprite.setDepth(footY);
      }
      this.drawCarry(figure, resident.carrying, footX, footY - lift - RESIDENT_CARRY_Y - carrySize / 2, footY, carrySize);
      spots.push({ id: resident.id, x: footX, y: footY });
      this.drawn.set(resident.id, { x: footX, y: footY, carry: figure.carry?.visible === true });
      if (resident.id === selected) {
        ringAt = { x: footX, y: footY, scale: 1 };
      }
    }
    for (const [id, figure] of this.figures) {
      if (!seen.has(id)) {
        figure.sprite.destroy();
        figure.carry?.destroy();
        this.figures.delete(id);
      }
    }

    const boatsSeen = new Set<number>();
    for (const boat of state.boats) {
      boatsSeen.add(boat.id);
      let figure = this.boats.get(boat.id);
      if (!figure) {
        const back = this.scene.add.image(0, 0, BOAT_BACK_KEY).setOrigin(BOAT_ORIGIN.x, BOAT_ORIGIN.y).setScale(1 / TEXTURE_SCALE);
        const front = this.scene.add.image(0, 0, BOAT_FRONT_KEY).setOrigin(BOAT_ORIGIN.x, BOAT_ORIGIN.y).setScale(1 / TEXTURE_SCALE);
        this.layer.add([back, front]);
        figure = { back, front, facing: 1 };
        this.boats.set(boat.id, figure);
      }
      const point = boatPoint(state, boat, alpha);
      if (point.dx !== 0) {
        figure.facing = point.dx;
      }
      const x = point.x * TILE_SIZE;
      const water = point.y * TILE_SIZE + BOAT_WATER_DOWN + Math.sin(seconds * 2.2 + boat.id) * 1.5;
      const angle = Math.sin(seconds * 1.7 + boat.id) * 2;
      const flip = figure.facing < 0;
      figure.back.setPosition(x, water).setAngle(angle).setFlipX(flip).setDepth(water - 0.02);
      figure.front.setPosition(x, water).setAngle(angle).setFlipX(flip).setDepth(water);
      const passenger = boat.passenger === null ? undefined : this.figures.get(boat.passenger);
      if (passenger && boat.passenger !== null) {
        // The passenger stands in the boat, in front of the mast.
        const seatX = x - 6 * figure.facing;
        const seatY = water - BOAT_SEAT_Y;
        passenger.sprite.setVisible(true).setPosition(seatX, seatY).setAngle(angle).setFlipX(flip).setDepth(water - 0.01);
        passenger.depth = water - 0.01;
        spots.push({ id: boat.passenger, x: seatX, y: seatY });
        this.drawn.set(boat.passenger, { x: seatX, y: seatY, carry: false });
        if (boat.passenger === selected) {
          ringAt = { x, y: water + 4, scale: 1.5 };
        }
      }
    }
    for (const [id, figure] of this.boats) {
      if (!boatsSeen.has(id)) {
        figure.back.destroy();
        figure.front.destroy();
        this.boats.delete(id);
      }
    }

    this.ring.setVisible(ringAt !== undefined);
    if (ringAt) {
      const pulse = 1 + Math.sin(seconds * 4) * 0.06;
      this.ring
        .setPosition(ringAt.x, ringAt.y)
        .setScale((ringAt.scale * pulse) / TEXTURE_SCALE)
        .setDepth(ringAt.y - 0.5);
    }
    this.spotList = spots;
  }

  /** The good over the head of a resident who carries something to the market. */
  private drawCarry(figure: Figure, carrying: string | null, x: number, y: number, depth: number, size: number): void {
    if (carrying === null) {
      figure.carry?.setVisible(false);
      figure.carrying = null;
      return;
    }
    if (!figure.carry) {
      figure.carry = this.scene.add.image(0, 0, goodTextureKey(carrying));
      this.layer.add(figure.carry);
    } else if (figure.carrying !== carrying) {
      figure.carry.setTexture(goodTextureKey(carrying));
    }
    figure.carrying = carrying;
    figure.carry.setVisible(true).setPosition(x, y).setDisplaySize(size, size).setDepth(depth + 0.01);
  }

  /** How many residents and boats are drawn (for the test marker). */
  get counts(): { readonly residents: number; readonly boats: number } {
    return { residents: this.figures.size, boats: this.boats.size };
  }
}
