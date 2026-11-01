import namesJson from './names.json';
import residentsJson from './residents.json';

/**
 * The residents' numbers from `residents.json` and their first names from
 * `names.json` (M6). Balancing without code: how fast residents walk, what
 * walking over which ground costs (the search prefers paths), how fast the
 * boat is and how long the parts of the day take.
 *
 * - `hats`: the colours of the pointed hats, by id (the text is `hat.<id>`,
 *   the colour `HAT_COLORS` in `src/ui/style.ts`); a resident keeps the index.
 * - `walk.stepsPerTile`: one tile is this many steps; `pathSpeed` and
 *   `groundSpeed` are steps per tick on a path (both tiles are paths) and
 *   beside it. 10 ticks are one second.
 * - `walk.cost`: what entering a tile costs the search: a path, meadow or
 *   beach (`ground`), forest or rock (`rough`), a building's footprint
 *   (`building`, so dear that it is only taken when there is no other way:
 *   nobody walks over a roof to save a detour). Water can not be walked.
 * - `boat.speed`: steps per tick of the boat coming in (same steps per tile),
 *   `boat.leaveSpeed` when it sails away; `boat.approachTiles`: it comes into
 *   sight this many tiles before the shore (not from the edge of the map), so
 *   the arrival takes a few seconds that a child can watch.
 * - `routine`: ticks at work before going home (`workTicks`), at home
 *   (`restTicks`), at a place they visit (`visitTicks`), before trying again
 *   when there was no way (`waitTicks`) or when the goal is cut off by water
 *   (`cutOffTicks`; a change of the village that joins the land ends the wait
 *   at once); `tripsBeforeRest` deliveries to the market before a worker goes
 *   home for a rest.
 * - `mood` (M7, see `src/sim/mood.ts`): decoration within `decoRadius` tiles
 *   of the house makes happy, a way from the door of the house to the door of
 *   the work of more than `farTiles` steps (straight line, no detours) makes
 *   sad; `pace` is how fast a worker works in each mood, in percent (a round
 *   takes `intervalTicks × 100 / pace` ticks).
 * - `food` (M7): every resident eats one unit from the store now and then –
 *   the first of `goods` that is there (cake, else berries). The next meal
 *   comes `mealTicks` later, but with many residents later still: the village
 *   as a whole eats at most one unit every `mealGapTicks` (so a berry garden
 *   always makes more than everybody eats, even with a sad gardener). With
 *   nothing to eat a resident is hungry and looks again after `retryTicks`.
 */

export interface WalkCosts {
  readonly path: number;
  readonly ground: number;
  readonly rough: number;
  readonly building: number;
}

export interface ResidentRules {
  readonly hats: readonly string[];
  readonly walk: { readonly stepsPerTile: number; readonly pathSpeed: number; readonly groundSpeed: number; readonly cost: WalkCosts };
  readonly boat: { readonly speed: number; readonly leaveSpeed: number; readonly approachTiles: number };
  readonly routine: {
    readonly workTicks: number;
    readonly restTicks: number;
    readonly visitTicks: number;
    readonly waitTicks: number;
    readonly cutOffTicks: number;
    readonly tripsBeforeRest: number;
  };
}

export type Mood = 'happy' | 'normal' | 'sad';

export interface MoodRules {
  readonly decoRadius: number;
  readonly farTiles: number;
  readonly pace: Readonly<Record<Mood, number>>;
}

export interface FoodRules {
  readonly goods: readonly string[];
  readonly mealTicks: number;
  readonly mealGapTicks: number;
  readonly retryTicks: number;
}

export const RESIDENT_RULES: ResidentRules = residentsJson;

/** How the residents feel and what makes them feel so (M7). */
export const MOOD_RULES: MoodRules = residentsJson.mood;

/** What and how often the residents eat (M7). */
export const FOOD_RULES: FoodRules = residentsJson.food;

/** The longest a resident stays or waits anywhere (ticks): a file may not ask for more. */
export const LONGEST_TIMER = Math.max(
  RESIDENT_RULES.routine.workTicks,
  RESIDENT_RULES.routine.restTicks,
  RESIDENT_RULES.routine.visitTicks,
  RESIDENT_RULES.routine.waitTicks,
  RESIDENT_RULES.routine.cutOffTicks,
);

/** The first names, in the order of the file (each is used once before any name comes twice). */
export const RESIDENT_NAMES: readonly string[] = namesJson.names;

/** The colours of the hats, by id. */
export const HAT_IDS: readonly string[] = RESIDENT_RULES.hats;

/** The longest name the game accepts (names from files are cut to it). */
export const MAX_NAME_LENGTH = 24;
