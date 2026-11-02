import { COLORS, HAT_COLORS } from '../ui/style';
import type { Svg} from './svg';
import { circle, cluster, d, darker, ellipse, group, lighter, line, outlineOf, path, rect, shadow } from './svg';

/**
 * The residents (M9): small round gnomes of their own design with a soft pointed hat whose tip falls to the side and
 * a pompom (one picture per hat colour of `residents.json`). Skin, cheeks and clothes come from the theme
 * (`theme.json` → `COLORS.skin` …). Plus the little sailing boat, the mood signs, the "z" of sleep and the ring
 * around a chosen resident. The sizes are the sizes in the world (px); the feet are the anchor of a figure.
 */

/** Size of a resident picture; the feet stand at {@link RESIDENT_FOOT}. */
export const RESIDENT_SIZE = { width: 40, height: 68 } as const;
export const RESIDENT_FOOT = { x: 20, y: 63 } as const;

export const BOAT_SIZE = { width: 84, height: 56 } as const;
/** The water line of the boat. */
export const BOAT_WATER = { x: 42, y: 40 } as const;

export const MOOD_SIZE = 48;
/** The "z" of sleep (M9: bigger than before, so it reads on the tablet from afar; shown 64–112 CSS px over the night). */
export const SLEEP_SIZE = 112;
export const RING_SIZE = { width: 64, height: 32 } as const;

export interface HatColors {
  readonly hat: number;
  readonly shade: number;
}

/** Markup of one resident with the feet at (fx, fy). */
export function residentMarkup(s: Svg, hat: HatColors, withShadow: boolean, fx: number, fy: number): string {
  const skin = s.ball(lighter(COLORS.skin, 0.2), COLORS.skinShade);
  const clothes = s.across(fx - 12, fy - 28, fx + 12, fy - 8, lighter(COLORS.tunic, 0.1), COLORS.tunicShade);
  const cap = s.across(fx - 12, fy - 60, fx + 16, fy - 36, lighter(hat.hat, 0.2), hat.shade);
  const skinRim = outlineOf(COLORS.skinShade);
  const clothRim = outlineOf(COLORS.tunicShade);
  const hatRim = outlineOf(hat.shade);
  const head = fy - 35;
  const brim = head - 3;
  const parts: string[] = [];
  if (withShadow) {
    parts.push(shadow(fx, fy, 12, 4, 1.2));
  }
  parts.push(
    // Legs and round shoes.
    rect(fx - 8, fy - 13, 7, 10, 3, { fill: COLORS.trousers, stroke: clothRim, width: 1 }),
    rect(fx + 1, fy - 13, 7, 10, 3, { fill: COLORS.trousers, stroke: clothRim, width: 1 }),
    ellipse(fx - 5, fy - 2.4, 5.2, 3.2, { fill: COLORS.shoe, stroke: clothRim, width: 1 }),
    ellipse(fx + 5, fy - 2.4, 5.2, 3.2, { fill: COLORS.shoe, stroke: clothRim, width: 1 }),
    // A round tunic.
    path(`${d.m(fx - 8, fy - 28)}${d.q(fx - 14, fy - 15, fx - 11, fy - 10)}${d.l(fx + 11, fy - 10)}${d.q(fx + 14, fy - 15, fx + 8, fy - 28)}${d.z}`, { fill: clothes, stroke: clothRim, width: 1.2 }),
    rect(fx - 11, fy - 13, 22, 3, 1.5, { fill: COLORS.tunicShade }),
    // Hands.
    circle(fx - 12, fy - 15, 3.3, { fill: skin, stroke: skinRim, width: 1 }),
    circle(fx + 12, fy - 15, 3.3, { fill: skin, stroke: skinRim, width: 1 }),
    // Ears and head.
    circle(fx - 10, head + 1, 2.8, { fill: COLORS.skinShade, stroke: skinRim, width: 1 }),
    circle(fx + 10, head + 1, 2.8, { fill: COLORS.skinShade, stroke: skinRim, width: 1 }),
    circle(fx, head, 10.6, { fill: skin, stroke: skinRim, width: 1.2 }),
    // Face: big friendly eyes with a glint, cheeks, a round nose, a smile.
    ellipse(fx - 4, head + 1, 1.9, 2.3, { fill: COLORS.eye }),
    ellipse(fx + 4, head + 1, 1.9, 2.3, { fill: COLORS.eye }),
    circle(fx - 3.4, head + 0.2, 0.7, { fill: COLORS.white }),
    circle(fx + 4.6, head + 0.2, 0.7, { fill: COLORS.white }),
    ellipse(fx - 6.6, head + 4.6, 2.4, 1.5, { fill: COLORS.cheek, opacity: 0.75 }),
    ellipse(fx + 6.6, head + 4.6, 2.4, 1.5, { fill: COLORS.cheek, opacity: 0.75 }),
    circle(fx, head + 3.6, 2, { fill: COLORS.skinShade }),
    path(`${d.m(fx - 2.8, head + 6)}${d.q(fx, head + 8.4, fx + 2.8, head + 6)}`, { stroke: COLORS.eye, width: 1.2, under: false }),
    // The pointed hat: soft, the tip falls to the right, with a band and a pompom.
    path(
      `${d.m(fx - 11.8, brim + 1)}${d.q(fx - 9, brim - 15, fx + 3, brim - 21)}${d.q(fx + 11, brim - 24, fx + 15, brim - 14)}${d.q(fx + 10, brim - 15, fx + 8, brim - 11)}${d.q(fx + 11, brim - 5, fx + 11.8, brim + 1)}${d.z}`,
      { fill: cap, stroke: hatRim, width: 1.3 },
    ),
    path(`${d.m(fx - 6, brim - 9)}${d.q(fx - 3, brim - 16, fx + 3, brim - 18)}`, { stroke: lighter(hat.hat, 0.45), width: 1.6, under: false, opacity: 0.8 }),
    rect(fx - 12.6, brim - 1.4, 25.2, 5.2, 2.6, { fill: hat.shade, stroke: hatRim, width: 1 }),
    circle(fx + 15, brim - 13, 3.4, { fill: COLORS.pompom, stroke: darker(COLORS.pompom, 0.35), width: 1 }),
  );
  return parts.join('');
}

export function drawResident(s: Svg, hat: HatColors): void {
  s.add(residentMarkup(s, hat, true, RESIDENT_FOOT.x, RESIDENT_FOOT.y));
}

export function hatColors(id: string): HatColors {
  return HAT_COLORS[id] ?? { hat: COLORS.cancel, shade: COLORS.cancelShade };
}

/** Mast and sail behind the passenger, ripples on the water; water line at (cx, wy). */
function boatBackMarkup(s: Svg, cx: number, wy: number): string {
  const sailRim = outlineOf(COLORS.sailShade);
  return [
    ellipse(cx, wy + 4, 38, 6, { fill: COLORS.wake, opacity: 0.4 }),
    rect(cx + 9, wy - 38, 3.4, 36, 1.7, { fill: COLORS.mast, stroke: true, width: 1 }),
    path(`${d.m(cx + 13, wy - 37)}${d.q(cx + 35, wy - 22, cx + 30, wy - 8)}${d.l(cx + 13, wy - 8)}${d.z}`, { fill: s.across(cx + 13, wy - 37, cx + 30, wy - 8, COLORS.sail, COLORS.sailShade), stroke: sailRim, width: 1.2 }),
    line([[cx + 15, wy - 22], [cx + 29, wy - 17]], COLORS.sailShade, 1.2, 0.8),
  ].join('');
}

/** The hull in front of the passenger; water line at (cx, wy). */
function boatFrontMarkup(s: Svg, cx: number, wy: number): string {
  const rim = outlineOf(COLORS.boatHullShade);
  return [
    path(`${d.m(cx - 34, wy - 12)}${d.l(cx + 34, wy - 12)}${d.q(cx + 30, wy + 4, cx + 18, wy + 5)}${d.l(cx - 18, wy + 5)}${d.q(cx - 30, wy + 4, cx - 34, wy - 12)}${d.z}`, {
      fill: s.vertical(COLORS.boatHull, COLORS.boatHullShade),
      stroke: rim,
      width: 1.3,
    }),
    line([[cx - 28, wy - 4], [cx + 28, wy - 4]], COLORS.boatHullShade, 1.4, 0.8),
    rect(cx - 36, wy - 15, 72, 5, 2.5, { fill: COLORS.boatRim, stroke: rim, width: 1 }),
    circle(cx - 20, wy - 5, 2.2, { fill: COLORS.boatRim }),
    circle(cx + 20, wy - 5, 2.2, { fill: COLORS.boatRim }),
  ].join('');
}

export function drawBoatBack(s: Svg): void {
  s.add(boatBackMarkup(s, BOAT_WATER.x, BOAT_WATER.y));
}

export function drawBoatFront(s: Svg): void {
  s.add(boatFrontMarkup(s, BOAT_WATER.x, BOAT_WATER.y));
}

/** The picture of the shop card "invite": a resident in the boat that brings them (fits any box). */
export function drawInvite(s: Svg): void {
  const cx = s.width / 2;
  const wy = s.height - 14;
  s.add(
    group([boatBackMarkup(s, cx, wy), residentMarkup(s, hatColors('red'), false, cx - 6, wy + 2), boatFrontMarkup(s, cx, wy)], {
      transform: `translate(${String(cx)} ${String(wy)}) scale(0.86) translate(${String(-cx)} ${String(-wy)})`,
    }),
  );
}

function heartPath(x: number, y: number, r: number): string {
  return `${d.m(x, y + r * 0.95)}${d.c(x - r * 1.35, y + r * 0.05, x - r * 0.85, y - r * 1.05, x, y - r * 0.4)}${d.c(x + r * 0.85, y - r * 1.05, x + r * 1.35, y + r * 0.05, x, y + r * 0.95)}${d.z}`;
}

/** Happy: a red heart with a white rim (readable on grass, water and the card). */
export function drawHeart(s: Svg): void {
  const c = s.width / 2;
  const r = s.width * 0.4;
  s.add(
    path(heartPath(c, c + 1, r), { fill: s.ball(lighter(COLORS.moodHeart, 0.3), COLORS.moodHeartShade), stroke: COLORS.moodRim, width: r * 0.16 }),
    ellipse(c - r * 0.42, c - r * 0.3, r * 0.2, r * 0.13, { fill: COLORS.white, opacity: 0.85 }, -35),
  );
}

/** Normal: a round sunny face with a straight mouth. */
export function drawFace(s: Svg): void {
  const c = s.width / 2;
  const r = s.width * 0.4;
  s.add(
    circle(c, c, r, { fill: s.ball(lighter(COLORS.moodFace, 0.3), COLORS.moodFaceShade), stroke: COLORS.moodRim, width: r * 0.16 }),
    circle(c - r * 0.36, c - r * 0.18, r * 0.13, { fill: COLORS.eye }),
    circle(c + r * 0.36, c - r * 0.18, r * 0.13, { fill: COLORS.eye }),
    line([[c - r * 0.34, c + r * 0.36], [c + r * 0.34, c + r * 0.36]], COLORS.eye, r * 0.12),
  );
}

/** Sad: a small grey-blue cloud with a drop under it. */
export function drawCloud(s: Svg): void {
  const x = s.width / 2;
  const y = s.width / 2 - 3;
  const r = s.width * 0.4;
  const drop = (grow: number): string => {
    const dx = x + r * 0.15;
    const dy = y + r * 0.95;
    return `${d.m(dx, dy - r * (0.42 - grow))}${d.q(dx + r * (0.36 - grow), dy + r * 0.02, dx, dy + r * (0.3 - grow * 0.4))}${d.q(dx - r * (0.36 - grow), dy + r * 0.02, dx, dy - r * (0.42 - grow))}${d.z}`;
  };
  const puffs: [number, number, number][] = [
    [x - 0.55 * r, y + 0.15 * r, 0.42 * r],
    [x, y - 0.18 * r, 0.55 * r],
    [x + 0.55 * r, y + 0.12 * r, 0.44 * r],
    [x, y + 0.3 * r, 0.45 * r],
  ];
  s.add(
    path(drop(0), { fill: COLORS.moodRim }),
    path(drop(0.12), { fill: COLORS.moodDrop }),
    cluster(puffs, s.vertical(lighter(COLORS.moodCloud, 0.2), COLORS.moodCloudShade), COLORS.moodRim, r * 0.14),
    ellipse(x - r * 0.3, y - r * 0.28, r * 0.22, r * 0.13, { fill: COLORS.white, opacity: 0.7 }, -30),
  );
}

/**
 * Three "z" of growing size (a picture, not text), drawn above the dark of the night (Korrekturrunde 1): a soft warm
 * glow around them, a dark blue rim and a warm white letter – they shine over the deep blue and still read on the
 * light island in the evening. They stand apart (their rims never touch, else they read as one zigzag); the big one is
 * a good third of the picture, all three together fill more than four fifths of it.
 */
export function drawSleep(s: Svg): void {
  const size = s.width;
  const zs: readonly [number, number, number][] = [
    [0.13, 0.86, 0.14],
    [0.36, 0.62, 0.22],
    [0.71, 0.28, 0.36],
  ];
  for (const [color, width, opacity] of [
    [COLORS.sleepZGlow, 0.11, 0.45],
    [COLORS.sleepZRim, 0.075, 1],
    [COLORS.sleepZ, 0.042, 1],
  ] as const) {
    for (const [fx, fy, fs] of zs) {
      const x = fx * size;
      const y = fy * size;
      const h = (fs * size) / 2;
      s.add(line([[x - h, y - h], [x + h, y - h], [x - h, y + h], [x + h, y + h]], color, size * width, opacity));
    }
  }
}

/** The ring on the ground around the chosen resident. */
export function drawResidentRing(s: Svg): void {
  s.add(ellipse(32, 16, 26, 11, { stroke: COLORS.residentRing, width: 4, under: false, opacity: 0.95 }), ellipse(32, 16, 21, 8, { stroke: COLORS.white, width: 1.5, under: false, opacity: 0.8 }));
}
