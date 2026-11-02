import { COLORS, FLOWER_PETALS, STYLE } from '../ui/style';
import type { Svg} from './svg';
import { circle, cluster, darker, ellipse, lighter, line, outlineOf, path, rect, shadow, wrapped, d } from './svg';

/**
 * Nature (M9): the ground patterns, the little things scattered on the ground, trees, rocks and the glint on the sea.
 * Sizes and ground points are the ones the game has used since M1 (`OBJECT_ORIGIN` in `objectTextures.ts`).
 */

/** Edge of one ground pattern (logical px): two tiles, so the repetition is hard to see. */
export const PATTERN_SIZE = 128;

/** Small deterministic numbers for the scattered details of a picture (the same picture every time). */
export function sequence(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

type Spot = readonly [x: number, y: number];

function spots(seed: number, count: number, size = PATTERN_SIZE): Spot[] {
  const next = sequence(seed);
  return Array.from({ length: count }, () => [next() * size, next() * size] as const);
}

/** A tuft of grass: three blades from one point. */
function tuftAt(x: number, y: number, color: number, scale = 1): string {
  const k = scale;
  return line(
    [
      [x - 4 * k, y - 6 * k],
      [x - 2 * k, y],
      [x, y - 8 * k],
      [x + 2 * k, y],
      [x + 4 * k, y - 6 * k],
    ],
    color,
    1.8 * k,
  );
}

export function drawGrassPattern(s: Svg): void {
  const S = PATTERN_SIZE;
  s.add(rect(0, 0, S, S, 0, { fill: COLORS.grass }));
  const next = sequence(11);
  // Soft lighter and darker patches: the meadow is not a flat colour.
  for (const [x, y] of spots(12, 7)) {
    const rx = 14 + next() * 12;
    const ry = 8 + next() * 6;
    const light = next() < 0.5;
    s.add(wrapped(x, y, rx, S, (px, py) => ellipse(px, py, rx, ry, { fill: light ? COLORS.patchLight : COLORS.patchDark, opacity: 0.07 })));
  }
  for (const [x, y] of spots(13, 9)) {
    s.add(wrapped(x, y, 6, S, (px, py) => tuftAt(px, py, COLORS.grassShade, 0.9)));
  }
  for (const [x, y] of spots(14, 10)) {
    s.add(wrapped(x, y, 3, S, (px, py) => line([[px, py], [px + 1, py - 4]], lighter(COLORS.grass, 0.35), 1.4, 0.8)));
  }
}

export function drawForestPattern(s: Svg): void {
  const S = PATTERN_SIZE;
  s.add(rect(0, 0, S, S, 0, { fill: COLORS.forestFloor }));
  const next = sequence(21);
  for (const [x, y] of spots(22, 8)) {
    const rx = 12 + next() * 10;
    const ry = 7 + next() * 6;
    s.add(wrapped(x, y, rx, S, (px, py) => ellipse(px, py, rx, ry, { fill: COLORS.forestFloorDark, opacity: 0.6 })));
  }
  for (const [x, y] of spots(23, 7)) {
    const r = 4 + next() * 4;
    s.add(wrapped(x, y, r * 1.4, S, (px, py) => ellipse(px, py, r * 1.4, r, { fill: COLORS.forestMoss, opacity: 0.55 })));
  }
  for (const [x, y] of spots(24, 18)) {
    const angle = next() * Math.PI;
    const dx = Math.cos(angle) * 5;
    const dy = Math.sin(angle) * 5;
    s.add(wrapped(x, y, 6, S, (px, py) => line([[px, py], [px + dx, py + dy]], COLORS.forestNeedle, 1.6, 0.85)));
  }
  // Fallen leaves: small warm ovals.
  for (const [x, y] of spots(25, 4)) {
    const turn = next() * 180;
    s.add(wrapped(x, y, 4, S, (px, py) => ellipse(px, py, 3.6, 2, { fill: COLORS.wood, opacity: 0.7 }, turn)));
  }
}

export function drawRockPattern(s: Svg): void {
  const S = PATTERN_SIZE;
  s.add(rect(0, 0, S, S, 0, { fill: COLORS.rockFloor }));
  const next = sequence(31);
  // Flat slabs, lighter, with a dark seam below.
  for (const [x, y] of spots(32, 6)) {
    const w = 22 + next() * 16;
    const h = 12 + next() * 8;
    s.add(
      wrapped(x, y, w, S, (px, py) =>
        [rect(px - w / 2, py - h / 2 + 1.6, w, h, 6, { fill: COLORS.rockFloorDark, opacity: 0.8 }), rect(px - w / 2, py - h / 2, w, h, 6, { fill: COLORS.rockFloorLight, opacity: 0.75 })].join(''),
      ),
    );
  }
  // Pebbles with a lit top.
  for (const [x, y] of spots(33, 12)) {
    const r = 2.4 + next() * 2.6;
    s.add(
      wrapped(x, y, r * 1.3, S, (px, py) =>
        [ellipse(px, py + 1, r * 1.25, r * 0.9, { fill: COLORS.rockFloorDark }), ellipse(px - 0.4, py, r * 1.1, r * 0.75, { fill: lighter(COLORS.rockFloorLight, 0.15) })].join(''),
      ),
    );
  }
  for (const [x, y] of spots(34, 3)) {
    s.add(wrapped(x, y, 10, S, (px, py) => line([[px - 8, py - 2], [px - 1, py + 1], [px + 7, py - 2]], COLORS.rockCrack, 1.4, 0.55)));
  }
}

export function drawSandPattern(s: Svg): void {
  const S = PATTERN_SIZE;
  s.add(rect(0, 0, S, S, 0, { fill: COLORS.sand }));
  // Soft ripples in the sand and a few specks.
  for (const [x, y] of spots(41, 6)) {
    s.add(wrapped(x, y, 12, S, (px, py) => path(`${d.m(px - 11, py)}${d.q(px, py - 4, px + 11, py)}`, { stroke: lighter(COLORS.sand, 0.55), width: 0.9, under: false })));
  }
  const next = sequence(42);
  for (const [x, y] of spots(43, 16)) {
    const r = 0.9 + next() * 1.1;
    s.add(wrapped(x, y, r, S, (px, py) => circle(px, py, r, { fill: COLORS.sandSpeck, opacity: 0.38 })));
  }
}

export function drawWaterPattern(s: Svg): void {
  const S = PATTERN_SIZE;
  s.add(rect(0, 0, S, S, 0, { fill: COLORS.waterDeep }));
  // Gentle wave lines: little arcs of lighter water.
  for (const [x, y] of spots(51, 9)) {
    s.add(
      wrapped(x, y, 12, S, (px, py) =>
        path(`${d.m(px - 10, py)}${d.q(px - 5, py - 4, px, py)}${d.q(px + 5, py - 4, px + 10, py)}`, { stroke: COLORS.waterShallow, width: 0.9, under: false, opacity: 0.55 }),
      ),
    );
  }
}

/** Scattered on the meadow: three small flowers. */
export function drawGroundFlowers(s: Svg): void {
  const list: readonly [number, number, number][] = [
    [7, 10, 0],
    [16, 7, 1],
    [13, 15, 2],
  ];
  for (const [x, y, colour] of list) {
    const petal = FLOWER_PETALS[colour] ?? COLORS.flower;
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2;
      s.add(circle(x + Math.cos(angle) * 2.6, y + Math.sin(angle) * 2.6, 2, { fill: petal, stroke: darker(petal, 0.3), width: 0.35 }));
    }
    s.add(circle(x, y, 1.6, { fill: COLORS.flowerCenter }));
  }
}

export function drawGroundTuft(s: Svg): void {
  s.add(tuftAt(8, 12, COLORS.grassShade, 1.2), tuftAt(5, 12, lighter(COLORS.grass, 0.25), 0.7));
}

export function drawGroundMushroom(s: Svg): void {
  s.add(rect(5.2, 6, 3.6, 6, 1.4, { fill: COLORS.mushroomStem, stroke: true, width: 0.5 }));
  s.add(path(`${d.m(1.5, 7.5)}${d.q(7, -1.5, 12.5, 7.5)}${d.z}`, { fill: COLORS.mushroomCap, stroke: true, width: 0.6 }));
  for (const [x, y] of [[4.6, 5.2], [7.5, 3.6], [9.6, 5.6]] as const) {
    s.add(circle(x, y, 0.8, { fill: COLORS.mushroomStem }));
  }
}

export function drawGroundPebbles(s: Svg): void {
  for (const [x, y, r] of [[6, 8, 3.4], [14, 9, 2.6], [10, 4.6, 2]] as const) {
    s.add(ellipse(x, y + 0.8, r * 1.2, r * 0.85, { fill: COLORS.rockFloorDark }), ellipse(x - 0.3, y, r * 1.05, r * 0.7, { fill: COLORS.rockFloorLight }));
  }
}

export function drawGroundShell(s: Svg): void {
  s.add(path(`${d.m(2, 7.5)}${d.q(6, -1.5, 10, 7.5)}${d.q(6, 9.5, 2, 7.5)}${d.z}`, { fill: COLORS.shell, stroke: COLORS.sandShade, width: 0.5 }));
  s.add(line([[6, 7.6], [6, 3.6]], COLORS.sandShade, 0.6), line([[4, 7.6], [3.8, 5]], COLORS.sandShade, 0.6), line([[8, 7.6], [8.2, 5]], COLORS.sandShade, 0.6));
}

/** A crown of leaves: one shared outline, a gradient from the top left, light dabs and darker clumps. */
function crown(s: Svg, circles: readonly (readonly [number, number, number])[], light: number, base: number): void {
  const xs = circles.map(([x, , r]) => [x - r, x + r]).flat();
  const ys = circles.map(([, y, r]) => [y - r, y + r]).flat();
  const fill = s.across(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), light, darker(base, 0.18));
  s.add(cluster(circles, fill, outlineOf(base)));
}

function trunkAt(s: Svg, cx: number, ground: number, width: number, height: number): void {
  const top = ground - height;
  const bark = s.vertical(COLORS.treeTrunk, COLORS.trunkDark);
  s.add(
    path(
      `${d.m(cx - width / 2, top)}${d.l(cx + width / 2, top)}${d.l(cx + width / 2 + 1.5, ground - 3)}${d.q(cx + width / 2 + 3, ground, cx + width / 2 + 5, ground)}${d.l(cx - width / 2 - 5, ground)}${d.q(cx - width / 2 - 3, ground, cx - width / 2 - 1.5, ground - 3)}${d.z}`,
      { fill: bark, stroke: outlineOf(COLORS.treeTrunk) },
    ),
  );
  s.add(line([[cx + width * 0.15, top + 6], [cx + width * 0.2, ground - 6]], COLORS.trunkDark, 1.6, 0.7));
}

export function drawRoundTree(s: Svg): void {
  const cx = s.width / 2;
  const ground = s.height * 0.92;
  s.add(shadow(cx, ground - 1, 28, 8));
  trunkAt(s, cx, ground, 12, 40);
  crown(
    s,
    [
      [cx - 18, 57, 19],
      [cx + 18, 57, 19],
      [cx, 44, 28],
      [cx - 11, 30, 16],
      [cx + 12, 31, 15],
    ],
    COLORS.treeCrownLight,
    COLORS.treeCrown,
  );
  s.add(
    ellipse(cx - 12, 30, 9, 6, { fill: lighter(COLORS.treeCrownLight, 0.3), opacity: 0.75 }, -25),
    ellipse(cx - 24, 50, 5, 3.4, { fill: lighter(COLORS.treeCrownLight, 0.25), opacity: 0.7 }, -30),
    path(`${d.m(cx + 4, 62)}${d.q(cx + 14, 68, cx + 26, 60)}`, { stroke: COLORS.crownDark, width: 1.2, under: false, opacity: 0.75 }),
    path(`${d.m(cx - 14, 66)}${d.q(cx - 8, 70, cx - 1, 66)}`, { stroke: COLORS.crownDark, width: 1.2, under: false, opacity: 0.7 }),
  );
  // A red apple or two: friendly and easy to spot.
  s.add(circle(cx + 13, 48, 3.4, { fill: COLORS.berry, stroke: true, width: 0.7 }), circle(cx + 12, 47, 1, { fill: COLORS.white, opacity: 0.8 }));
}

export function drawPineTree(s: Svg): void {
  const cx = s.width / 2;
  const ground = s.height * 0.92;
  s.add(shadow(cx, ground - 1, 22, 7));
  trunkAt(s, cx, ground, 10, 26);
  const tiers: readonly [number, number, number][] = [
    // [bottom y, half width, height]
    [98, 31, 34],
    [76, 26, 32],
    [54, 20, 30],
    [33, 13, 27],
  ];
  const fill = s.across(cx - 30, 6, cx + 30, 98, COLORS.treeCrownLight, darker(COLORS.crownDark, 0.15));
  for (const [bottom, half, h] of tiers) {
    const top = bottom - h;
    s.add(
      path(
        `${d.m(cx, top)}${d.q(cx + half * 0.55, top + h * 0.45, cx + half, bottom - 3)}${d.q(cx + half * 0.5, bottom + 4, cx, bottom + 1)}${d.q(cx - half * 0.5, bottom + 4, cx - half, bottom - 3)}${d.q(cx - half * 0.55, top + h * 0.45, cx, top)}${d.z}`,
        { fill, stroke: outlineOf(COLORS.crownDark) },
      ),
    );
    s.add(ellipse(cx - half * 0.32, bottom - h * 0.45, half * 0.2, h * 0.18, { fill: lighter(COLORS.treeCrownLight, 0.2), opacity: 0.7 }, -28));
  }
}

export function drawBlossomTree(s: Svg): void {
  const cx = s.width / 2;
  const ground = s.height * 0.92;
  s.add(shadow(cx, ground - 1, 26, 7.5));
  trunkAt(s, cx, ground, 11, 36);
  crown(
    s,
    [
      [cx - 16, 54, 18],
      [cx + 16, 54, 18],
      [cx, 40, 26],
      [cx - 10, 28, 14],
    ],
    lighter(COLORS.treeCrownLight, 0.2),
    COLORS.treeCrownLight,
  );
  const blossoms: readonly [number, number][] = [
    [-14, 30],
    [4, 21],
    [18, 37],
    [-22, 50],
    [10, 54],
    [-4, 43],
    [24, 54],
    [-10, 62],
    [14, 26],
  ];
  for (const [dx, dy] of blossoms) {
    const x = cx + dx;
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      s.add(circle(x + Math.cos(angle) * 2.6, dy + Math.sin(angle) * 2.6, 2.3, { fill: COLORS.blossom }));
    }
    s.add(circle(x, dy, 1.6, { fill: COLORS.blossomCenter }));
  }
}

/** A rounded boulder centred at (x, y) with half sizes rx/ry: outline, lit from the top left, a crack. */
function boulder(s: Svg, x: number, y: number, rx: number, ry: number): void {
  const fill = s.ball(lighter(COLORS.rockLight, 0.2), COLORS.rockShade);
  s.add(
    path(
      `${d.m(x - rx, y + ry * 0.35)}${d.q(x - rx * 1.05, y - ry * 0.75, x - rx * 0.25, y - ry)}${d.q(x + rx * 0.55, y - ry * 1.1, x + rx, y - ry * 0.1)}${d.q(x + rx * 1.08, y + ry * 0.7, x + rx * 0.45, y + ry)}${d.l(x - rx * 0.55, y + ry)}${d.q(x - rx * 0.98, y + ry * 0.9, x - rx, y + ry * 0.35)}${d.z}`,
      { fill, stroke: outlineOf(COLORS.rockShade) },
    ),
  );
  s.add(ellipse(x - rx * 0.35, y - ry * 0.5, rx * 0.32, ry * 0.2, { fill: COLORS.white, opacity: 0.45 }, -20));
  s.add(line([[x + rx * 0.12, y - ry * 0.2], [x + rx * 0.34, y + ry * 0.22], [x + rx * 0.2, y + ry * 0.55]], COLORS.rockCrack, 1.3, 0.6));
}

export function drawBigRock(s: Svg): void {
  const cx = s.width / 2;
  const ground = s.height * 0.86;
  s.add(shadow(cx + 2, ground - 1, 40, 10));
  boulder(s, cx - 8, ground - 22, 32, 24);
  boulder(s, cx + 23, ground - 10, 18, 12);
  // A tuft at the foot: the rock sits in the meadow.
  s.add(tuftAt(cx - 38, ground, COLORS.grassShade, 1.1));
}

export function drawRockPair(s: Svg): void {
  const cx = s.width / 2;
  const ground = s.height * 0.86;
  s.add(shadow(cx, ground - 1, 44, 9));
  boulder(s, cx - 16, ground - 17, 25, 18);
  boulder(s, cx + 20, ground - 13, 21, 15);
  boulder(s, cx + 2, ground - 5, 10, 7);
}

export function drawSmallRock(s: Svg): void {
  const cx = s.width / 2;
  const ground = s.height * 0.86;
  s.add(shadow(cx, ground - 1, 30, 7));
  boulder(s, cx - 4, ground - 15, 23, 17);
  boulder(s, cx + 18, ground - 6, 10, 7);
  s.add(tuftAt(cx + 27, ground, COLORS.grassShade, 0.9));
}

/** A glint on the sea: a short bright stroke with a soft halo. */
export function drawGlint(s: Svg): void {
  const w = s.width;
  const h = s.height;
  s.add(ellipse(w / 2, h / 2, w * 0.48, h * 0.32, { fill: COLORS.foam, opacity: 0.25 }), path(`${d.m(w * 0.12, h * 0.55)}${d.q(w / 2, h * 0.1, w * 0.88, h * 0.55)}`, { stroke: COLORS.foam, width: 1.6, under: false, opacity: 0.95 }));
}

/** A small wave that runs up the beach: a white arc with a soft edge (it grows and fades in the game). */
export function drawShoreWave(s: Svg): void {
  const w = s.width;
  const h = s.height;
  s.add(
    path(`${d.m(4, h - 4)}${d.q(w / 2, -2, w - 4, h - 4)}`, { stroke: COLORS.foam, width: 4, under: false, opacity: 0.35 }),
    path(`${d.m(6, h - 4)}${d.q(w / 2, 1, w - 6, h - 4)}`, { stroke: COLORS.foam, width: 1.8, under: false, opacity: 0.95 }),
  );
}

/** Soft but clearly visible ring around a tapped tile: a dark halo for contrast on light ground, then white lines. */
export function drawRing(s: Svg): void {
  const c = s.width / 2;
  const radius = c - 18;
  s.add(
    circle(c, c + 2, radius, { stroke: COLORS.ringShadow, width: 11, under: false, opacity: 0.28 }),
    circle(c, c, radius, { stroke: COLORS.ringGlow, width: 10, under: false, opacity: 0.35 }),
    circle(c, c, radius, { stroke: COLORS.ringGlow, width: 6, under: false, opacity: 0.7 }),
    circle(c, c, radius, { stroke: COLORS.ringGlow, width: 3.5, under: false }),
  );
}

/** A soft white puff (building and demolishing). */
export function drawPuff(s: Svg): void {
  const c = s.width / 2;
  s.add(circle(c, c, c - 2, { fill: s.glow(COLORS.puff, 0.95) }), circle(c - 4, c - 5, c * 0.45, { fill: COLORS.puff, opacity: 0.55 }));
}

/** A curl of smoke from a chimney (it rises, grows and fades in the game). */
export function drawSmoke(s: Svg): void {
  const c = s.width / 2;
  s.add(cluster([[c - 5, c + 2, 8], [c + 5, c - 1, 9], [c, c - 6, 8]], COLORS.smoke, lighter(STYLE.ink, 0.72), 1.2));
  s.add(circle(c - 3, c - 6, 3.4, { fill: COLORS.white, opacity: 0.9 }));
}
