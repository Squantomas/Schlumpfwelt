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
 *   (`building`, only taken when there is no other way). Water can not be walked.
 * - `boat.speed`: steps per tick of the boat (same steps per tile).
 * - `routine`: ticks at work before going home (`workTicks`), at home
 *   (`restTicks`), at a place they visit (`visitTicks`), before trying again
 *   when there was no way (`waitTicks`); `tripsBeforeRest` deliveries to the
 *   market before a worker goes home for a rest.
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
  readonly boat: { readonly speed: number };
  readonly routine: {
    readonly workTicks: number;
    readonly restTicks: number;
    readonly visitTicks: number;
    readonly waitTicks: number;
    readonly tripsBeforeRest: number;
  };
}

export const RESIDENT_RULES: ResidentRules = residentsJson;

/** The first names, in the order of the file (each is used once before any name comes twice). */
export const RESIDENT_NAMES: readonly string[] = namesJson.names;

/** The colours of the hats, by id. */
export const HAT_IDS: readonly string[] = RESIDENT_RULES.hats;

/** The longest name the game accepts (names from files are cut to it). */
export const MAX_NAME_LENGTH = 24;
