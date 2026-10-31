/**
 * Limits of a village. They protect the game from files that were made to stand it still (loading cuts
 * to them, see `saveData.ts`) and are the same for building (`checkPlacement`: "Dein Dorf ist voll."), so
 * nothing the player builds is silently dropped when the game is loaded again. A child's village has
 * dozens of buildings; the limits are far above that.
 */

/** Buildings (houses, decoration, production buildings) in one village. */
export const MAX_BUILDINGS = 1000;

/** Production buildings among them (each one works in every tick). */
export const MAX_PRODUCERS = 200;

/** Building ids are below this; `nextBuildingId` never goes beyond it (a village that reaches it is full). */
export const MAX_ID = 2 ** 31 - 1;

/**
 * Residents in one village (M6). Far above what a child invites; it is also above the most production buildings,
 * so every production building always finds a worker (see `residents.ts`).
 */
export const MAX_RESIDENTS = 500;

/** Boats on the water at the same time (one brings each new resident and sails away again). */
export const MAX_BOATS = MAX_RESIDENTS;

/** The longest way a resident or boat keeps (in tiles); a longer one from a file is planned again. */
export const MAX_ROUTE = 2000;
