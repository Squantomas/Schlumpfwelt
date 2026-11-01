import type { CameraView, Point, Rect, Size } from './cameraMath';

/**
 * Where the camera glides when a boat sets off with a new resident (M6),
 * without Phaser: a child who invited someone should see them arrive. If the
 * whole way of the boat – from where it comes into sight to the landing place
 * – is already well inside the free part of the screen (between the bars
 * above and below, a little away from the edges), nothing moves. Otherwise
 * the camera glides so that the middle of that way lies in the middle of the
 * free part.
 *
 * The same for a house tapped while choosing a new home (Korrekturrunde 1,
 * {@link rectGlide}): a house half under the hint bar glides into the free
 * part, so the child sees the green house and its "0/2".
 */

/** The free part of the screen: from `top` to `bottom` (CSS px), the whole width. */
export interface FreeBand {
  readonly top: number;
  readonly bottom: number;
}

/** How far inside the free part the landing place and the start of the boat must be to count as "in the picture" (CSS px). */
export const LANDING_MARGIN = 56;

/** The screen point (CSS px) of a world point. */
function toScreen(view: CameraView, size: Size, point: Point): Point {
  return { x: (point.x - view.centerX) * view.zoom + size.width / 2, y: (point.y - view.centerY) * view.zoom + size.height / 2 };
}

/**
 * The new middle of the camera (world px), or `undefined` when the shore and
 * the start are already in the picture. `shore` is where the resident steps
 * onto land, `start` where the boat comes into sight (both world px).
 */
export function landingGlide(view: CameraView, size: Size, band: FreeBand, shore: Point, start: Point): Point | undefined {
  if (!(view.zoom > 0) || size.width <= 0 || size.height <= 0) {
    return undefined;
  }
  const top = Math.max(0, Math.min(band.top, size.height));
  const bottom = Math.max(top, Math.min(band.bottom, size.height));
  const margin = Math.min(LANDING_MARGIN, size.width / 4, (bottom - top) / 4);
  const inside = (point: Point): boolean => {
    const at = toScreen(view, size, point);
    return at.x >= margin && at.x <= size.width - margin && at.y >= top + margin && at.y <= bottom - margin;
  };
  if (inside(shore) && inside(start)) {
    return undefined;
  }
  // The middle of the boat's way goes to the middle of the free band.
  const middle = { x: (shore.x + start.x) / 2, y: (shore.y + start.y) / 2 };
  const bandMiddle = (top + bottom) / 2;
  return { x: middle.x, y: middle.y - (bandMiddle - size.height / 2) / view.zoom };
}

/** How far inside the free part a tapped house must be to count as "in the picture" (CSS px). */
export const RECT_MARGIN = 12;

/**
 * The new middle of the camera (world px) so that `rect` (world px: a house with its roof) lies in the middle of the
 * free part – or `undefined` when it is already inside it, a little away from the edges.
 */
export function rectGlide(view: CameraView, size: Size, band: FreeBand, rect: Rect): Point | undefined {
  if (!(view.zoom > 0) || size.width <= 0 || size.height <= 0) {
    return undefined;
  }
  const top = Math.max(0, Math.min(band.top, size.height));
  const bottom = Math.max(top, Math.min(band.bottom, size.height));
  const margin = Math.min(RECT_MARGIN, size.width / 4, (bottom - top) / 4);
  const corner = toScreen(view, size, { x: rect.x, y: rect.y });
  const width = rect.width * view.zoom;
  const height = rect.height * view.zoom;
  if (corner.x >= margin && corner.x + width <= size.width - margin && corner.y >= top + margin && corner.y + height <= bottom - margin) {
    return undefined;
  }
  const bandMiddle = (top + bottom) / 2;
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 - (bandMiddle - size.height / 2) / view.zoom };
}

/**
 * The new middle of the camera (world px) that puts the world point `point` in the middle of the free band – for the
 * guided start, whose target must be well inside the band (`inFreeBand` asks for more room than `rectGlide`, M8).
 */
export function bandGlide(view: CameraView, size: Size, band: FreeBand, point: Point): Point {
  const top = Math.max(0, Math.min(band.top, size.height));
  const bottom = Math.max(top, Math.min(band.bottom, size.height));
  const zoom = view.zoom > 0 ? view.zoom : 1;
  return { x: point.x, y: point.y - ((top + bottom) / 2 - size.height / 2) / zoom };
}

/** What is open on the screen while a boat comes (see {@link glideAllowed}). */
export interface GlideContext {
  /** The tool of the build controls (`view` = just looking). */
  readonly tool: string;
  readonly shopOpen: boolean;
  readonly menuOpen: boolean;
  /** The layer "a newer window took over". */
  readonly lostOpen: boolean;
  /** The card of a building or of a resident. */
  readonly cardOpen: boolean;
  /** A finger (or the mouse button) is down on the world: dragging, pinching, holding or carrying a resident. */
  readonly gestureActive: boolean;
}

/**
 * The camera glides to a boat only while the child is just looking – not while building, moving or demolishing, not
 * while the shop, the menu, the "lost" layer or a card is open, and never while a finger is on the world (the world
 * must not slide away under a carried resident). A glide that is running stops on the spot as soon as this turns
 * false.
 */
export function glideAllowed(context: GlideContext): boolean {
  return context.tool === 'view' && !context.shopOpen && !context.menuOpen && !context.lostOpen && !context.cardOpen && !context.gestureActive;
}
