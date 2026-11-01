/**
 * Vertical place of the "needs a path" sign over a house (world px, the tip of
 * the sign is its bottom). Normally it floats at `desiredY` above the roof. If
 * the house is at the top edge of the screen, the sign slides down so it stays
 * visible below the hint bar (`minWorldY` is the top of the visible world
 * there) – but never further than the foot of the house (`houseBottomY`), so
 * it stays on its house. A house that is not on the screen keeps its sign at
 * the house, it is not pinned to the screen edge.
 */
export function markerY(desiredY: number, minWorldY: number, markerHeight: number, houseBottomY: number): number {
  const lowest = Math.min(minWorldY + markerHeight, houseBottomY);
  return Math.max(desiredY, lowest);
}

/** A box in the world (px) that the "2/2" over a house must not hide behind: the carried resident, the "needs a path" sign. */
export interface AvoidBox {
  readonly x: number;
  readonly halfWidth: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Vertical place of the "2/2" over a house (its bottom, world px; Korrekturrunde 1). Normally just above the roof
 * (`roofY`). Whatever stands there would cover the number – the sign of a house without a path, a resident carried
 * over the house (and the heart over them): then it climbs over each of them (`avoid`, in any order) and stands above.
 * Below the hint bar as the sign does (`minWorldY`).
 */
export function homeLabelY(
  roofY: number,
  labelX: number,
  labelHalfWidth: number,
  labelHeight: number,
  minWorldY: number,
  avoid: readonly (AvoidBox | undefined)[] = [],
): number {
  let y = roofY;
  // The label only ever moves up, at most once over each box: this ends.
  for (let moved = true; moved; ) {
    moved = false;
    for (const box of avoid) {
      if (box && Math.abs(box.x - labelX) < box.halfWidth + labelHalfWidth && y > box.top - 2 && y - labelHeight < box.bottom) {
        y = box.top - 2;
        moved = true;
      }
    }
  }
  return Math.max(y, minWorldY + labelHeight);
}
