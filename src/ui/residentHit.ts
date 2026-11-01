import { MIN_TAP_SIZE } from './style';

/**
 * Which resident a tap on the world hits (M6), without Phaser. Residents are
 * not interactive objects: the scene asks this function with the tapped point
 * (world px) and where every resident is drawn right now (a walker where the
 * picture is, between two ticks). The hit area is a short upright capsule
 * over the body (from the belly to the hat) with a radius of at least half of
 * {@link MIN_TAP_SIZE} CSS px, however far the camera is zoomed out – so a tap
 * within 24 CSS px of the middle of the body always hits.
 *
 * The same holds on a building (a worker at the door, a resident on the path
 * in front of a house): near the body the resident wins, the house keeps the
 * taps that are clearly beside them (its roof, its sides, its sign).
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

/** Where the middle of the body is: this far above the feet (world px; between {@link RESIDENT_HIT_BOTTOM} and {@link RESIDENT_HIT_TOP}). */
export const RESIDENT_BODY_Y = 26;

/** The radius of the hit area in world px at `zoom` (CSS px per world px): never under 24 CSS px, never under the body. */
export function residentHitRadius(zoom: number): number {
  if (!(zoom > 0) || !Number.isFinite(zoom)) {
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
export function residentAt(spots: readonly ResidentSpot[], point: { readonly x: number; readonly y: number }, zoom: number): number | undefined {
  const radius = residentHitRadius(zoom);
  let best: { readonly spot: ResidentSpot; readonly distance: number } | undefined;
  for (const spot of spots) {
    const distance = distanceToResident(spot, point);
    // The edge itself counts (a hair of tolerance against rounding).
    if (distance > radius * (1 + 1e-9)) {
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
