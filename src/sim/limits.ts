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
