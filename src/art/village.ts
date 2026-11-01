import { COLORS, FLOWER_PETALS, HOUSE_PALETTES, TILE_SIZE } from '../ui/style';
import { drawGoodIcon } from './icons';
import type { Svg} from './svg';
import { circle, cluster, d, darker, ellipse, group, lighter, line, outlineOf, path, polygon, rect, shadow } from './svg';

/**
 * Houses, decoration, production buildings, the island articles, paths and the signs over buildings (M9). Like trees
 * they stand in slight front view and reach up over their footprint; the front edge of the footprint is
 * {@link BUILDING_PAD} above the bottom of the picture (`buildingTextureSize`, `buildingOrigin` in
 * `buildingTextures.ts`). Every shape (`look.shape` in `buildings.json`) has one drawer here.
 */

/** Free space around the footprint in the picture of a building (logical px): room for the shadow. */
export const BUILDING_PAD = 8;

/** The size of the "needs a path" sign; its tip (bottom centre) points at the house. */
export const SIGN_SIZE = { width: 84, height: 98 } as const;
/** Diameter of the bubble of a sign (logical px). */
export const SIGN_BUBBLE = 70;

/**
 * Where the chimney of a production building lets out its smoke while it works: world px from the bottom centre of
 * the footprint (the origin of its sprite). Only shapes with a chimney are listed.
 */
export const CHIMNEYS: Readonly<Record<string, { readonly x: number; readonly y: number }>> = {
  bakery: { x: 32, y: -142 },
  carpenterShop: { x: -38, y: -126 },
  lumberjackHut: { x: -40, y: -118 },
};

export interface BuildingLook {
  readonly shape: string;
  readonly palette?: string;
  readonly scale?: number;
}

type Draw = (s: Svg, look: BuildingLook) => void;

const OUTLINE = (color: number): number => outlineOf(color);

/** The ground line the front of a building stands on (a little above the front edge of the footprint). */
function groundOf(s: Svg, lift = 8): number {
  return s.height - BUILDING_PAD - lift;
}

/** A window: round frame, glass with a glint and a cross. */
function roundWindow(x: number, y: number, r: number): string {
  return [
    circle(x, y, r, { fill: COLORS.windowFrame, stroke: true, width: 1.2 }),
    circle(x, y, r * 0.72, { fill: COLORS.window }),
    line([[x, y - r * 0.72], [x, y + r * 0.72]], COLORS.windowFrame, 1.4),
    line([[x - r * 0.72, y], [x + r * 0.72, y]], COLORS.windowFrame, 1.4),
    ellipse(x - r * 0.3, y - r * 0.3, r * 0.22, r * 0.14, { fill: COLORS.white, opacity: 0.8 }, -40),
  ].join('');
}

/** A door with a round top, planks and a golden knob. */
function archDoor(x: number, ground: number, w: number, h: number, inside: number = COLORS.door): string {
  const top = ground - h + w / 2;
  const outline = `${d.m(x - w / 2, ground)}${d.l(x - w / 2, top)}${d.a(w / 2, w / 2, false, true, x + w / 2, top)}${d.l(x + w / 2, ground)}${d.z}`;
  return [
    path(outline, { fill: inside, stroke: OUTLINE(COLORS.doorDark), width: 1.6 }),
    line([[x - w / 6, ground - 2], [x - w / 6, top - w * 0.28]], COLORS.doorDark, 1.2, 0.7),
    line([[x + w / 6, ground - 2], [x + w / 6, top - w * 0.28]], COLORS.doorDark, 1.2, 0.7),
    circle(x + w * 0.26, ground - h * 0.4, 2.2, { fill: COLORS.doorKnob, stroke: true, width: 0.6 }),
  ].join('');
}

function drawMushroomHouseAt(s: Svg, width: number, height: number, paletteName: string): string {
  const palette = HOUSE_PALETTES[paletteName] ?? HOUSE_PALETTES['red'] ?? { cap: COLORS.mushroomCap, capShade: COLORS.roofShade, dot: COLORS.white };
  const cx = width / 2;
  const ground = height - BUILDING_PAD - 6;
  const parts: string[] = [shadow(cx, ground + 2, 58, 13)];
  // Stem with a little round belly, lit from the left.
  const stemTop = 92;
  const stem = s.across(cx - 34, 0, cx + 34, 0, lighter(COLORS.stem, 0.3), COLORS.stemShade);
  parts.push(
    path(
      `${d.m(cx - 30, stemTop)}${d.q(cx - 40, ground - 40, cx - 35, ground - 4)}${d.q(cx - 34, ground, cx - 28, ground)}${d.l(cx + 28, ground)}${d.q(cx + 34, ground, cx + 35, ground - 4)}${d.q(cx + 40, ground - 40, cx + 30, stemTop)}${d.z}`,
      { fill: stem, stroke: OUTLINE(COLORS.stemShade) },
    ),
  );
  // Windows (with a flower box under the left one) and the door.
  parts.push(roundWindow(cx - 21, 128, 9), roundWindow(cx + 21, 128, 9));
  parts.push(rect(cx - 32, 136, 22, 6, 3, { fill: COLORS.wood, stroke: true, width: 1 }));
  for (const [dx, colour] of [[-27, 0], [-21, 2], [-15, 1]] as const) {
    parts.push(circle(cx + dx, 134, 2.6, { fill: FLOWER_PETALS[colour] ?? COLORS.flower }), circle(cx + dx, 134, 1, { fill: COLORS.flowerCenter }));
  }
  parts.push(archDoor(cx, ground, 26, 42));
  // Stepping stones in front of the door.
  parts.push(ellipse(cx, ground + 1, 16, 3.6, { fill: COLORS.stone, stroke: true, width: 0.8 }));
  // The cap: dark gills below, a big dome lit from the top left, white dots.
  const capY = 88;
  parts.push(ellipse(cx, capY + 6, 66, 13, { fill: darker(palette.capShade, 0.25), stroke: OUTLINE(palette.capShade) }));
  const cap = s.ball(lighter(palette.cap, 0.25), palette.capShade);
  parts.push(
    path(`${d.m(cx - 72, capY + 6)}${d.c(cx - 76, capY - 48, cx - 36, capY - 70, cx, capY - 70)}${d.c(cx + 36, capY - 70, cx + 76, capY - 48, cx + 72, capY + 6)}${d.q(cx, capY + 22, cx - 72, capY + 6)}${d.z}`, {
      fill: cap,
      stroke: OUTLINE(palette.capShade),
    }),
  );
  const dots: readonly [number, number, number][] = [
    [-40, 66, 9],
    [-10, 36, 11],
    [24, 56, 10],
    [48, 78, 6.5],
    [-8, 72, 6.5],
    [-56, 84, 5],
    [40, 34, 6],
    [10, 84, 4.5],
  ];
  for (const [dx, y, r] of dots) {
    parts.push(ellipse(cx + dx, y, r, r * 0.86, { fill: palette.dot, stroke: darker(palette.dot, 0.18), width: 0.6 }));
  }
  parts.push(ellipse(cx - 30, capY - 44, 18, 9, { fill: COLORS.white, opacity: 0.3 }, -28));
  return parts.join('');
}

function drawMushroomHouse(s: Svg, look: BuildingLook): void {
  const scale = look.scale ?? 1;
  s.add(group([drawMushroomHouseAt(s, s.width / scale, s.height / scale, look.palette ?? 'red')], scale === 1 ? {} : { transform: `scale(${String(scale)})` }));
}

/** One flower with a stem, a leaf, five petals and a yellow heart; `base` is where the stem stands. */
function flowerAt(x: number, base: number, stem: number, colour: number, size: number): string {
  const petal = FLOWER_PETALS[colour % FLOWER_PETALS.length] ?? COLORS.flower;
  const parts = [line([[x, base + 2], [x, base - stem]], COLORS.stalk, 2.4), ellipse(x + 4.5, base - stem * 0.45, 5, 2.4, { fill: COLORS.stalk, stroke: true, width: 0.6 }, -28)];
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    parts.push(circle(x + Math.cos(angle) * size, base - stem + Math.sin(angle) * size, size * 0.72, { fill: petal, stroke: darker(petal, 0.35), width: 0.7 }));
  }
  parts.push(circle(x, base - stem, size * 0.6, { fill: COLORS.flowerCenter, stroke: true, width: 0.6 }), circle(x - size * 0.2, base - stem - size * 0.2, size * 0.18, { fill: COLORS.white, opacity: 0.8 }));
  return parts.join('');
}

/** A picket fence along `width` px: rails behind, rounded pickets in front. */
function pickets(left: number, base: number, width: number, height: number, count: number, picketW: number): string {
  const parts: string[] = [
    rect(left, base - height * 0.72, width, picketW * 0.5, picketW * 0.25, { fill: COLORS.wood, stroke: true, width: 1.2 }),
    rect(left, base - height * 0.32, width, picketW * 0.5, picketW * 0.25, { fill: COLORS.wood, stroke: true, width: 1.2 }),
  ];
  const step = count > 1 ? (width - picketW) / (count - 1) : 0;
  for (let i = 0; i < count; i += 1) {
    const x = left + i * step;
    parts.push(
      path(`${d.m(x, base)}${d.l(x, base - height + picketW / 2)}${d.q(x + picketW / 2, base - height - picketW * 0.45, x + picketW, base - height + picketW / 2)}${d.l(x + picketW, base)}${d.z}`, {
        fill: COLORS.woodLight,
        stroke: OUTLINE(COLORS.wood),
        width: 1.4,
      }),
      rect(x + picketW * 0.62, base - height + picketW * 0.6, picketW * 0.26, height - picketW * 0.8, picketW * 0.13, { fill: COLORS.wood, opacity: 0.7 }),
    );
  }
  return parts.join('');
}

function drawGardenHouse(s: Svg, look: BuildingLook): void {
  s.add(drawMushroomHouseAt(s, 2 * TILE_SIZE + 2 * BUILDING_PAD, s.height, look.palette ?? 'pink'));
  const base = s.height - BUILDING_PAD - 10;
  const gardenX = BUILDING_PAD + 2 * TILE_SIZE;
  const cx = gardenX + TILE_SIZE / 2;
  s.add(shadow(cx, base + 3, 30, 7));
  s.add(rect(gardenX + 4, base - 18, TILE_SIZE - 8, 20, 9, { fill: COLORS.soil, stroke: true }));
  s.add(flowerAt(gardenX + 16, base - 7, 22, 0, 5.5), flowerAt(gardenX + 32, base - 6, 30, 2, 6.5), flowerAt(gardenX + 48, base - 7, 20, 3, 5.5));
  s.add(pickets(gardenX + 2, base + 4, TILE_SIZE - 4, 22, 5, 9));
}

function drawFlowers(s: Svg): void {
  const cx = s.width / 2;
  const base = s.height - BUILDING_PAD - 12;
  s.add(shadow(cx, base + 3, 24, 7));
  s.add(ellipse(cx - 6, base + 1, 9, 3.4, { fill: COLORS.grassShade }), ellipse(cx + 12, base + 1, 7, 3, { fill: COLORS.grassShade }));
  for (const [dx, stem, colour, size] of [[-14, 22, 0, 6.5], [17, 18, 2, 6], [3, 32, 1, 7.5]] as const) {
    s.add(flowerAt(cx + dx, base, stem, colour, size));
  }
}

function drawBush(s: Svg): void {
  const cx = s.width / 2;
  const base = s.height - BUILDING_PAD - 12;
  s.add(shadow(cx, base + 3, 30, 8));
  const circles: readonly (readonly [number, number, number])[] = [
    [cx - 15, base - 10, 14],
    [cx + 15, base - 10, 14],
    [cx, base - 19, 18],
    [cx - 6, base - 28, 10],
  ];
  const fill = s.across(cx - 30, base - 40, cx + 30, base, COLORS.treeCrownLight, darker(COLORS.treeCrown, 0.15));
  s.add(cluster(circles, fill, OUTLINE(COLORS.treeCrown)));
  s.add(ellipse(cx - 9, base - 27, 7, 4.5, { fill: lighter(COLORS.treeCrownLight, 0.3), opacity: 0.7 }, -25));
  for (const [dx, dy] of [[-16, -9], [9, -11], [-2, -30], [20, -17], [2, -5]] as const) {
    s.add(circle(cx + dx, base + dy, 3.4, { fill: COLORS.berry, stroke: true, width: 0.7 }), circle(cx + dx - 1, base + dy - 1.2, 1, { fill: COLORS.white, opacity: 0.85 }));
  }
}

/** M9: a fence across the whole tile, tall enough to be seen from far away. */
function drawFence(s: Svg): void {
  const cx = s.width / 2;
  const base = s.height - BUILDING_PAD - 10;
  s.add(shadow(cx, base + 3, 38, 7));
  s.add(pickets(cx - 38, base + 2, 76, 56, 5, 14));
}

function drawBench(s: Svg): void {
  const cx = s.width / 2;
  const base = s.height - BUILDING_PAD - 12;
  s.add(shadow(cx, base + 3, 32, 7));
  s.add(rect(cx - 25, base - 16, 5, 17, 2, { fill: COLORS.woodDark, stroke: true, width: 1 }), rect(cx + 20, base - 16, 5, 17, 2, { fill: COLORS.woodDark, stroke: true, width: 1 }));
  s.add(rect(cx - 28, base - 36, 56, 7, 3.5, { fill: COLORS.wood, stroke: true, width: 1.4 }), rect(cx - 28, base - 27, 56, 7, 3.5, { fill: COLORS.woodLight, stroke: OUTLINE(COLORS.wood), width: 1.4 }));
  s.add(rect(cx - 31, base - 19, 62, 9, 4.5, { fill: s.vertical(lighter(COLORS.woodLight, 0.2), COLORS.wood), stroke: OUTLINE(COLORS.wood), width: 1.4 }));
}

function drawLantern(s: Svg): void {
  const cx = s.width / 2;
  const base = s.height - BUILDING_PAD - 12;
  s.add(shadow(cx, base + 3, 14, 5));
  s.add(circle(cx, base - 58, 28, { fill: s.glow(COLORS.lampGlow, 0.55) }));
  s.add(rect(cx - 8, base - 4, 16, 7, 3.5, { fill: COLORS.iron, stroke: true, width: 1.2 }), rect(cx - 2.5, base - 48, 5, 46, 2.5, { fill: COLORS.iron, stroke: true, width: 1.2 }));
  s.add(rect(cx - 11, base - 70, 22, 24, 6, { fill: COLORS.iron, stroke: true, width: 1.4 }), rect(cx - 7.5, base - 66, 15, 17, 4, { fill: s.vertical(COLORS.white, COLORS.lampGlow) }));
  s.add(path(`${d.m(cx - 14, base - 69)}${d.q(cx, base - 84, cx + 14, base - 69)}${d.z}`, { fill: COLORS.iron, stroke: true, width: 1.4 }), circle(cx, base - 80, 3, { fill: COLORS.iron, stroke: true, width: 1 }));
}

function drawFountain(s: Svg): void {
  const cx = s.width / 2;
  const ground = s.height - BUILDING_PAD - 10;
  s.add(shadow(cx, ground + 2, 60, 14));
  s.add(ellipse(cx, ground - 20, 58, 30, { fill: COLORS.stoneDark, stroke: true }));
  s.add(ellipse(cx, ground - 27, 58, 27, { fill: s.vertical(COLORS.stoneLight, COLORS.stone), stroke: OUTLINE(COLORS.stoneDark) }));
  s.add(ellipse(cx, ground - 28, 47, 20, { fill: COLORS.stoneDark }), ellipse(cx, ground - 26, 45, 18, { fill: s.vertical(COLORS.fountainWater, darker(COLORS.fountainWater, 0.15)) }));
  s.add(ellipse(cx - 16, ground - 25, 13, 4.5, { fill: COLORS.fountainWaterLight, opacity: 0.85 }, -6));
  s.add(rect(cx - 7, ground - 62, 14, 40, 5, { fill: s.across(cx - 7, 0, cx + 7, 0, COLORS.stoneLight, COLORS.stoneDark), stroke: OUTLINE(COLORS.stoneDark) }));
  s.add(ellipse(cx, ground - 64, 23, 9, { fill: COLORS.stoneDark, stroke: true }), ellipse(cx, ground - 67, 23, 8.5, { fill: COLORS.stone, stroke: OUTLINE(COLORS.stoneDark), width: 1.4 }), ellipse(cx, ground - 67, 17, 5.5, { fill: COLORS.fountainWater }));
  for (const side of [-1, 1]) {
    s.add(path(`${d.m(cx, ground - 74)}${d.q(cx + side * 22, ground - 86, cx + side * 32, ground - 40)}`, { stroke: COLORS.fountainWaterLight, width: 3, under: false }));
    s.add(ellipse(cx + side * 32, ground - 38, 7, 2.6, { fill: COLORS.white, opacity: 0.8 }));
  }
  s.add(line([[cx, ground - 74], [cx, ground - 90]], COLORS.fountainWaterLight, 3), circle(cx, ground - 93, 3.4, { fill: COLORS.fountainWaterLight }));
}

function drawFlowerbed(s: Svg): void {
  const cx = s.width / 2;
  const base = s.height - BUILDING_PAD - 8;
  s.add(shadow(cx, base + 3, 58, 9));
  s.add(rect(cx - 57, base - 22, 114, 22, 9, { fill: COLORS.wood, stroke: true }), rect(cx - 50, base - 20, 100, 12, 6, { fill: COLORS.soil }));
  for (const [dx, stem, colour, size] of [[-42, 16, 3, 5.5], [-26, 22, 0, 6.5], [-9, 15, 1, 5.5], [8, 24, 2, 6.5], [25, 17, 0, 5.5], [41, 21, 3, 6]] as const) {
    s.add(flowerAt(cx + dx, base - 9, stem, colour, size));
  }
  s.add(rect(cx - 58, base - 10, 116, 13, 6, { fill: s.vertical(lighter(COLORS.woodLight, 0.2), COLORS.wood), stroke: OUTLINE(COLORS.wood) }));
}

function drawPond(s: Svg): void {
  const cx = s.width / 2;
  const ground = s.height - BUILDING_PAD - 10;
  const cy = ground - 30;
  s.add(shadow(cx, ground + 2, 58, 12));
  s.add(ellipse(cx, cy + 5, 60, 30, { fill: COLORS.stoneDark, stroke: true }), ellipse(cx, cy, 58, 28, { fill: COLORS.stone }));
  s.add(ellipse(cx, cy + 2, 48, 20, { fill: s.vertical(COLORS.fountainWater, darker(COLORS.fountainWater, 0.18)) }), ellipse(cx - 16, cy - 2, 16, 4.5, { fill: COLORS.fountainWaterLight, opacity: 0.85 }, -6));
  for (const [dx, dy, r] of [[-54, 2, 7], [-40, 18, 6.5], [-12, 26, 6], [18, 26, 7], [44, 17, 6.5], [56, 0, 7], [40, -18, 6.5], [-2, -27, 7], [-36, -18, 6], [16, -25, 5.5]] as const) {
    s.add(ellipse(cx + dx, cy + dy, r * 1.15, r * 0.85, { fill: s.ball(COLORS.stoneLight, COLORS.stoneDark), stroke: OUTLINE(COLORS.stoneDark), width: 1 }));
  }
  s.add(ellipse(cx + 16, cy + 4, 12, 5.5, { fill: COLORS.treeCrownLight, stroke: OUTLINE(COLORS.treeCrown), width: 1 }));
  s.add(path(`${d.m(cx + 16, cy + 4)}${d.l(cx + 26, cy + 1)}${d.l(cx + 25, cy + 5)}${d.z}`, { fill: COLORS.fountainWater }));
  s.add(circle(cx + 18, cy + 1, 3.6, { fill: COLORS.blossom, stroke: true, width: 0.6 }), circle(cx + 18, cy + 1, 1.5, { fill: COLORS.flowerCenter }));
  for (const [dx, tall] of [[-52, 42], [-45, 32]] as const) {
    s.add(line([[cx + dx, cy - 6], [cx + dx + 2, cy - tall]], COLORS.stalk, 2.4), rect(cx + dx - 1.5, cy - tall - 9, 5.5, 13, 2.7, { fill: COLORS.trunkDark, stroke: true, width: 0.8 }));
  }
}

/** A roof: two slopes, the left lit, the right in shade, with an outline and a row of tiles. */
function roof(s: Svg, cx: number, baseY: number, halfWidth: number, peakY: number, light: number, dark: number): string {
  const tiles: string[] = [];
  for (let i = 1; i <= 3; i += 1) {
    const t = i / 4;
    const y = peakY + (baseY - peakY) * t;
    const half = halfWidth * t;
    tiles.push(line([[cx - half + 3, y], [cx + half - 3, y]], darker(dark, 0.15), 1.4, 0.55));
  }
  return [
    path(`${d.m(cx - halfWidth - 4, baseY + 3)}${d.q(cx - halfWidth * 0.5, (baseY + peakY) / 2, cx - 3, peakY + 1)}${d.q(cx, peakY - 3, cx + 3, peakY + 1)}${d.q(cx + halfWidth * 0.5, (baseY + peakY) / 2, cx + halfWidth + 4, baseY + 3)}${d.z}`, {
      fill: s.across(cx - halfWidth, peakY, cx + halfWidth, baseY, lighter(light, 0.15), dark),
      stroke: OUTLINE(dark),
    }),
    ...tiles,
  ].join('');
}

/** Wooden wall with horizontal planks. */
function planks(s: Svg, x: number, y: number, w: number, h: number): string {
  const parts = [rect(x, y, w, h, 5, { fill: s.vertical(lighter(COLORS.woodLight, 0.15), COLORS.wood), stroke: OUTLINE(COLORS.wood) })];
  for (let py = y + 13; py < y + h - 4; py += 13) {
    parts.push(line([[x + 3, py], [x + w - 3, py]], COLORS.wood, 1.6, 0.8));
  }
  return parts.join('');
}

function log(x: number, y: number, length: number): string {
  return [
    rect(x, y - 8, length, 16, 6, { fill: COLORS.wood, stroke: true, width: 1.4 }),
    rect(x + 4, y - 7, length - 8, 4, 2, { fill: COLORS.woodLight, opacity: 0.7 }),
    ellipse(x + 2, y, 7, 8.2, { fill: COLORS.woodLight, stroke: OUTLINE(COLORS.wood), width: 1.2 }),
    ellipse(x + 2, y, 4.2, 5.2, { stroke: COLORS.wood, width: 1, under: false }),
    circle(x + 2, y, 1.4, { fill: COLORS.woodDark }),
  ].join('');
}

function drawLumberjackHut(s: Svg): void {
  const cx = s.width / 2;
  const ground = groundOf(s);
  s.add(shadow(cx, ground + 3, 66, 14));
  s.add(log(cx + 24, ground - 8, 38), log(cx + 24, ground - 24, 38), log(cx + 36, ground - 40, 32));
  s.add(planks(s, cx - 56, ground - 78, 84, 78));
  s.add(rect(cx - 56, ground - 12, 84, 12, 4, { fill: COLORS.woodDark, stroke: true, width: 1.2 }));
  s.add(rect(cx - 14, ground - 50, 28, 50, 9, { fill: COLORS.door, stroke: OUTLINE(COLORS.doorDark) }), circle(cx + 7, ground - 24, 2.4, { fill: COLORS.doorKnob, stroke: true, width: 0.6 }));
  s.add(roundWindow(cx - 37, ground - 50, 9));
  // The axe on the wall: the sign of the lumberjack.
  s.add(
    group(
      [
        rect(-2.6, -26, 5.2, 38, 2.6, { fill: COLORS.woodDark, stroke: true, width: 1 }),
        path(`${d.m(2, -26)}${d.q(19, -29, 18, -11)}${d.q(10, -11, 2, -14)}${d.z}`, { fill: s.vertical(COLORS.ironLight, COLORS.iron), stroke: true, width: 1.2 }),
      ],
      { transform: `translate(${String(cx + 14)} ${String(ground - 60)}) rotate(-20)` },
    ),
  );
  // A stone chimney on the left slope.
  s.add(rect(cx - 47, ground - 120, 14, 30, 3, { fill: COLORS.stone, stroke: true, width: 1.4 }));
  s.add(roof(s, cx - 14, ground - 74, 64, ground - 134, COLORS.roofTile, COLORS.roofTileShade));
  s.add(rect(cx - 50, ground - 124, 20, 7, 3, { fill: COLORS.stoneDark, stroke: true, width: 1.2 }));
}

function drawBerryGarden(s: Svg): void {
  const cx = s.width / 2;
  const ground = s.height - BUILDING_PAD - 6;
  s.add(shadow(cx, ground + 2, 62, 12));
  s.add(rect(cx - 60, ground - 58, 120, 62, 14, { fill: COLORS.soil, stroke: true }));
  for (const y of [ground - 42, ground - 26, ground - 10]) {
    s.add(line([[cx - 50, y], [cx + 50, y]], COLORS.soilDark, 3, 0.7));
  }
  const bush = (x: number, y: number, size: number): void => {
    const circles: readonly (readonly [number, number, number])[] = [
      [x - size * 0.55, y - size * 0.25, size * 0.66],
      [x + size * 0.55, y - size * 0.25, size * 0.66],
      [x, y - size * 0.7, size * 0.8],
    ];
    s.add(cluster(circles, s.across(x - size, y - size * 1.5, x + size, y, COLORS.treeCrownLight, darker(COLORS.treeCrown, 0.12)), OUTLINE(COLORS.treeCrown), 1.6));
    for (const [dx, dy] of [[-0.7, -0.2], [0.6, -0.1], [-0.1, -0.95], [0.1, -0.3], [0.75, -0.7]] as const) {
      s.add(circle(x + dx * size, y + dy * size, size * 0.2, { fill: COLORS.berry, stroke: true, width: 0.6 }), circle(x + dx * size - 1, y + dy * size - 1.2, size * 0.07, { fill: COLORS.white, opacity: 0.85 }));
    }
  };
  bush(cx - 28, ground - 36, 17);
  bush(cx + 28, ground - 36, 17);
  bush(cx - 36, ground - 12, 19);
  bush(cx, ground - 8, 19);
  bush(cx + 36, ground - 12, 19);
  s.add(pickets(cx - 60, ground + 6, 120, 16, 9, 8));
}

function drawQuarry(s: Svg): void {
  const cx = s.width / 2;
  const ground = s.height - BUILDING_PAD - 6;
  s.add(shadow(cx, ground + 2, 64, 13));
  s.add(ellipse(cx, ground - 22, 62, 27, { fill: COLORS.rockFloor, stroke: OUTLINE(COLORS.rockFloorDark) }));
  const block = (x: number, y: number, w: number, h: number): void => {
    s.add(rect(x, y, w, h, 5, { fill: s.vertical(COLORS.stoneLight, COLORS.stoneDark), stroke: OUTLINE(COLORS.stoneDark) }), rect(x + 3, y + 3, w - 6, h * 0.22, 3, { fill: COLORS.white, opacity: 0.5 }));
  };
  block(cx - 48, ground - 34, 38, 28);
  block(cx - 6, ground - 36, 42, 30);
  block(cx - 30, ground - 62, 40, 28);
  block(cx + 24, ground - 24, 30, 24);
  for (const [dx, dy, r] of [[-40, 0, 10], [-18, 5, 7], [34, 3, 9]] as const) {
    s.add(ellipse(cx + dx, ground + dy - 7, r * 1.2, r * 0.9, { fill: s.ball(COLORS.rockLight, COLORS.rockShade), stroke: OUTLINE(COLORS.rockShade), width: 1.2 }));
  }
  s.add(
    group(
      [
        rect(-2.6, -70, 5.2, 74, 2.6, { fill: COLORS.woodDark, stroke: true, width: 1 }),
        path(`${d.m(-21, -60)}${d.q(0, -80, 21, -60)}${d.q(0, -71, -21, -60)}${d.z}`, { fill: COLORS.ironLight, stroke: OUTLINE(COLORS.iron), width: 1.4 }),
      ],
      { transform: `translate(${String(cx + 52)} ${String(ground - 6)}) rotate(18)` },
    ),
  );
}

function drawCarpenterShop(s: Svg): void {
  const cx = s.width / 2;
  const ground = groundOf(s);
  s.add(shadow(cx, ground + 3, 66, 14));
  for (let i = 0; i < 3; i += 1) {
    s.add(rect(cx - 80, ground - 12 - i * 8, 36, 7, 2.5, { fill: i % 2 === 0 ? COLORS.woodLight : COLORS.wood, stroke: OUTLINE(COLORS.wood), width: 1 }));
  }
  s.add(planks(s, cx - 56, ground - 74, 112, 74));
  s.add(rect(cx - 38, ground - 52, 76, 52, 7, { fill: COLORS.woodDark, stroke: OUTLINE(COLORS.doorDark) }), rect(cx - 33, ground - 47, 66, 47, 5, { fill: darker(COLORS.woodDark, 0.25) }));
  s.add(rect(cx - 30, ground - 22, 60, 8, 3, { fill: COLORS.woodLight, stroke: true, width: 1 }), rect(cx - 27, ground - 14, 5, 14, 2, { fill: COLORS.wood }), rect(cx + 22, ground - 14, 5, 14, 2, { fill: COLORS.wood }));
  s.add(rect(cx - 18, ground - 29, 34, 7, 2.5, { fill: COLORS.cakeSponge, stroke: true, width: 1 }));
  // A saw on the wall.
  const teeth: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    teeth.push(polygon([[-24 + i * 5, 3 + i * 0.6], [-21.5 + i * 5, 8], [-19 + i * 5, 3.4 + i * 0.6]], { fill: COLORS.iron }));
  }
  s.add(
    group(
      [path(`${d.m(-26, 0)}${d.l(10, -7)}${d.l(10, 7)}${d.z}`, { fill: COLORS.ironLight, stroke: OUTLINE(COLORS.iron), width: 1.2 }), ...teeth, rect(8, -8, 16, 16, 5, { fill: COLORS.woodDark, stroke: true, width: 1 })],
      { transform: `translate(${String(cx + 46)} ${String(ground - 60)}) rotate(-28)` },
    ),
  );
  // A little stove pipe on the roof.
  s.add(rect(cx - 44, ground - 120, 12, 28, 3, { fill: COLORS.iron, stroke: true, width: 1.4 }));
  s.add(roof(s, cx, ground - 70, 70, ground - 126, COLORS.roof, COLORS.roofShade));
  s.add(rect(cx - 46, ground - 124, 16, 6, 3, { fill: COLORS.ironLight, stroke: OUTLINE(COLORS.iron), width: 1.2 }));
}

function drawBakery(s: Svg): void {
  const cx = s.width / 2;
  const ground = groundOf(s);
  s.add(shadow(cx, ground + 3, 66, 14));
  s.add(rect(cx + 22, ground - 128, 20, 40, 3, { fill: s.vertical(COLORS.stone, COLORS.stoneDark), stroke: OUTLINE(COLORS.stoneDark) }));
  s.add(rect(cx - 54, ground - 76, 108, 76, 9, { fill: s.across(cx - 54, 0, cx + 54, 0, lighter(COLORS.stem, 0.3), COLORS.stemShade), stroke: OUTLINE(COLORS.stemShade) }));
  // Half-timbering: friendly beams on the wall.
  for (const x of [cx - 46, cx + 44]) {
    s.add(rect(x - 3, ground - 72, 6, 70, 3, { fill: COLORS.wood, opacity: 0.85 }));
  }
  s.add(rect(cx - 50, ground - 58, 100, 5, 2.5, { fill: COLORS.wood, opacity: 0.85 }));
  s.add(archDoor(cx, ground, 30, 50, COLORS.glow));
  s.add(roundWindow(cx - 34, ground - 34, 10), roundWindow(cx + 34, ground - 34, 10));
  // The loaf on a round sign above the door.
  s.add(circle(cx, ground - 66, 13, { fill: COLORS.cakeCream, stroke: OUTLINE(COLORS.woodDark), width: 2 }));
  s.add(ellipse(cx, ground - 66, 8.5, 5.4, { fill: COLORS.bread, stroke: true, width: 1 }), path(`${d.m(cx - 4, ground - 69)}${d.l(cx - 2, ground - 64)}${d.m(cx + 1, ground - 69.6)}${d.l(cx + 3, ground - 64.4)}`, { stroke: COLORS.breadShade, width: 1.2, under: false }));
  s.add(roof(s, cx, ground - 72, 68, ground - 124, COLORS.roofTile, COLORS.roofTileShade));
  s.add(rect(cx + 18, ground - 132, 28, 9, 4, { fill: COLORS.stoneLight, stroke: OUTLINE(COLORS.stoneDark) }));
}

function drawMarket(s: Svg): void {
  const cx = s.width / 2;
  const ground = groundOf(s);
  s.add(shadow(cx, ground + 3, 92, 18));
  s.add(rect(cx - 82, ground - 94, 164, 82, 7, { fill: s.vertical(COLORS.wood, COLORS.woodDark), stroke: true }));
  s.add(rect(cx - 91, ground - 120, 11, 120, 5, { fill: COLORS.wood, stroke: true, width: 1.4 }), rect(cx + 80, ground - 120, 11, 120, 5, { fill: COLORS.wood, stroke: true, width: 1.4 }));
  s.add(rect(cx - 87, ground - 44, 174, 16, 5, { fill: COLORS.woodLight, stroke: OUTLINE(COLORS.wood), width: 1.6 }), rect(cx - 86, ground - 29, 172, 29, 5, { fill: COLORS.wood, stroke: true, width: 1.6 }));
  for (let x = cx - 78; x < cx + 70; x += 38) {
    s.add(rect(x, ground - 24, 30, 20, 4, { fill: COLORS.woodDark, stroke: true, width: 1 }));
  }
  // A cake, berries and coins on the counter.
  s.add(ellipse(cx - 58, ground - 49, 17, 5.5, { fill: COLORS.white, stroke: true, width: 1 }));
  s.add(rect(cx - 72, ground - 66, 28, 18, 5, { fill: COLORS.cakeSponge, stroke: true, width: 1.2 }), ellipse(cx - 58, ground - 65, 14, 4.4, { fill: COLORS.cakeIcing }), circle(cx - 58, ground - 71, 4.4, { fill: COLORS.berry, stroke: true, width: 0.8 }));
  for (const [dx, dy] of [[-16, 0], [-6, 3], [4, -1], [14, 2], [24, 0]] as const) {
    s.add(circle(cx + dx, ground - 52 + dy, 6.6, { fill: s.ball(lighter(COLORS.berry, 0.2), COLORS.berryDark), stroke: true, width: 0.8 }));
  }
  s.add(ellipse(cx + 62, ground - 51, 16, 5, { fill: COLORS.coinRim, stroke: true, width: 1 }), ellipse(cx + 62, ground - 54, 16, 5, { fill: COLORS.coin, stroke: OUTLINE(COLORS.coinRim), width: 1 }));
  s.add(ellipse(cx + 60, ground - 60, 14, 4.4, { fill: COLORS.coinRim, stroke: true, width: 1 }), ellipse(cx + 60, ground - 63, 14, 4.4, { fill: COLORS.coin, stroke: OUTLINE(COLORS.coinRim), width: 1 }));
  // The striped awning with a scalloped edge.
  const awningTop = ground - 140;
  const awningBottom = ground - 102;
  const stripes = 8;
  const stripeW = 196 / stripes;
  for (let i = 0; i < stripes; i += 1) {
    const x0 = cx - 98 + i * stripeW + (i - stripes / 2) * 1.2;
    const x1 = cx - 98 + (i + 1) * stripeW + (i + 1 - stripes / 2) * 1.2;
    const b0 = cx - 98 + i * stripeW + (i - stripes / 2) * 1.6;
    const b1 = cx - 98 + (i + 1) * stripeW + (i + 1 - stripes / 2) * 1.6;
    const colour = i % 2 === 0 ? COLORS.awningRed : COLORS.awningWhite;
    s.add(path(`${d.m(x0, awningTop)}${d.l(x1, awningTop)}${d.l(b1, awningBottom)}${d.a((b1 - b0) / 2, (b1 - b0) / 2, false, true, b0, awningBottom)}${d.z}`, { fill: colour, stroke: OUTLINE(COLORS.awningRed), width: 1.2 }));
  }
  s.add(rect(cx - 104, awningTop - 4, 208, 8, 4, { fill: COLORS.awningRed, stroke: true, width: 1.4 }));
  s.add(circle(cx, awningTop - 14, 13, { fill: s.ball(COLORS.coinShine, COLORS.coin), stroke: OUTLINE(COLORS.coinRim) }), circle(cx, awningTop - 14, 7.5, { stroke: COLORS.coinRim, width: 1.6, under: false }));
}

/** The picture of "plant a tree": a young tree on a little mound of soil. */
function drawIslandTree(s: Svg): void {
  const cx = s.width / 2;
  const base = s.height - BUILDING_PAD - 8;
  s.add(shadow(cx, base + 3, 24, 7));
  s.add(ellipse(cx, base, 17, 6, { fill: COLORS.soil, stroke: true }));
  s.add(rect(cx - 4.5, base - 38, 9, 38, 3, { fill: s.vertical(COLORS.treeTrunk, COLORS.trunkDark), stroke: OUTLINE(COLORS.treeTrunk) }));
  const circles: readonly (readonly [number, number, number])[] = [
    [cx - 12, base - 43, 14],
    [cx + 12, base - 43, 14],
    [cx, base - 58, 19],
  ];
  s.add(cluster(circles, s.across(cx - 26, base - 78, cx + 26, base - 30, COLORS.treeCrownLight, darker(COLORS.treeCrown, 0.15)), OUTLINE(COLORS.treeCrown)));
  s.add(ellipse(cx - 7, base - 66, 7, 4.5, { fill: lighter(COLORS.treeCrownLight, 0.3), opacity: 0.75 }, -25));
}

/** The picture of "set a rock": a big grey rock with a lit side and two pebbles. */
function drawIslandRock(s: Svg): void {
  const cx = s.width / 2;
  const base = s.height - BUILDING_PAD - 8;
  s.add(shadow(cx, base + 2, 30, 8));
  s.add(
    path(`${d.m(cx - 28, base)}${d.q(cx - 34, base - 24, cx - 12, base - 32)}${d.q(cx + 12, base - 38, cx + 28, base - 18)}${d.q(cx + 36, base - 4, cx + 26, base)}${d.z}`, {
      fill: s.ball(lighter(COLORS.rockLight, 0.2), COLORS.rockShade),
      stroke: OUTLINE(COLORS.rockShade),
    }),
  );
  s.add(ellipse(cx - 12, base - 24, 9, 4.5, { fill: COLORS.white, opacity: 0.5 }, -28), line([[cx + 6, base - 24], [cx + 10, base - 14], [cx + 7, base - 6]], COLORS.rockCrack, 1.3, 0.6));
  s.add(ellipse(cx + 36, base - 2, 6, 4, { fill: COLORS.rock, stroke: true, width: 1 }), ellipse(cx - 36, base - 1, 5, 3.5, { fill: COLORS.rockShade, stroke: true, width: 1 }));
}

/** One tile of ground in a rounded frame of water and foam: the pictures of "beach" and "meadow". */
function groundTile(s: Svg, ground: number, rim: number): void {
  const x = BUILDING_PAD;
  s.add(rect(x - 3, 2, TILE_SIZE + 6, TILE_SIZE + 2, 20, { fill: COLORS.waterMid }), rect(x - 1, 4, TILE_SIZE + 2, TILE_SIZE - 2, 18, { fill: COLORS.foam, opacity: 0.85 }));
  s.add(rect(x + 2, 9, TILE_SIZE - 4, TILE_SIZE - 6, 16, { fill: rim }), rect(x + 2, 4, TILE_SIZE - 4, TILE_SIZE - 6, 16, { fill: s.vertical(lighter(ground, 0.25), ground), stroke: OUTLINE(rim), width: 1.2 }));
}

function drawIslandBeach(s: Svg): void {
  groundTile(s, COLORS.sand, COLORS.sandShade);
  const cx = BUILDING_PAD + TILE_SIZE / 2;
  for (const [dx, dy, r] of [[-14, -8, 2.2], [10, -14, 1.8], [16, 6, 2.4], [-10, 12, 2], [2, 0, 2]] as const) {
    s.add(circle(cx + dx, 30 + dy, r, { fill: COLORS.sandSpeck, opacity: 0.5 }));
  }
  s.add(path(`${d.m(cx - 12, 38)}${d.q(cx - 4, 26, cx + 4, 38)}${d.q(cx - 4, 41, cx - 12, 38)}${d.z}`, { fill: COLORS.shell, stroke: COLORS.sandShade, width: 1 }));
}

function drawIslandMeadow(s: Svg): void {
  groundTile(s, COLORS.grass, COLORS.grassShade);
  const cx = BUILDING_PAD + TILE_SIZE / 2;
  for (const [dx, dy] of [[-16, 12], [14, 14], [-4, -10]] as const) {
    s.add(line([[cx + dx - 6, 28 + dy - 8], [cx + dx - 3, 28 + dy], [cx + dx, 28 + dy - 10], [cx + dx + 3, 28 + dy], [cx + dx + 6, 28 + dy - 8]], COLORS.grassShade, 2.2));
  }
  for (const [dx, dy, colour] of [[-12, -4, 0], [14, -8, 2], [4, 10, 3]] as const) {
    const petal = FLOWER_PETALS[colour] ?? COLORS.flower;
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2;
      s.add(circle(cx + dx + Math.cos(angle) * 4, 28 + dy + Math.sin(angle) * 4, 2.8, { fill: petal, stroke: darker(petal, 0.35), width: 0.5 }));
    }
    s.add(circle(cx + dx, 28 + dy, 2.4, { fill: COLORS.flowerCenter }));
  }
}

/**
 * One path tile that joins its neighbours: a rounded middle plus an arm to every side that has a path (mask bits 1
 * north, 2 east, 4 south, 8 west), a rim, a lighter top and flat stones in a fixed pattern.
 */
export function drawPathTile(s: Svg, mask: number): void {
  const size = s.width;
  const c = size / 2;
  const shape = (half: number, radius: number, fill: number | string): string => {
    const paint = { fill };
    const parts = [rect(c - half, c - half, half * 2, half * 2, radius, paint)];
    if (mask & 1) parts.push(rect(c - half, 0, half * 2, c, 0, paint));
    if (mask & 2) parts.push(rect(c, c - half, c, half * 2, 0, paint));
    if (mask & 4) parts.push(rect(c - half, c, half * 2, c, 0, paint));
    if (mask & 8) parts.push(rect(0, c - half, c, half * 2, 0, paint));
    return parts.join('');
  };
  s.add(shape(24, 14, COLORS.pathRim), shape(21, 12, COLORS.pathFill));
  // Flat stones: a fixed pattern in the middle and two on every arm, so neighbouring tiles look alike.
  const arms: readonly [number, number, number][] = [
    [1, 0, -1],
    [2, 1, 0],
    [4, 0, 1],
    [8, -1, 0],
  ];
  const stone = { fill: COLORS.pathStone, stroke: COLORS.pathStoneDark, width: 0.7 } as const;
  for (const [bit, dx, dy] of arms) {
    if (mask & bit) {
      s.add(ellipse(c + dx * 24 + dy * 6, c + dy * 24 + dx * 6, 3.6, 2.8, stone), ellipse(c + dx * 25 - dy * 7, c + dy * 25 - dx * 7, 2.6, 2.1, stone));
    }
  }
  for (const [dx, dy, r] of [[-9, -8, 3.6], [8, -11, 2.8], [10, 7, 3.8], [-8, 9, 3], [1, -1, 3.2]] as const) {
    s.add(ellipse(c + dx, c + dy, r * 1.3, r, stone));
  }
}

/** The round bubble of a sign with its tail, centred over the bottom tip of a {@link SIGN_SIZE} picture. */
function bubble(s: Svg): { cx: number; cy: number; r: number } {
  const cx = s.width / 2;
  const r = SIGN_BUBBLE / 2;
  const cy = r + 5;
  const tip = s.height - 4;
  s.add(ellipse(cx, s.height - 3, 12, 3.2, { fill: COLORS.black, opacity: 0.18 }));
  s.add(path(`${d.m(cx - 13, cy + r - 8)}${d.l(cx, tip)}${d.l(cx + 13, cy + r - 8)}${d.z}`, { fill: COLORS.markerRim, stroke: OUTLINE(COLORS.markerRim), width: 1.2 }));
  s.add(circle(cx, cy, r, { fill: COLORS.markerRim, stroke: OUTLINE(COLORS.markerRim), width: 1.2 }), circle(cx, cy, r - 4.5, { fill: s.vertical(COLORS.white, COLORS.markerFill) }));
  s.add(path(`${d.m(cx - 9, cy + r - 7)}${d.l(cx, tip - 7)}${d.l(cx + 9, cy + r - 7)}${d.z}`, { fill: COLORS.markerFill }));
  return { cx, cy, r };
}

/** A friendly speech bubble with a crossed-out little road – not an alarm. */
export function drawPathSign(s: Svg): void {
  const { cx, cy } = bubble(s);
  const k = SIGN_BUBBLE / 60;
  s.add(path(`${d.m(cx - 5 * k, cy - 20 * k)}${d.l(cx + 5 * k, cy - 20 * k)}${d.l(cx + 19 * k, cy + 21 * k)}${d.l(cx - 19 * k, cy + 21 * k)}${d.z}`, { fill: COLORS.markerIcon, stroke: true, width: 1 }));
  for (const [y, w, h] of [[-12, 2, 5], [-2, 2.8, 6], [10, 3.6, 8]] as const) {
    s.add(rect(cx - (w * k) / 2, cy + y * k, w * k, h * k, 1, { fill: COLORS.markerFill }));
  }
  s.add(line([[cx - 20 * k, cy - 21 * k], [cx + 20 * k, cy + 21 * k]], COLORS.white, 11 * k), line([[cx - 20 * k, cy - 21 * k], [cx + 20 * k, cy + 21 * k]], COLORS.cancel, 7 * k));
}

/** A round sign with the picture of what a building needs (a tree, a rock, a good) and a "!" badge. */
export function drawNeedSign(s: Svg, id: string): void {
  const { cx, cy, r } = bubble(s);
  s.add(group([drawGoodIcon(s, id)], { transform: `translate(${String(cx - 1 - 20)} ${String(cy + 1 - 20)}) scale(${String(40 / 48)})` }));
  const bx = cx + r - 8;
  const by = cy - r + 8;
  s.add(circle(bx, by, 11.5, { fill: COLORS.white, stroke: OUTLINE(COLORS.markerMark), width: 1 }), circle(bx, by, 9.5, { fill: COLORS.markerMark }));
  s.add(rect(bx - 1.9, by - 6.5, 3.8, 8.5, 1.9, { fill: COLORS.white }), circle(bx, by + 5.2, 2.1, { fill: COLORS.white }));
}

/** Drawers by `look.shape`; the `invite` card and the path are drawn elsewhere (`figures.ts`, {@link drawPathTile}). */
export const BUILDING_DRAWERS: Readonly<Record<string, Draw>> = {
  mushroomHouse: drawMushroomHouse,
  gardenHouse: drawGardenHouse,
  flower: drawFlowers,
  bush: drawBush,
  fence: drawFence,
  bench: drawBench,
  lantern: drawLantern,
  fountain: drawFountain,
  flowerbed: drawFlowerbed,
  pond: drawPond,
  lumberjackHut: drawLumberjackHut,
  berryGarden: drawBerryGarden,
  quarry: drawQuarry,
  carpenterShop: drawCarpenterShop,
  bakery: drawBakery,
  market: drawMarket,
  islandTree: drawIslandTree,
  islandRock: drawIslandRock,
  islandBeach: drawIslandBeach,
  islandMeadow: drawIslandMeadow,
};
