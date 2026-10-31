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
