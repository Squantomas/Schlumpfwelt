import { MIN_TAP_SIZE } from './style';

/**
 * Which resident a tap on the world hits (M6), without Phaser. Residents are
 * not interactive objects: the scene asks this function with the tapped point
 * (world px) and where every resident is drawn. The hit area is a short
 * upright capsule over the body (feet to hat); on screen it is never less
 * than {@link MIN_TAP_SIZE} CSS px across, however far the camera is zoomed out.
 * On a building (its footprint or its picture) only the body itself counts, so
 * a resident standing at a door does not take the taps meant for the house.
 */

/** Half the width of a resident's body (world px): the hit area is never narrower. */
export const RESIDENT_HIT_RADIUS = 16;
/** The upright middle line of the hit area: from this far above the feet … */
export const RESIDENT_HIT_TOP = 42;
/** … down to this far above the feet (world px). */
export const RESIDENT_HIT_BOTTOM = 12;

export interface ResidentSpot {
  readonly id: number;
  /** Where the feet are (world px). */
  readonly x: number;
  readonly y: number;
}

/** The radius of the hit area in world px at `zoom` (CSS px per world px): never under 24 CSS px, `strict` only the body. */
export function residentHitRadius(zoom: number, strict: boolean): number {
  if (strict || !(zoom > 0)) {
    return RESIDENT_HIT_RADIUS;
  }
  return Math.max(RESIDENT_HIT_RADIUS, MIN_TAP_SIZE / 2 / zoom);
}

/** Distance from the point to the middle line of the resident's hit area (world px). */
export function distanceToResident(spot: ResidentSpot, point: { readonly x: number; readonly y: number }): number {
  const top = spot.y - RESIDENT_HIT_TOP;
  const bottom = spot.y - RESIDENT_HIT_BOTTOM;
  const nearestY = Math.min(bottom, Math.max(top, point.y));
  return Math.hypot(point.x - spot.x, point.y - nearestY);
}

/**
 * The resident under the tapped point, or `undefined`. If several are in
 * reach, the nearest wins; at the same distance the one in front (lower on the
 * screen), then the lower id.
 */
export function residentAt(
  spots: readonly ResidentSpot[],
  point: { readonly x: number; readonly y: number },
  zoom: number,
  strict = false,
): number | undefined {
  const radius = residentHitRadius(zoom, strict);
  let best: { readonly spot: ResidentSpot; readonly distance: number } | undefined;
  for (const spot of spots) {
    const distance = distanceToResident(spot, point);
    if (distance > radius) {
      continue;
    }
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && (spot.y > best.spot.y || (spot.y === best.spot.y && spot.id < best.spot.id)))
    ) {
      best = { spot, distance };
    }
  }
  return best?.spot.id;
}
