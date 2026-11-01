import { MIN_TAP_SIZE } from './style';

/**
 * Which resident a tap on the world hits (M6), without Phaser. Residents are
 * not interactive objects: the scene asks this function with the tapped point
 * (world px) and where every resident is drawn right now (a walker where the
 * picture is, between two ticks). The hit area is a short upright capsule
 * over the body (from the belly to the hat) with a radius of at least half of
 * {@link MIN_TAP_SIZE} CSS px, however far the camera is zoomed out – so a tap
 * within 24 CSS px of the middle of the body hits (on a building, see below).
 *
 * On a building that answers a tap while looking (a production building
 * opens its card, a house without a path says what is missing) the resident
 * keeps only the taps near the body: at most {@link RESIDENT_REACH_ON_BUILDING}
 * world px. From zoom 1 on (a tile of 64 CSS px or more) that is still the
 * whole 24 CSS px; far out, where 24 CSS px would cover half a market, the
 * building keeps its picture. Everywhere else (meadow, path, a house with a
 * path, decoration) the 24 CSS px hold.
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

/**
 * How far a resident reaches on a building that answers a tap (world px): the
 * body itself plus a little. At zoom 1 this equals 24 CSS px, closer in the
 * 24 CSS px are less than this anyway.
 */
export const RESIDENT_REACH_ON_BUILDING = 24;

/**
 * The radius of the hit area in world px at `zoom` (CSS px per world px):
 * never under 24 CSS px, never under the body – except `onBuilding` (a tap on a
 * building that answers it), where it is at most {@link RESIDENT_REACH_ON_BUILDING}.
 */
export function residentHitRadius(zoom: number, onBuilding = false): number {
  const radius = !(zoom > 0) || !Number.isFinite(zoom) ? RESIDENT_HIT_RADIUS : Math.max(RESIDENT_HIT_RADIUS, MIN_TAP_SIZE / 2 / zoom);
  return onBuilding ? Math.min(radius, RESIDENT_REACH_ON_BUILDING) : radius;
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
 * screen), then the lower id. `onBuilding`: the point lies on a building that
 * answers a tap (see {@link residentHitRadius}).
 */
export function residentAt(
  spots: readonly ResidentSpot[],
  point: { readonly x: number; readonly y: number },
  zoom: number,
  onBuilding = false,
): number | undefined {
  const radius = residentHitRadius(zoom, onBuilding);
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
