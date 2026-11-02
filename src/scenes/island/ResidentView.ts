import type Phaser from 'phaser';
import { moodOf, type Mood } from '../../sim/mood';
import { hash2 } from '../../sim/random';
import { boatPoint, residentPoint, sleepOf } from '../../sim/residents';
import type { Simulation } from '../../sim/simulation';
import type { Point } from '../../ui/cameraMath';
import type { ResidentSpot } from '../../ui/residentHit';
import { TILE_SIZE, clamp } from '../../ui/style';
import { goodTextureKey } from './goodTextures';
import { TEXTURE_SCALE } from './objectTextures';
import {
  RESIDENT_SIZE,
  BOAT_BACK_KEY,
  BOAT_FRONT_KEY,
  BOAT_ORIGIN,
  BOAT_SEAT_Y,
  RESIDENT_CARRY_Y,
  RESIDENT_ORIGIN,
  RESIDENT_RING_KEY,
  moodTextureKey,
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
/** The boat is drawn this much bigger than its texture: easy to see from afar (the passenger keeps their size). */
const BOAT_SCALE = 1.25;
/** A boat comes into sight out at sea: it fades in over this many seconds. */
const BOAT_FADE_IN = 0.8;
/**
 * The mood sign over a resident (M7): a heart (happy) or a cloud (sad), never for "normal". Each resident shows it
 * now and then – for {@link SIGN_SECONDS} of every {@link SIGN_CYCLE} seconds, at their own time – so a big village
 * does not turn into a sea of signs. Size in world px, at least {@link SIGN_MIN_CSS} CSS px.
 */
const SIGN_CYCLE = 15;
const SIGN_SECONDS = 2.4;
const SIGN_SIZE = 24;
const SIGN_MIN_CSS = 16;
/** A carried resident hangs this far above the finger (CSS px), so the finger does not hide them. */
const CARRY_LIFT_CSS = 18;
/**
 * Let go (or moved house with ✓ on the card): the resident slides softly from where they were to where they are – in
 * at least {@link SLIDE_BACK} seconds, longer for a long way ({@link SLIDE_SPEED} world px per second), at most
 * {@link SLIDE_LONGEST}: nobody jumps across the island.
 */
const SLIDE_BACK = 0.28;
const SLIDE_SPEED = 1400;
const SLIDE_LONGEST = 0.9;
/**
 * Sleep (M8): a resident going to bed in their house fades out at the door in {@link SLEEP_FADE} seconds; over the
 * door of a house where somebody sleeps three little "z" bob gently (one per house). Who sleeps outside (no home)
 * lies down where they are, with the "z" over them.
 */
const SLEEP_FADE = 0.6;
const SLEEP_LIE_ANGLE = 78;
/** A carried resident is drawn in front of everything in the world (but below the tap ring). */
const CARRIED_DEPTH = 990_000;
/** Half the width of a figure (world px). */
const RESIDENT_HALF_WIDTH = RESIDENT_SIZE.width / 2;

interface Figure {
  readonly sprite: Phaser.GameObjects.Image;
  hat: number;
  carry: Phaser.GameObjects.Image | undefined;
  carrying: string | null;
  /** The mood sign over the head (made when first needed), the mood it shows and when that was worked out (tick). */
  sign: Phaser.GameObjects.Image | undefined;
  mood: Mood;
  moodTick: number;
  /**
   * Let go (M7): slides from here (world px) to where they are, starting at this time (seconds; `undefined` until
   * the first frame drawn after {@link ResidentView.letGo}, so that frame still shows them where they were let go).
   * After a move into a house (`waitFor`) they stay where they were put down until the simulation has moved them in
   * (the next tick).
   */
  back: { readonly from: Point; start: number | undefined; waitFor: number | undefined; duration: number | undefined } | undefined;
  /** 1: looks right, -1: looks left (keeps the last way they walked). */
  facing: number;
  depth: number;
  /** Since when (seconds) they are in bed inside their house (M8), `undefined` while awake or asleep outside. */
  inBedSince: number | undefined;
}

/** Where a resident is drawn (feet, world px), whether the carried good shows over their head and whether the mood sign does. */
export interface DrawnResident {
  readonly x: number;
  readonly y: number;
  readonly carry: boolean;
  readonly sign: boolean;
  /** Gliding after being let go (or waiting where they were put down until they live in the new house). */
  readonly glide: boolean;
}

/** The resident the child is carrying (M7): who, and where the finger is (world px). */
export interface CarriedResident {
  readonly residentId: number;
  readonly at: Point;
}

/** The carried figure's box this frame (world px): the middle, half its width, the top of the head (or of the mood sign over it) and the feet. */
export interface CarriedBox {
  readonly x: number;
  readonly halfWidth: number;
  readonly top: number;
  readonly bottom: number;
}

interface BoatFigure {
  readonly back: Phaser.GameObjects.Image;
  readonly front: Phaser.GameObjects.Image;
  facing: number;
  /** When it came into sight (seconds of the simulation's clock), for the fade-in. */
  readonly born: number;
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
 *
 * M7: now and then a heart (happy) or a cloud (sad) floats over a resident;
 * the mood of each figure is looked at once a second (and at once when the
 * village changes), not every frame. A resident the child carries hangs under
 * the finger, above everything; let go without moving house, they slide back.
 */
export class ResidentView {
  private readonly figures = new Map<number, Figure>();
  private readonly boats = new Map<number, BoatFigure>();
  private readonly ring: Phaser.GameObjects.Image;
  private spotList: ResidentSpot[] = [];
  /** Where each resident was drawn this frame (feet, world px) and whether the good they carry is shown over the head. */
  private readonly drawn = new Map<number, DrawnResident>();
  /** The "z" of sleep this frame (see `sleepSigns`). */
  private readonly sleepPoints: { x: number; y: number }[] = [];
  private moodRevision = -1;
  private moodTick = -1;
  /** The figure carried in the last frame and where it hung (feet, world px): carrying that ends without {@link letGo} slides back from there. */
  private lastCarried: { readonly residentId: number; readonly at: Point } | undefined;
  private carriedBoxNow: CarriedBox | undefined;

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

  /** Where the carried figure hangs this frame (world px), so the "2/2" over a house can stay above it; `undefined` while nobody is carried. */
  get carriedBox(): CarriedBox | undefined {
    return this.carriedBoxNow;
  }

  /** Where a resident is drawn now (feet, world px, and whether the carried good shows), or `undefined`. */
  positionOf(id: number): DrawnResident | undefined {
    return this.drawn.get(id);
  }

  /**
   * A carried resident was let go at `from` (world px): they slide back to where they are – or, after moving into
   * house `movedTo` (also with ✓ on the card), wait there until the simulation has moved them in and then slide to
   * its door. The slide takes longer for a long way (see {@link SLIDE_SPEED}).
   */
  letGo(residentId: number, from: Point, movedTo?: number): void {
    const figure = this.figures.get(residentId);
    if (figure) {
      figure.back = { from: { x: from.x, y: from.y }, start: undefined, waitFor: movedTo, duration: undefined };
    }
    if (this.lastCarried?.residentId === residentId) {
      this.lastCarried = undefined;
    }
  }

  /**
   * Draws the residents `alpha` (0 … 1) of a tick after the current state.
   * `seconds` is the smooth simulation time (for bobbing), `zoom` CSS px per
   * world px, `selected` the resident whose card is open (a ring under them),
   * `carried` the one the child is carrying (M7).
   */
  update(alpha: number, seconds: number, zoom: number, selected: number | undefined, carried?: CarriedResident): void {
    const state = this.simulation.state;
    const seen = new Set<number>();
    const spots: ResidentSpot[] = [];
    this.drawn.clear();
    const carrySize = clamp(CARRY_MIN_CSS / Math.max(zoom, 0.01), CARRY_SIZE, CARRY_SIZE * 2);
    const signSize = clamp(SIGN_MIN_CSS / Math.max(zoom, 0.01), SIGN_SIZE, SIGN_SIZE * 2.5);
    // The moods: all at once when the village changed (a flower was put down), else each resident once a second.
    const allMoods = state.revision !== this.moodRevision;
    const newTick = state.tick !== this.moodTick;
    this.moodRevision = state.revision;
    this.moodTick = state.tick;
    let ringAt: { x: number; y: number; scale: number } | undefined;
    // Carrying ended without anybody saying where (the shop opened, a second finger, the system took the pointer):
    // the figure slides back from where it hung instead of jumping.
    const ended = this.lastCarried;
    if (ended && ended.residentId !== carried?.residentId) {
      const figure = this.figures.get(ended.residentId);
      if (figure && !figure.back) {
        figure.back = { from: ended.at, start: seconds, waitFor: undefined, duration: undefined };
      }
      this.lastCarried = undefined;
    }
    this.carriedBoxNow = undefined;
    /** Houses whose "z" is drawn this frame (one per house). */
    const sleepingHomes = new Set<number>();
    this.sleepPoints.length = 0;

    for (const resident of state.residents) {
      seen.add(resident.id);
      let figure = this.figures.get(resident.id);
      if (!figure) {
        const sprite = this.scene.add
          .image(0, 0, residentTextureKey(resident.hat))
          .setOrigin(RESIDENT_ORIGIN.x, RESIDENT_ORIGIN.y)
          .setScale(1 / TEXTURE_SCALE);
        this.layer.add(sprite);
        figure = {
          sprite,
          hat: resident.hat,
          carry: undefined,
          carrying: null,
          sign: undefined,
          mood: 'normal',
          moodTick: Number.NEGATIVE_INFINITY,
          back: undefined,
          facing: hash2(resident.id, 2, 9) < 0.5 ? -1 : 1,
          depth: Number.NaN,
          inBedSince: undefined,
        };
        this.figures.set(resident.id, figure);
      }
      if (allMoods || (newTick && (state.tick + resident.id) % 10 === 0) || figure.moodTick === Number.NEGATIVE_INFINITY) {
        figure.mood = moodOf(state, resident).mood;
        figure.moodTick = state.tick;
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
        figure.sign?.setVisible(false);
        continue;
      }
      if (carried?.residentId === resident.id) {
        // Carried by the child: under the finger, a little above it, swinging gently, in front of everything.
        const liftWorld = CARRY_LIFT_CSS / Math.max(zoom, 0.01);
        const footX = carried.at.x;
        const footY = carried.at.y - liftWorld;
        figure.back = undefined;
        figure.sprite.setVisible(true).setAlpha(1).setPosition(footX, footY).setAngle(Math.sin(seconds * 7) * 8).setFlipX(figure.facing < 0);
        figure.depth = Number.NaN;
        figure.sprite.setDepth(CARRIED_DEPTH);
        figure.carry?.setVisible(false);
        this.drawSign(figure, figure.mood !== 'normal', footX, footY - RESIDENT_CARRY_Y - signSize / 2, CARRIED_DEPTH, signSize);
        const signShown = figure.sign?.visible === true;
        this.drawn.set(resident.id, { x: footX, y: footY, carry: false, sign: signShown, glide: false });
        this.lastCarried = { residentId: resident.id, at: { x: footX, y: footY } };
        this.carriedBoxNow = { x: footX, halfWidth: Math.max(RESIDENT_HALF_WIDTH, signSize / 2), top: footY - RESIDENT_CARRY_Y - (signShown ? signSize : 0), bottom: footY };
        continue;
      }
      if (point.dx !== 0) {
        figure.facing = point.dx;
      }
      let footX = (point.x + (hash2(resident.id, 17, 3) - 0.5) * SPREAD_X) * TILE_SIZE;
      let footY = (point.y + FOOT_DOWN + (hash2(resident.id, 5, 11) - 0.5) * SPREAD_Y) * TILE_SIZE;
      if (figure.back) {
        figure.back.start ??= seconds;
      }
      if (figure.back?.waitFor !== undefined) {
        // Put down on a house: they wait where they are until they live there (at most a second), then go to the door.
        if (resident.home !== figure.back.waitFor && seconds - (figure.back.start ?? seconds) < 1) {
          footX = figure.back.from.x;
          footY = figure.back.from.y;
        } else {
          figure.back.waitFor = undefined;
          figure.back.start = seconds;
        }
      }
      if (figure.back && figure.back.waitFor === undefined) {
        // Back to where they are, quickly and softly – a long way a little longer.
        figure.back.duration ??= clamp(Math.hypot(footX - figure.back.from.x, footY - figure.back.from.y) / SLIDE_SPEED, SLIDE_BACK, SLIDE_LONGEST);
        const done = clamp((seconds - (figure.back.start ?? seconds)) / figure.back.duration, 0, 1);
        const ease = 1 - (1 - done) * (1 - done);
        footX = figure.back.from.x + (footX - figure.back.from.x) * ease;
        footY = figure.back.from.y + (footY - figure.back.from.y) * ease;
        if (done >= 1) {
          figure.back = undefined;
        }
      }
      const sleep = sleepOf(state, resident);
      if (sleep !== 'awake') {
        this.drawSleeper(figure, resident.id, resident.home, sleep, footX, footY, seconds, sleepingHomes, spots);
        continue;
      }
      figure.inBedSince = undefined;
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
      if (figure.sprite.alpha !== 1) {
        // Stepped out of a boat that was still fading in.
        figure.sprite.setAlpha(1);
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
      // The mood sign takes the place of a carried good: only one thing floats over a head.
      const signAt = (seconds + hash2(resident.id, 23, 7) * SIGN_CYCLE) % SIGN_CYCLE;
      const signShown = figure.mood !== 'normal' && resident.carrying === null && signAt < SIGN_SECONDS;
      const pop = signShown ? Math.min(1, signAt / 0.25, (SIGN_SECONDS - signAt) / 0.25) : 0;
      this.drawSign(figure, signShown, footX, footY - lift - RESIDENT_CARRY_Y - signSize / 2 - (1 - pop) * 6, footY, signSize * (0.6 + 0.4 * pop));
      spots.push({ id: resident.id, x: footX, y: footY });
      this.drawn.set(resident.id, { x: footX, y: footY, carry: figure.carry?.visible === true, sign: signShown, glide: figure.back !== undefined });
      if (resident.id === selected) {
        ringAt = { x: footX, y: footY, scale: 1 };
      }
    }
    for (const [id, figure] of this.figures) {
      if (!seen.has(id)) {
        figure.sprite.destroy();
        figure.carry?.destroy();
        figure.sign?.destroy();
        this.figures.delete(id);
      }
    }

    const boatsSeen = new Set<number>();
    for (const boat of state.boats) {
      boatsSeen.add(boat.id);
      let figure = this.boats.get(boat.id);
      if (!figure) {
        const back = this.scene.add.image(0, 0, BOAT_BACK_KEY).setOrigin(BOAT_ORIGIN.x, BOAT_ORIGIN.y).setScale(BOAT_SCALE / TEXTURE_SCALE);
        const front = this.scene.add.image(0, 0, BOAT_FRONT_KEY).setOrigin(BOAT_ORIGIN.x, BOAT_ORIGIN.y).setScale(BOAT_SCALE / TEXTURE_SCALE);
        this.layer.add([back, front]);
        figure = { back, front, facing: 1, born: seconds };
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
      const shown = clamp((seconds - figure.born) / BOAT_FADE_IN, 0, 1);
      figure.back.setPosition(x, water).setAngle(angle).setFlipX(flip).setDepth(water - 0.02).setAlpha(shown);
      figure.front.setPosition(x, water).setAngle(angle).setFlipX(flip).setDepth(water).setAlpha(shown);
      const passenger = boat.passenger === null ? undefined : this.figures.get(boat.passenger);
      if (passenger && boat.passenger !== null) {
        // The passenger stands in the boat, in front of the mast.
        const seatX = x - 6 * BOAT_SCALE * figure.facing;
        const seatY = water - BOAT_SEAT_Y * BOAT_SCALE;
        passenger.sprite.setVisible(true).setPosition(seatX, seatY).setAngle(angle).setFlipX(flip).setDepth(water - 0.01).setAlpha(shown);
        passenger.depth = water - 0.01;
        spots.push({ id: boat.passenger, x: seatX, y: seatY });
        this.drawn.set(boat.passenger, { x: seatX, y: seatY, carry: false, sign: false, glide: false });
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

  /**
   * A resident in bed (M8). Inside their house: they fade out at the door, then only the "z" over the door shows (one
   * per house) – nobody can be tapped there. Outside: they lie where they are, with the "z" over them (and can still
   * be tapped).
   */
  private drawSleeper(
    figure: Figure,
    id: number,
    home: number | null,
    sleep: 'inside' | 'outside',
    footX: number,
    footY: number,
    seconds: number,
    homes: Set<number>,
    spots: ResidentSpot[],
  ): void {
    figure.carry?.setVisible(false);
    const bob = Math.sin(seconds * 2 + id) * 3;
    if (sleep === 'inside') {
      figure.inBedSince ??= seconds;
      const fade = clamp(1 - (seconds - figure.inBedSince) / SLEEP_FADE, 0, 1);
      figure.sprite.setVisible(fade > 0).setAlpha(fade).setAngle(0).setPosition(footX, footY);
      const first = home !== null && !homes.has(home);
      if (home !== null) {
        homes.add(home);
      }
      figure.sign?.setVisible(false);
      if (first) {
        this.sleepPoints.push({ x: footX, y: footY - RESIDENT_CARRY_Y + bob });
      }
      this.drawn.set(id, { x: footX, y: footY, carry: false, sign: first, glide: false });
      return;
    }
    figure.inBedSince = undefined;
    figure.sprite.setVisible(true).setAlpha(1).setPosition(footX, footY).setAngle(SLEEP_LIE_ANGLE * figure.facing).setFlipX(figure.facing < 0);
    if (figure.depth !== footY) {
      figure.depth = footY;
      figure.sprite.setDepth(footY);
    }
    figure.sign?.setVisible(false);
    this.sleepPoints.push({ x: footX + 14 * figure.facing, y: footY - 34 + bob });
    spots.push({ id, x: footX, y: footY });
    this.drawn.set(id, { x: footX, y: footY, carry: false, sign: true, glide: false });
  }

  /**
   * Where the "z" of sleep stand this frame (world px: the middle of their lower edge), one per house with somebody
   * asleep inside and one per resident asleep outside. They are drawn by the night layer above its dark (M9,
   * Korrekturrunde 1 – in the world they were hidden under it).
   */
  get sleepSigns(): readonly { readonly x: number; readonly y: number }[] {
    return this.sleepPoints;
  }

  /** The heart or cloud over a head (M7), made when first needed. */
  private drawSign(figure: Figure, shown: boolean, x: number, y: number, depth: number, size: number): void {
    if (!shown) {
      figure.sign?.setVisible(false);
      return;
    }
    const key = moodTextureKey(figure.mood);
    if (!figure.sign) {
      figure.sign = this.scene.add.image(0, 0, key);
      this.layer.add(figure.sign);
    } else if (figure.sign.texture.key !== key) {
      figure.sign.setTexture(key);
    }
    figure.sign.setVisible(true).setPosition(x, y).setDisplaySize(size, size).setDepth(depth + 0.02);
  }

  /** How many residents and boats are drawn (for the test marker). */
  get counts(): { readonly residents: number; readonly boats: number } {
    return { residents: this.figures.size, boats: this.boats.size };
  }
}
