import { isLand, terrainAt, type WorldView } from '../sim/world';
import type { Rect } from './cameraMath';

/**
 * The places the screen centre may be: every land tile plus `margin` tiles
 * around it, as rectangles in world pixels (one per run of tiles in a row).
 * Used as `centerRegions` of the camera bounds, so land stays in view at
 * every zoom level.
 */
export function landRegions(world: WorldView, tileSize: number, margin = 1): Rect[] {
  const regions: Rect[] = [];
  const nearLand = (x: number, y: number): boolean => {
    for (let dy = -margin; dy <= margin; dy += 1) {
      for (let dx = -margin; dx <= margin; dx += 1) {
        if (isLand(terrainAt(world, x + dx, y + dy))) {
          return true;
        }
      }
    }
    return false;
  };
  for (let y = 0; y < world.height; y += 1) {
    let runStart = -1;
    for (let x = 0; x <= world.width; x += 1) {
      const inside = x < world.width && nearLand(x, y);
      if (inside && runStart < 0) {
        runStart = x;
      } else if (!inside && runStart >= 0) {
        regions.push({ x: runStart * tileSize, y: y * tileSize, width: (x - runStart) * tileSize, height: tileSize });
        runStart = -1;
      }
    }
  }
  return regions;
}
