import type { Rect } from './cameraMath';

/**
 * Layout of the big info card that opens when a production building is
 * tapped: name and a ✕ at the top, "needs → makes" with pictures, a short
 * sentence about the state and a progress bar. It sits in the free band
 * between the store bar and the toolbar and keeps clear of the zoom buttons.
 * On low screens it uses a compact arrangement (the sentence beside the
 * pictures). Pure maths in CSS pixels.
 */

/** Diameter of the ✕ (the card must be easy to close: over 64 px). */
export const CARD_CLOSE = 64;
export const CARD_MAX_WIDTH = 460;
const PAD = 12;
const GAP = 8;
const COMPACT_BELOW = 200;
const TALL_HEIGHT = 270;
const BAR_HEIGHT = 20;
export const CARD_MIN_HEIGHT = 140;

export interface InfoCardBounds {
  /** Free band for the card (CSS px from the top left of the screen). */
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  /** The zoom buttons' rectangle: the card keeps to its left where they would be in the way. */
  readonly zoom: Rect;
}

export interface FlowSlots {
  /** Centres of the pictures of what is needed, then the arrow, then what is made. */
  readonly needs: readonly { readonly x: number; readonly y: number }[];
  /** `undefined` when nothing is needed. */
  readonly arrow: { readonly x: number; readonly y: number } | undefined;
  readonly makes: readonly { readonly x: number; readonly y: number }[];
  /** Width of one picture slot. */
  readonly slot: number;
}

export interface InfoCardLayout {
  readonly rect: Rect;
  readonly compact: boolean;
  readonly close: Rect;
  readonly name: Rect;
  /** The row with the pictures "needs → makes". */
  readonly flow: Rect;
  readonly status: Rect;
  readonly bar: Rect;
  /** Captions "braucht" / "macht" above the pictures (tall cards only). */
  readonly captions: { readonly needs: Rect; readonly makes: Rect } | undefined;
  /** Does the card fit into the band at all (at least {@link CARD_MIN_HEIGHT})? */
  readonly fits: boolean;
}

export function infoCardLayout(bounds: InfoCardBounds): InfoCardLayout {
  // Below the zoom buttons there is room for a full card (the best place if the band is tall enough) …
  const belowZoom = Math.max(bounds.top, bounds.zoom.y + bounds.zoom.height + GAP);
  const clearOfZoom = bounds.bottom - belowZoom >= COMPACT_BELOW;
  const top = clearOfZoom ? belowZoom : bounds.top;
  const height = Math.min(TALL_HEIGHT, Math.max(0, bounds.bottom - top));
  const y = bounds.bottom - height;
  // … otherwise it keeps left of the zoom buttons where they reach into its rows.
  const zoomInBand = !clearOfZoom && bounds.zoom.y < bounds.bottom && bounds.zoom.y + bounds.zoom.height > y;
  const maxRight = zoomInBand ? bounds.zoom.x - GAP : bounds.width - 10;
  const room = maxRight - 10;
  const width = Math.min(CARD_MAX_WIDTH, room);
  const x = zoomInBand ? 10 + (room - width) / 2 : (bounds.width - width) / 2;
  const rect: Rect = { x, y, width, height };
  const compact = height < COMPACT_BELOW;

  const closeSize = CARD_CLOSE;
  const close: Rect = { x: x + width - 8 - closeSize, y: y + 8, width: closeSize, height: closeSize };
  const name: Rect = { x: x + PAD, y: y + 8, width: close.x - GAP - (x + PAD), height: closeSize };
  const bar: Rect = { x: x + PAD, y: y + height - PAD - BAR_HEIGHT, width: width - 2 * PAD, height: BAR_HEIGHT };
  const belowName = name.y + name.height + GAP;
  const middle = { top: belowName, bottom: bar.y - GAP };
  const middleH = Math.max(0, middle.bottom - middle.top);

  let flow: Rect;
  let status: Rect;
  let captions: InfoCardLayout['captions'];
  if (compact) {
    // Pictures left, sentence right, side by side.
    const flowW = Math.round((width - 2 * PAD) * 0.52);
    flow = { x: x + PAD, y: middle.top, width: flowW, height: middleH };
    status = { x: flow.x + flow.width + GAP, y: middle.top, width: width - 2 * PAD - flowW - GAP, height: middleH };
    captions = undefined;
  } else {
    const captionH = 22;
    const flowH = Math.min(72, Math.max(40, middleH - captionH - 2 * 24 - GAP));
    flow = { x: x + PAD, y: middle.top + captionH, width: width - 2 * PAD, height: flowH };
    status = { x: x + PAD, y: flow.y + flow.height + GAP, width: width - 2 * PAD, height: Math.max(0, middle.bottom - (flow.y + flow.height + GAP)) };
    const half = (flow.width - 56) / 2;
    captions = {
      needs: { x: flow.x, y: middle.top, width: half, height: captionH },
      makes: { x: flow.x + flow.width - half, y: middle.top, width: half, height: captionH },
    };
  }
  return { rect, compact, close, name, flow, status, bar, captions, fits: height >= CARD_MIN_HEIGHT };
}

/**
 * Places `needsCount` pictures, an arrow and `makesCount` pictures in a row
 * inside `flow`, evenly: the needs on the left half, the makes on the right.
 * Without needs the pictures of what is made stand alone in the middle.
 */
export function flowSlots(flow: Rect, needsCount: number, makesCount: number): FlowSlots {
  const arrowW = needsCount > 0 ? 36 : 0;
  const count = Math.max(1, needsCount, makesCount);
  const slot = Math.min(72, (flow.width - arrowW) / (needsCount > 0 ? 2 * count : count));
  const cy = flow.y + flow.height / 2;
  const cx = flow.x + flow.width / 2;
  if (needsCount === 0) {
    // Nothing is needed (the berry garden): only what is made, in the middle.
    const left = cx - (makesCount * slot) / 2;
    return { needs: [], arrow: undefined, makes: Array.from({ length: makesCount }, (_, i) => ({ x: left + slot * (i + 0.5), y: cy })), slot };
  }
  const group = (n: number, side: -1 | 1): { x: number; y: number }[] =>
    Array.from({ length: n }, (_, i) => ({ x: cx + side * (arrowW / 2 + slot * (side === -1 ? n - i - 0.5 : i + 0.5)), y: cy }));
  return { needs: group(needsCount, -1), arrow: { x: cx, y: cy }, makes: group(makesCount, 1), slot };
}
