import { COLORS, HOUSE_PALETTES } from '../ui/style';
import type { Svg} from './svg';
import { circle, cluster, d, darker, ellipse, group, lighter, line, outlineOf, path, polygon, rect } from './svg';

/**
 * Small pictures (M9): the goods and coins (store bar, costs, "+3", what a resident carries), what a building needs
 * nearby (a tree, a rock), the pictures of the toolbar, the shop tabs and the menu, and the marks of the interface
 * (lock, star, the pointing hand, moon and stars of the night). Goods are drawn in a 48 × 48 box and can be put into
 * other pictures (the signs over buildings); the interface pictures in a 64 × 64 box.
 */

export const GOOD_BOX = 48;
export const ICON_BOX = 64;

type Icon = (s: Svg) => string;

const groundShadow = (cx: number, rx: number): string => ellipse(cx, 42, rx, 4, { fill: COLORS.black, opacity: 0.16 });

function coin(s: Svg, x: number, y: number, r: number): string {
  return [
    circle(x, y, r, { fill: s.ball(COLORS.coinShine, COLORS.coin), stroke: outlineOf(COLORS.coinRim), width: 1.4 }),
    circle(x, y, r * 0.66, { stroke: COLORS.coinRim, width: 1.6, under: false }),
    ellipse(x - r * 0.35, y - r * 0.4, r * 0.24, r * 0.14, { fill: COLORS.white, opacity: 0.85 }, -40),
  ].join('');
}

const GOODS: Readonly<Record<string, Icon>> = {
  coins: (s) => [groundShadow(25, 17), coin(s, 19, 20, 14), coin(s, 28, 28, 14)].join(''),
  wood: (s) => {
    const log = (x: number, y: number): string =>
      [
        rect(x, y - 8, 26, 16, 6, { fill: s.vertical(COLORS.woodLight, COLORS.wood), stroke: outlineOf(COLORS.wood), width: 1.4 }),
        ellipse(x + 2, y, 7, 8.2, { fill: lighter(COLORS.woodLight, 0.25), stroke: outlineOf(COLORS.wood), width: 1.2 }),
        ellipse(x + 2, y, 4, 5, { stroke: COLORS.wood, width: 1, under: false }),
        circle(x + 2, y, 1.3, { fill: COLORS.woodDark }),
      ].join('');
    return [groundShadow(24, 20), log(6, 34), log(16, 34), log(11, 20)].join('');
  },
  stone: (s) =>
    [
      groundShadow(24, 19),
      polygon(
        [
          [6, 37],
          [8, 21],
          [19, 11],
          [34, 13],
          [43, 26],
          [41, 37],
        ],
        { fill: s.ball(COLORS.rockLight, COLORS.rockShade), stroke: outlineOf(COLORS.rockShade), width: 1.6 },
      ),
      ellipse(19, 20, 7, 3.4, { fill: COLORS.white, opacity: 0.55 }, -28),
      line([[28, 20], [26, 28], [30, 33]], COLORS.rockCrack, 1.5, 0.7),
    ].join(''),
  berries: (s) => {
    const parts = [groundShadow(24, 15), ellipse(29, 10, 9, 4.4, { fill: COLORS.stalk, stroke: true, width: 1 }, -22), line([[24, 20], [24, 11]], COLORS.stalk, 2.2)];
    for (const [x, y] of [[16, 29], [32, 29], [24, 22], [24, 35], [15, 38], [33, 38]] as const) {
      parts.push(circle(x, y, 7.6, { fill: s.ball(lighter(COLORS.berry, 0.25), COLORS.berryDark), stroke: outlineOf(COLORS.berryDark), width: 1.1 }), circle(x - 2.6, y - 3, 1.8, { fill: COLORS.white, opacity: 0.8 }));
    }
    return parts.join('');
  },
  furniture: (s) =>
    [
      groundShadow(24, 16),
      rect(11, 5, 5, 34, 2.5, { fill: COLORS.woodDark, stroke: true, width: 1 }),
      rect(31, 22, 5, 17, 2.5, { fill: COLORS.woodDark, stroke: true, width: 1 }),
      rect(11, 8, 20, 5, 2.5, { fill: COLORS.wood, stroke: true, width: 1 }),
      rect(11, 17, 20, 5, 2.5, { fill: COLORS.wood, stroke: true, width: 1 }),
      rect(9, 25, 29, 7, 3, { fill: s.vertical(lighter(COLORS.woodLight, 0.2), COLORS.wood), stroke: outlineOf(COLORS.wood), width: 1.2 }),
      rect(12, 31, 4.4, 9, 2, { fill: COLORS.woodDark, stroke: true, width: 1 }),
      rect(31, 31, 4.4, 9, 2, { fill: COLORS.woodDark, stroke: true, width: 1 }),
    ].join(''),
  cake: (s) =>
    [
      groundShadow(24, 19),
      ellipse(24, 37, 19, 6, { fill: COLORS.white, stroke: outlineOf(COLORS.toolFaceShade), width: 1.2 }),
      rect(8, 24, 32, 13, 4, { fill: s.vertical(COLORS.cakeSponge, COLORS.breadShade), stroke: outlineOf(COLORS.breadShade), width: 1.3 }),
      rect(13, 14, 22, 12, 4, { fill: s.vertical(COLORS.cakeSponge, COLORS.breadShade), stroke: outlineOf(COLORS.breadShade), width: 1.3 }),
      path(`${d.m(8, 26)}${d.q(24, 20, 40, 26)}${d.l(40, 24)}${d.q(24, 18, 8, 24)}${d.z}`, { fill: COLORS.cakeIcing }),
      ellipse(24, 14.4, 11.4, 3.4, { fill: COLORS.cakeIcing }),
      ...[14, 20, 27, 33].map((x) => circle(x, 26.5, 2.2, { fill: COLORS.cakeIcing })),
      circle(24, 9.6, 4.6, { fill: COLORS.berry, stroke: true, width: 1 }),
      circle(22.4, 8, 1.2, { fill: COLORS.white, opacity: 0.85 }),
    ].join(''),
  tree: (s) =>
    [
      groundShadow(24, 14),
      rect(20.4, 27, 7.2, 15, 2, { fill: s.vertical(COLORS.treeTrunk, COLORS.trunkDark), stroke: outlineOf(COLORS.treeTrunk), width: 1.2 }),
      cluster(
        [
          [24, 19, 14],
          [15, 24, 7],
          [33, 24, 7],
        ],
        s.across(10, 4, 38, 32, COLORS.treeCrownLight, darker(COLORS.treeCrown, 0.15)),
        outlineOf(COLORS.treeCrown),
        1.6,
      ),
      ellipse(19, 13, 5, 3.2, { fill: lighter(COLORS.treeCrownLight, 0.3), opacity: 0.75 }, -25),
    ].join(''),
};

GOODS satisfies Record<string, Icon>;

/** The picture of a good, the coins, or what a building needs nearby (`tree`, `rock`), in a 48 × 48 box. */
export function drawGoodIcon(s: Svg, id: string): string {
  const icon = id === 'rock' ? GOODS['stone'] : GOODS[id];
  return icon ? icon(s) : '';
}

/** Ids that have a picture: the goods and coins come from `goods.json`, `tree` and `rock` are needed nearby. */
export const NEARBY_IDS = ['tree', 'rock'] as const;

// --- Interface pictures, 64 × 64 ---

function mushroom(s: Svg, cx: number, cy: number, k: number): string {
  const palette = HOUSE_PALETTES['red'] ?? { cap: COLORS.mushroomCap, capShade: COLORS.roofShade, dot: COLORS.white };
  return [
    rect(cx - 11 * k, cy - 2 * k, 22 * k, 26 * k, 7 * k, { fill: s.vertical(COLORS.stem, COLORS.stemShade), stroke: outlineOf(COLORS.stemShade), width: 1.4 }),
    rect(cx - 4.5 * k, cy + 10 * k, 9 * k, 14 * k, 4 * k, { fill: COLORS.door, stroke: true, width: 1.1 }),
    path(`${d.m(cx - 28 * k, cy + 2 * k)}${d.c(cx - 28 * k, cy - 24 * k, cx + 28 * k, cy - 24 * k, cx + 28 * k, cy + 2 * k)}${d.q(cx, cy + 9 * k, cx - 28 * k, cy + 2 * k)}${d.z}`, {
      fill: s.ball(lighter(palette.cap, 0.25), palette.capShade),
      stroke: outlineOf(palette.capShade),
      width: 1.6,
    }),
    ...([[-14, -6, 4.6], [3, -13, 5], [16, -3, 3.6], [-1, -3, 2.8]] as const).map(([x, y, r]) => circle(cx + x * k, cy + y * k, r * k, { fill: palette.dot })),
  ].join('');
}

const UI: Readonly<Record<string, (s: Svg) => void>> = {
  'tool-path': (s) => {
    const tile = 18;
    for (const [col, row] of [[0, 1], [1, 1], [2, 1], [2, 0]] as const) {
      const x = 4 + col * 19;
      const y = 14 + row * 19;
      s.add(rect(x, y, tile, tile, 6, { fill: COLORS.pathFill, stroke: outlineOf(COLORS.pathRim), width: 1.4 }), ellipse(x + 7, y + 7, 4, 3, { fill: COLORS.pathStone, stroke: COLORS.pathStoneDark, width: 0.6 }), ellipse(x + 12, y + 12, 2.6, 2, { fill: COLORS.pathStone }));
    }
  },
  'tool-shop': (s) => {
    s.add(rect(7, 26, 5, 32, 2.5, { fill: COLORS.woodDark, stroke: true, width: 1.2 }), rect(52, 26, 5, 32, 2.5, { fill: COLORS.woodDark, stroke: true, width: 1.2 }));
    s.add(rect(5, 40, 54, 18, 4, { fill: s.vertical(COLORS.woodLight, COLORS.wood), stroke: outlineOf(COLORS.wood), width: 1.6 }));
    s.add(circle(32, 36, 8, { fill: s.ball(COLORS.coinShine, COLORS.coin), stroke: outlineOf(COLORS.coinRim), width: 1.3 }), circle(32, 36, 4.6, { stroke: COLORS.coinRim, width: 1.2, under: false }));
    const stripe = 54 / 5;
    for (let i = 0; i < 5; i += 1) {
      const x = 5 + i * stripe;
      s.add(path(`${d.m(x + 2, 8)}${d.l(x + stripe - 2 + 2, 8)}${d.l(x + stripe, 26)}${d.a(stripe / 2, stripe / 2, false, true, x, 26)}${d.z}`, { fill: i % 2 === 0 ? COLORS.awningRed : COLORS.awningWhite, stroke: outlineOf(COLORS.awningRed), width: 1.1 }));
    }
    s.add(rect(4, 5, 56, 6, 3, { fill: COLORS.awningRed, stroke: true, width: 1.2 }));
  },
  'tool-move': (s) => {
    const color = COLORS.buttonIcon;
    s.add(line([[8, 32], [56, 32]], color, 6), line([[32, 8], [32, 56]], color, 6));
    for (const [x, y, dx, dy] of [[6, 32, 1, 0], [58, 32, -1, 0], [32, 6, 0, 1], [32, 58, 0, -1]] as const) {
      s.add(polygon([[x, y], [x + dx * 13 - dy * 9, y + dy * 13 - dx * 9], [x + dx * 13 + dy * 9, y + dy * 13 + dx * 9]], { fill: color, stroke: color, width: 1.6 }));
    }
  },
  'tool-demolish': (s) => {
    s.add(
      group(
        [
          rect(-3.5, -6, 7, 36, 3.5, { fill: s.vertical(COLORS.woodLight, COLORS.wood), stroke: outlineOf(COLORS.wood), width: 1.4 }),
          rect(-17, -22, 34, 17, 5, { fill: s.vertical(COLORS.ironLight, COLORS.iron), stroke: outlineOf(COLORS.iron), width: 1.6 }),
          rect(-14, -20, 18, 4, 2, { fill: COLORS.white, opacity: 0.4 }),
        ],
        { transform: 'translate(32 32) rotate(-40)' },
      ),
    );
  },
  'tab-houses': (s) => {
    s.add(mushroom(s, 32, 32, 1));
  },
  'tab-deco': (s) => {
    s.add(line([[32, 60], [32, 30]], COLORS.stalk, 4), ellipse(41, 46, 8, 4, { fill: COLORS.stalk, stroke: true, width: 1 }, -25));
    for (let i = 0; i < 5; i += 1) {
      const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
      s.add(circle(32 + Math.cos(angle) * 12, 22 + Math.sin(angle) * 12, 9, { fill: COLORS.flower, stroke: darker(COLORS.flower, 0.35), width: 1.2 }));
    }
    s.add(circle(32, 22, 7.5, { fill: COLORS.flowerCenter, stroke: true, width: 1 }), circle(29, 19, 2.2, { fill: COLORS.white, opacity: 0.8 }));
  },
  'tab-production': (s) => {
    s.add(rect(40, 6, 9, 18, 2, { fill: COLORS.stoneDark, stroke: true, width: 1.2 }));
    s.add(rect(9, 30, 46, 30, 4, { fill: s.vertical(COLORS.woodLight, COLORS.wood), stroke: outlineOf(COLORS.wood), width: 1.4 }), line([[10, 40], [54, 40]], COLORS.wood, 1.4, 0.8), line([[10, 50], [54, 50]], COLORS.wood, 1.4, 0.8));
    s.add(rect(26, 42, 12, 18, 3, { fill: COLORS.woodDark, stroke: true, width: 1.1 }));
    s.add(path(`${d.m(2, 32)}${d.l(32, 6)}${d.l(62, 32)}${d.z}`, { fill: s.across(2, 6, 62, 32, lighter(COLORS.roof, 0.15), COLORS.roofShade), stroke: outlineOf(COLORS.roofShade), width: 1.6 }));
  },
  'tab-island': (s) => {
    s.add(ellipse(32, 51, 30, 11, { fill: COLORS.waterShallow, stroke: outlineOf(COLORS.waterDeep), width: 1 }), ellipse(32, 48, 22, 8, { fill: s.vertical(COLORS.sand, COLORS.sandShade), stroke: outlineOf(COLORS.sandShade), width: 1.2 }));
    s.add(rect(29.5, 24, 5, 24, 2, { fill: COLORS.treeTrunk, stroke: true, width: 1 }));
    s.add(cluster([[32, 20, 13], [23, 26, 7], [41, 26, 7]], s.across(18, 6, 46, 32, COLORS.treeCrownLight, darker(COLORS.treeCrown, 0.15)), outlineOf(COLORS.treeCrown), 1.4));
    s.add(line([[8, 58], [13, 55], [18, 58]], COLORS.white, 2), line([[46, 59], [51, 56], [56, 59]], COLORS.white, 2));
  },
  'move-home': (s) => {
    s.add(group([mushroom(s, 0, 0, 0.85)], { transform: 'translate(40 30)' }));
    s.add(line([[4, 46], [24, 46]], COLORS.white, 9), polygon([[33, 46], [21, 36], [21, 56]], { fill: COLORS.white, stroke: COLORS.white, width: 2.5 }));
    s.add(line([[4, 46], [24, 46]], COLORS.buttonIcon, 5), polygon([[31, 46], [22, 39], [22, 53]], { fill: COLORS.buttonIcon, stroke: COLORS.buttonIcon, width: 1 }));
  },
  lock: (s) => {
    s.add(path(`${d.m(17, 30)}${d.l(17, 22)}${d.a(15, 15, false, true, 47, 22)}${d.l(47, 30)}`, { stroke: outlineOf(COLORS.ironLight), width: 10, under: false }), path(`${d.m(17, 30)}${d.l(17, 22)}${d.a(15, 15, false, true, 47, 22)}${d.l(47, 30)}`, { stroke: COLORS.ironLight, width: 6, under: false }));
    s.add(rect(9, 28, 46, 31, 7, { fill: s.vertical(COLORS.coinShine, COLORS.coin), stroke: outlineOf(COLORS.coinRim), width: 1.8 }));
    s.add(rect(13, 32, 13, 4, 2, { fill: COLORS.white, opacity: 0.7 }), circle(32, 41, 4.4, { fill: COLORS.woodDark }), rect(30, 41, 4, 10, 2, { fill: COLORS.woodDark }));
  },
  star: (s) => {
    const points = (radius: number): [number, number][] =>
      Array.from({ length: 10 }, (_, i) => {
        const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const reach = i % 2 === 0 ? radius : radius * 0.5;
        return [32 + Math.cos(angle) * reach, 33 + Math.sin(angle) * reach];
      });
    s.add(polygon(points(29), { fill: COLORS.white, stroke: COLORS.white, width: 3 }), polygon(points(25), { fill: s.ball(COLORS.coinShine, COLORS.coin), stroke: outlineOf(COLORS.coinRim), width: 1.2 }));
    s.add(ellipse(27, 25, 5, 3.4, { fill: COLORS.white, opacity: 0.8 }, -30));
  },
  'file-save': (s) => fileIcon(s, 1),
  'file-load': (s) => fileIcon(s, -1),
  'sound-on': (s) => speaker(s, true),
  'sound-off': (s) => speaker(s, false),
  music: (s) => {
    const color = COLORS.buttonIcon;
    s.add(line([[24, 46], [24, 14], [50, 8], [50, 40]], color, 5));
    s.add(ellipse(18, 47, 8, 6.5, { fill: color }, -20), ellipse(44, 41, 8, 6.5, { fill: color }, -20));
  },
  moon: (s) => {
    const c = s.width / 2;
    const r = c * 0.66;
    s.add(circle(c, c, c - 1, { fill: s.glow(COLORS.moon, 0.35) }));
    s.add(circle(c, c, r, { fill: s.ball(lighter(COLORS.moon, 0.4), COLORS.moonShade), stroke: darker(COLORS.moonShade, 0.15), width: 0.8 }));
    for (const [dx, dy, k] of [[-0.3, -0.2, 0.2], [0.35, 0.1, 0.14], [-0.05, 0.45, 0.1]] as const) {
      s.add(circle(c + dx * r, c + dy * r, k * r, { fill: COLORS.moonShade, opacity: 0.6 }));
    }
    // A sleepy friendly face.
    s.add(path(`${d.m(c - r * 0.42, c - r * 0.02)}${d.q(c - r * 0.3, c + r * 0.1, c - r * 0.16, c - r * 0.02)}`, { stroke: darker(COLORS.moonShade, 0.45), width: r * 0.05, under: false }));
    s.add(path(`${d.m(c + r * 0.12, c - r * 0.02)}${d.q(c + r * 0.26, c + r * 0.1, c + r * 0.4, c - r * 0.02)}`, { stroke: darker(COLORS.moonShade, 0.45), width: r * 0.05, under: false }));
    s.add(path(`${d.m(c - r * 0.16, c + r * 0.28)}${d.q(c, c + r * 0.42, c + r * 0.16, c + r * 0.28)}`, { stroke: darker(COLORS.moonShade, 0.45), width: r * 0.05, under: false }));
  },
  'night-star': (s) => {
    const c = s.width / 2;
    s.add(circle(c, c, c - 1, { fill: s.glow(COLORS.star, 0.45) }));
    const points = Array.from({ length: 8 }, (_, i) => {
      const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const reach = i % 2 === 0 ? c * 0.7 : c * 0.22;
      return [c + Math.cos(angle) * reach, c + Math.sin(angle) * reach] as const;
    });
    s.add(polygon(points, { fill: COLORS.star }));
  },
};

function fileIcon(s: Svg, dir: 1 | -1): void {
  const color = COLORS.buttonIcon;
  s.add(line([[8, 38], [8, 56], [56, 56], [56, 38]], color, 6));
  const tip = dir === 1 ? 44 : 10;
  const tail = dir === 1 ? 8 : 42;
  s.add(line([[32, tail], [32, tip]], color, 6), line([[19, tip - 13 * dir], [32, tip], [45, tip - 13 * dir]], color, 6));
}

function speaker(s: Svg, on: boolean): void {
  const color = COLORS.buttonIcon;
  s.add(path(`${d.m(8, 24)}${d.l(20, 24)}${d.l(34, 11)}${d.l(34, 53)}${d.l(20, 40)}${d.l(8, 40)}${d.z}`, { fill: color, stroke: color, width: 1.6 }));
  if (on) {
    s.add(path(`${d.m(42, 23)}${d.q(48, 32, 42, 41)}`, { stroke: color, width: 4.5, under: false }), path(`${d.m(48, 15)}${d.q(60, 32, 48, 49)}`, { stroke: color, width: 4.5, under: false }));
  } else {
    s.add(line([[42, 22], [58, 42]], COLORS.cancel, 6), line([[58, 22], [42, 42]], COLORS.cancel, 6));
  }
}

/** The interface pictures by name (`ui-<name>` is their key). */
export const UI_ICONS: Readonly<Record<string, (s: Svg) => void>> = UI;

/** The pointing hand of the guided start: white with a dark rim, the index finger down; the fingertip at {@link HAND_TIP}. */
export const HAND_SIZE = { width: 52, height: 76 } as const;
export const HAND_TIP = { x: 19, y: 74 } as const;

export function drawHand(s: Svg): void {
  // Drawn around (0, 0) = the fingertip, then moved into the picture.
  const parts = (grow: number, fill: number | string): string =>
    [
      rect(-7 - grow, -40 - grow, 14 + 2 * grow, 42 + 2 * grow, 7 + grow, { fill }),
      rect(-9 - grow, -66 - grow, 34 + 2 * grow, 34 + 2 * grow, 11 + grow, { fill }),
      rect(5 - grow, -40 - grow, 10 + 2 * grow, 14 + 2 * grow, 5 + grow, { fill }),
      rect(14 - grow, -43 - grow, 10 + 2 * grow, 15 + 2 * grow, 5 + grow, { fill }),
      rect(-19 - grow, -58 - grow, 14 + 2 * grow, 22 + 2 * grow, 7 + grow, { fill }),
    ].join('');
  s.add(
    group([parts(2.6, COLORS.handRim), parts(0, s.vertical(COLORS.handFill, lighter(COLORS.handRim, 0.82))), rect(-4, -10, 8, 7, 3, { fill: COLORS.handGlow }), line([[6, -30], [6, -27]], lighter(COLORS.handRim, 0.5), 1.2), line([[16, -32], [16, -29]], lighter(COLORS.handRim, 0.5), 1.2)], {
      transform: `translate(${String(HAND_TIP.x)} ${String(HAND_TIP.y - 2)})`,
    }),
  );
}
