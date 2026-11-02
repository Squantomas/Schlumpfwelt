import { HAT_IDS, type Mood } from '../../data/residents';
import { BOAT_SIZE, BOAT_WATER, RESIDENT_FOOT, RESIDENT_SIZE } from '../../art/figures';
import { moodKey, residentKey } from '../../art/catalog';

/**
 * Keys and sizes of the pictures of the residents, the boat, the moods and the "z" of sleep (M9: SVG from
 * `src/art/figures.ts`). A resident is about half a tile wide; the origin of the sprite is the point between the feet.
 */
export { BOAT_BACK_KEY, BOAT_FRONT_KEY, RESIDENT_RING_KEY, SLEEP_KEY } from '../../art/catalog';
export { BOAT_SIZE, MOOD_SIZE, RESIDENT_SIZE, SLEEP_SIZE } from '../../art/figures';

/** Where the feet touch the ground, as fraction of the texture (for `setOrigin`). */
export const RESIDENT_ORIGIN = { x: RESIDENT_FOOT.x / RESIDENT_SIZE.width, y: RESIDENT_FOOT.y / RESIDENT_SIZE.height } as const;
/** Above the hat: the lower edge of the good a resident carries (world px above the feet). */
export const RESIDENT_CARRY_Y = 64;
/** The water line of the boat (fraction of the texture height): the origin of the boat sprite. */
export const BOAT_ORIGIN = { x: BOAT_WATER.x / BOAT_SIZE.width, y: BOAT_WATER.y / BOAT_SIZE.height } as const;
/** Where the passenger stands in the boat: this many world px above the water line. */
export const BOAT_SEAT_Y = 6;

export function residentTextureKey(hat: number): string {
  return residentKey(HAT_IDS[hat] ?? HAT_IDS[0] ?? 'red');
}

export function moodTextureKey(mood: Mood): string {
  return moodKey(mood);
}
