/**
 * How the residents feel (M7): happy, normal or sad – and why. Pure and
 * deterministic like the rest of the simulation.
 *
 * Rules (as simple as a child expects them, and never a punishment):
 * - **Decoration** (flowers, a bench, a pond …) within `mood.decoRadius`
 *   tiles of the house makes its residents happy.
 * - **A long way to work** – more than `mood.farTiles` steps from the door of
 *   the house to the door of the work, counted straight across the tiles
 *   (no detours) – makes sad. The way never costs anything else: carrying is
 *   only shown, the store gets the goods at once.
 * - **Hunger** makes sad: it was time to eat and the store had nothing.
 * - One point for decoration, minus one for a long way, minus one for hunger:
 *   above zero is happy, below zero sad, zero normal. So hunger and a long
 *   way take away one step each, and decoration makes up for one of them.
 * - **Without a home** neither decoration nor a way count: normal (sad only
 *   when hungry). Nobody is punished for having no house, nobody moves out,
 *   nothing gets worse over time.
 * - The mood only changes how fast a worker works (`mood.pace`: happy a bit
 *   faster, sad a bit slower – never stopped, see `production.ts`).
 *
 * The mood is not stored: it follows from the village (decoration near every
 * house and the doors of the buildings, worked out once per change of the
 * village) and the hunger of the resident. So it is the same after loading,
 * and it changes at once when a child puts a flower beside the house.
 *
 * Food: every resident eats one unit from the store now and then – the
 * first of `food.goods` that is there (cake, else berries). The next meal
 * comes `food.mealTicks` later, with many residents later still: the village
 * as a whole eats at most one unit every `food.mealGapTicks` ticks, so a berry
 * garden (one berry every few seconds, even with a sad gardener) always makes
 * more than everybody eats. With nothing in the store a resident is hungry and
 * looks again after `food.retryTicks`.
 */
import { buildingType } from '../data/buildings';
import { FOOD_RULES, MOOD_RULES, type Mood } from '../data/residents';
import type { PlacedBuilding } from './buildings';
import { amountOf, type Inventory } from './economy';
import { MAX_RESIDENTS } from './limits';
import type { DeepReadonly } from './readonly';
import type { Resident } from './residents';
import type { SimState } from './state';
import { doorOf, type WalkView } from './walk';

export type { Mood } from '../data/residents';

/** The moods from happy to sad. */
export const MOODS: readonly Mood[] = ['happy', 'normal', 'sad'];

/** What a resident's mood comes from (for the card) and the mood itself. */
export interface MoodFactors {
  readonly mood: Mood;
  /** No house (yet). */
  readonly homeless: boolean;
  /** Decoration near the house. */
  readonly deco: boolean;
  /** Home and work are far apart. */
  readonly far: boolean;
  /** Home and work are near each other (both there and not far). */
  readonly near: boolean;
  readonly hungry: boolean;
}

/** What the mood reads (the same as a search for a way). */
export type MoodView = WalkView;

// --- What the moods need to know about the village (worked out once per change) ---

interface MoodIndex {
  readonly world: object;
  readonly buildings: object;
  readonly paths: object;
  readonly revision: number;
  readonly buildingCount: number;
  readonly pathCount: number;
  readonly byId: ReadonlyMap<number, DeepReadonly<PlacedBuilding>>;
  /** 1 on every tile covered by decoration. */
  readonly deco: Uint8Array;
  /** Per house (by id): decoration near it? Filled when asked. */
  readonly decorated: Map<number, boolean>;
  /** Per building (by id): its door (tile index). Filled when asked. */
  readonly doors: Map<number, number>;
}

const indexes = new WeakMap<object, MoodIndex>();

function moodIndex(view: MoodView): MoodIndex {
  const cached = indexes.get(view.world);
  if (
    cached &&
    cached.buildings === view.buildings &&
    cached.paths === view.paths &&
    cached.revision === view.revision &&
    cached.buildingCount === view.buildings.length &&
    cached.pathCount === view.paths.length
  ) {
    return cached;
  }
  const { width, height } = view.world;
  const deco = new Uint8Array(width * height);
  const byId = new Map<number, DeepReadonly<PlacedBuilding>>();
  for (const building of view.buildings) {
    byId.set(building.id, building);
    const type = buildingType(building.type);
    if (type?.category !== 'deco') {
      continue;
    }
    for (let dy = 0; dy < type.footprint.h; dy += 1) {
      for (let dx = 0; dx < type.footprint.w; dx += 1) {
        const x = building.x + dx;
        const y = building.y + dy;
        if (x >= 0 && y >= 0 && x < width && y < height) {
          deco[y * width + x] = 1;
        }
      }
    }
  }
  const index: MoodIndex = {
    world: view.world,
    buildings: view.buildings,
    paths: view.paths,
    revision: view.revision,
    buildingCount: view.buildings.length,
    pathCount: view.paths.length,
    byId,
    deco,
    decorated: new Map(),
    doors: new Map(),
  };
  indexes.set(view.world, index);
  return index;
}

/** Is there decoration within `decoRadius` tiles of the house (its footprint grown by the radius on every side)? */
function isDecorated(view: MoodView, index: MoodIndex, house: DeepReadonly<PlacedBuilding>): boolean {
  const known = index.decorated.get(house.id);
  if (known !== undefined) {
    return known;
  }
  const { width, height } = view.world;
  const type = buildingType(house.type);
  const w = type?.footprint.w ?? 1;
  const h = type?.footprint.h ?? 1;
  const radius = MOOD_RULES.decoRadius;
  let found = false;
  for (let y = Math.max(0, house.y - radius); y <= Math.min(height - 1, house.y + h - 1 + radius) && !found; y += 1) {
    for (let x = Math.max(0, house.x - radius); x <= Math.min(width - 1, house.x + w - 1 + radius); x += 1) {
      if (index.deco[y * width + x] === 1) {
        found = true;
        break;
      }
    }
  }
  index.decorated.set(house.id, found);
  return found;
}

function doorIn(view: MoodView, index: MoodIndex, building: DeepReadonly<PlacedBuilding>): number {
  const known = index.doors.get(building.id);
  if (known !== undefined) {
    return known;
  }
  const door = doorOf(view, building);
  index.doors.set(building.id, door);
  return door;
}

/** Steps between two tiles straight across the grid (no detours). */
function stepsBetween(width: number, a: number, b: number): number {
  const ax = a % width;
  const bx = b % width;
  return Math.abs(ax - bx) + Math.abs((a - ax) / width - (b - bx) / width);
}

/** Steps from the door of the resident's house to the door of their work, or `undefined` without one of them. */
export function wayToWork(view: MoodView, resident: DeepReadonly<Pick<Resident, 'home' | 'job'>>): number | undefined {
  const index = moodIndex(view);
  const home = resident.home !== null ? index.byId.get(resident.home) : undefined;
  const job = resident.job !== null ? index.byId.get(resident.job) : undefined;
  if (!home || !job) {
    return undefined;
  }
  return stepsBetween(view.world.width, doorIn(view, index, home), doorIn(view, index, job));
}

/** The mood a resident has now, and why. */
export function moodOf(view: MoodView, resident: DeepReadonly<Pick<Resident, 'home' | 'job' | 'hungry'>>): MoodFactors {
  const index = moodIndex(view);
  const home = resident.home !== null ? index.byId.get(resident.home) : undefined;
  const homeless = home === undefined || buildingType(home.type)?.category !== 'house';
  const deco = !homeless && home !== undefined && isDecorated(view, index, home);
  const way = homeless ? undefined : wayToWork(view, resident);
  const far = way !== undefined && way > MOOD_RULES.farTiles;
  const near = way !== undefined && !far;
  const hungry = resident.hungry;
  const score = (deco ? 1 : 0) - (far ? 1 : 0) - (hungry ? 1 : 0);
  const mood: Mood = score > 0 ? 'happy' : score < 0 ? 'sad' : 'normal';
  return { mood, homeless, deco, far, near, hungry };
}

/** How fast a worker in this mood works, in percent (`mood.pace`). */
export function paceOf(mood: Mood): number {
  return MOOD_RULES.pace[mood];
}

/**
 * How fast every production building with a worker works now (building id →
 * percent, from the mood of its worker). A building without a worker (only
 * when the village has as many residents as it may have) works at 100 %.
 */
export function workPaces(view: MoodView & DeepReadonly<Pick<SimState, 'residents'>>): Map<number, number> {
  const paces = new Map<number, number>();
  for (const resident of view.residents) {
    if (resident.job !== null) {
      paces.set(resident.job, paceOf(moodOf(view, resident).mood));
    }
  }
  return paces;
}

/** The mood of the worker of a building, or `undefined` when nobody works there. */
export function workerMood(view: MoodView & DeepReadonly<Pick<SimState, 'residents'>>, buildingId: number): Mood | undefined {
  const worker = view.residents.find((resident) => resident.job === buildingId);
  return worker ? moodOf(view, worker).mood : undefined;
}

// --- Food ---

/** Ticks from one meal of a resident to the next in a village of `count` residents. */
export function mealInterval(count: number): number {
  return Math.max(FOOD_RULES.mealTicks, Math.max(1, Math.floor(count)) * FOOD_RULES.mealGapTicks);
}

/**
 * The first meal of the `index`-th of `count` residents who come together (an old village that is loaded): spread
 * over one time between meals, so they do not all eat at the same moment.
 */
export function firstMeal(index: number, count: number): number {
  const n = Math.max(1, Math.floor(count));
  return Math.max(1, Math.round((mealInterval(n) * (Math.max(0, Math.floor(index)) + 1)) / n));
}

/** The longest time to the next meal (ticks): a file may not ask for more. */
export const LONGEST_MEAL = Math.max(mealInterval(MAX_RESIDENTS), FOOD_RULES.retryTicks);

/**
 * It is time to eat: one unit of the first food the store has (cake, else
 * berries). Without food the resident is hungry and looks again after `retryTicks`.
 * `count` is the number of residents (for the time to the next meal).
 */
export function eat(inventory: Inventory, resident: Resident, count: number): void {
  const food = FOOD_RULES.goods.find((good) => amountOf(inventory, good) > 0);
  if (food === undefined) {
    resident.hungry = true;
    resident.meal = FOOD_RULES.retryTicks;
    return;
  }
  inventory[food] = amountOf(inventory, food) - 1;
  resident.hungry = false;
  resident.meal = mealInterval(count);
}
