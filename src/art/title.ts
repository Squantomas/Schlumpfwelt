import { COLORS, FLOWER_PETALS } from '../ui/style';
import { hatColors, residentMarkup } from './figures';
import { drawBlossomTree, drawPineTree, drawRoundTree, drawSmallRock } from './nature';
import type { Svg} from './svg';
import { cluster, d, ellipse, lighter, line, outlineOf, path } from './svg';
import { BUILDING_DRAWERS } from './village';

/**
 * The picture of the start screen (M9): a small round island in the sea with mushroom houses, trees, flowers, a
 * few residents and the boat – no text (the game name is a label over it, from the theme). The sea around it is
 * transparent: the start screen has the colour of the water behind it, so the picture fits every screen shape.
 */
export const TITLE_SIZE = { width: 640, height: 400 } as const;

/** A building or a tree drawn by its own drawer at its own size, put down with its foot point at (x, y). */
function put(s: Svg, width: number, height: number, footY: number, x: number, y: number, draw: (inner: Svg) => void, scale = 1): void {
  const inner = s.inner(width, height);
  draw(inner);
  s.place(inner, x - (width / 2) * scale, y - footY * scale, scale);
}

export function drawTitle(s: Svg): void {
  const cx = s.width / 2;
  const cy = 262;
  // Soft rings of shallow water and foam around the island.
  s.add(
    ellipse(cx, cy + 16, 300, 112, { fill: COLORS.waterShallow, opacity: 0.85 }),
    ellipse(cx, cy + 12, 276, 98, { fill: COLORS.foam, opacity: 0.9 }),
    ellipse(cx, cy + 6, 268, 92, { fill: s.vertical(COLORS.sand, COLORS.sandShade), stroke: outlineOf(COLORS.sandShade), width: 1.4 }),
    ellipse(cx - 6, cy - 6, 238, 74, { fill: s.vertical(lighter(COLORS.grass, 0.15), COLORS.grassShade), stroke: outlineOf(COLORS.grassShade), width: 1.4 }),
  );
  // Little waves on the sea.
  for (const [x, y] of [
    [40, 330],
    [86, 372],
    [560, 340],
    [600, 300],
    [520, 382],
    [30, 250],
  ] as const) {
    s.add(line([[x - 10, y], [x - 4, y - 4], [x + 2, y], [x + 8, y - 4]], COLORS.white, 2.4, 0.85));
  }
  // A path of stones across the meadow.
  s.add(
    path(`${d.m(cx - 150, cy + 30)}${d.q(cx - 40, cy - 10, cx + 30, cy + 22)}${d.q(cx + 100, cy + 50, cx + 170, cy + 10)}`, {
      stroke: COLORS.pathFill,
      width: 18,
      under: false,
    }),
  );
  for (const [x, y] of [
    [cx - 120, cy + 20],
    [cx - 70, cy + 6],
    [cx - 10, cy + 12],
    [cx + 50, cy + 30],
    [cx + 110, cy + 32],
    [cx + 150, cy + 18],
  ] as const) {
    s.add(ellipse(x, y, 6, 3.6, { fill: COLORS.pathStone, stroke: COLORS.pathStoneDark, width: 0.6 }));
  }
  // Back row first (smaller y), front row last.
  const house = (palette: string): ((inner: Svg) => void) => {
    const draw = BUILDING_DRAWERS['mushroomHouse'];
    return (inner) => draw?.(inner, { shape: 'mushroomHouse', palette });
  };
  put(s, 72, 120, 110, cx - 205, cy - 30, drawPineTree, 0.9);
  put(s, 84, 108, 99, cx + 210, cy - 26, drawRoundTree);
  put(s, 144, 220, 212, cx - 108, cy - 20, house('blue'), 0.82);
  put(s, 84, 104, 96, cx + 30, cy - 46, drawBlossomTree, 0.95);
  put(s, 144, 220, 212, cx + 118, cy - 14, house('red'), 0.9);
  put(s, 72, 58, 50, cx + 214, cy + 46, drawSmallRock, 0.9);
  put(s, 144, 220, 212, cx - 10, cy + 44, house('yellow'), 0.78);
  // Bushes and flowers in front.
  s.add(cluster([[cx - 196, cy + 46, 14], [cx - 178, cy + 40, 16], [cx - 160, cy + 48, 12]], s.vertical(COLORS.treeCrownLight, COLORS.treeCrown), outlineOf(COLORS.treeCrown), 1.4));
  for (const [x, y, colour] of [
    [cx - 60, cy + 58, 0],
    [cx + 72, cy + 66, 1],
    [cx + 160, cy + 60, 2],
    [cx - 140, cy + 70, 3],
  ] as const) {
    const petal = FLOWER_PETALS[colour % FLOWER_PETALS.length] ?? COLORS.flower;
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2;
      s.add(ellipse(x + Math.cos(angle) * 4, y + Math.sin(angle) * 4, 3.6, 3.6, { fill: petal, stroke: outlineOf(petal), width: 0.6 }));
    }
    s.add(ellipse(x, y, 2.4, 2.4, { fill: COLORS.flowerCenter }));
  }
  // Residents: two walking on the path, one waving by the house.
  for (const [x, y, hat] of [
    [cx - 64, cy + 30, 'red'],
    [cx + 66, cy + 50, 'yellow'],
    [cx + 182, cy + 28, 'green'],
  ] as const) {
    s.add(residentMarkup(s, hatColors(hat), true, x, y));
  }
  // The boat bringing a new resident.
  const wx = 582;
  const wy = 172;
  s.add(ellipse(wx, wy + 4, 40, 6, { fill: COLORS.wake, opacity: 0.45 }));
  s.add(
    path(`${d.m(wx + 13, wy - 37)}${d.q(wx + 35, wy - 22, wx + 30, wy - 8)}${d.l(wx + 13, wy - 8)}${d.z}`, { fill: COLORS.sail, stroke: outlineOf(COLORS.sailShade), width: 1.2 }),
    line([[wx + 10.7, wy - 38], [wx + 10.7, wy - 4]], COLORS.mast, 3.4),
    residentMarkup(s, hatColors('purple'), false, wx - 6, wy + 2),
    path(`${d.m(wx - 34, wy - 12)}${d.l(wx + 34, wy - 12)}${d.q(wx + 30, wy + 4, wx + 18, wy + 5)}${d.l(wx - 18, wy + 5)}${d.q(wx - 30, wy + 4, wx - 34, wy - 12)}${d.z}`, {
      fill: s.vertical(COLORS.boatHull, COLORS.boatHullShade),
      stroke: outlineOf(COLORS.boatHullShade),
      width: 1.3,
    }),
  );
}
