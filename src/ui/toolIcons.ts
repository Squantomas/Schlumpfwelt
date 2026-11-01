import type Phaser from 'phaser';
import type { ShopCategory } from '../data/buildings';
import type { ToolbarToolId } from './buildTool';
import { COLORS, HOUSE_PALETTES } from './style';

/**
 * Little pictures for the toolbar, drawn with Phaser graphics around (0, 0)
 * inside a box of `s × s` CSS px. Placeholders until the real graphics (M8).
 */
export function drawToolIcon(g: Phaser.GameObjects.Graphics, tool: ToolbarToolId, s: number): void {
  g.clear();
  switch (tool) {
    case 'path':
      drawPath(g, s);
      break;
    case 'shop':
      drawStall(g, s);
      break;
    case 'move':
      drawArrows(g, s);
      break;
    case 'demolish':
      drawHammer(g, s);
      break;
  }
}

/** The icons of the shop tabs: a mushroom house, a flower, a workshop and a little island. */
export function drawCategoryIcon(g: Phaser.GameObjects.Graphics, category: ShopCategory, s: number): void {
  g.clear();
  switch (category) {
    case 'houses':
      drawHouse(g, s);
      break;
    case 'deco':
      drawFlower(g, s);
      break;
    case 'production':
      drawWorkshop(g, s);
      break;
    case 'island':
      drawIsland(g, s);
      break;
  }
}

/** The button "Umziehen" on a resident's card (M7): a mushroom house with an arrow pointing into it. */
export function drawMoveHomeIcon(g: Phaser.GameObjects.Graphics, s: number): void {
  g.clear();
  g.save();
  g.translateCanvas(s * 0.14, 0);
  drawHouse(g, s * 0.82);
  g.restore();
  const y = s * 0.2;
  const left = -s * 0.5;
  const tip = -s * 0.12;
  const head = s * 0.13;
  g.fillStyle(COLORS.white).fillRoundedRect(left - 2, y - s * 0.06 - 2, tip - left + 4, s * 0.12 + 4, s * 0.06);
  g.fillTriangle(tip + head * 0.9 + 2, y, tip - 2, y - head - 3, tip - 2, y + head + 3);
  g.fillStyle(COLORS.buttonIcon).fillRoundedRect(left, y - s * 0.06, tip - left, s * 0.12, s * 0.06);
  g.fillTriangle(tip + head * 0.9, y, tip, y - head, tip, y + head);
}

function drawPath(g: Phaser.GameObjects.Graphics, s: number): void {
  const tile = s * 0.3;
  const cells: readonly [number, number][] = [
    [0, 1],
    [1, 1],
    [2, 1],
    [2, 0],
  ];
  for (const [col, row] of cells) {
    const x = -s * 0.46 + col * tile * 1.04;
    const y = -s * 0.3 + row * tile * 1.04 + s * 0.08;
    g.fillStyle(COLORS.pathRim).fillRoundedRect(x, y, tile, tile, tile * 0.3);
    g.fillStyle(COLORS.pathFill).fillRoundedRect(x + 2, y + 2, tile - 4, tile - 4, tile * 0.25);
    g.fillStyle(COLORS.pathStone).fillEllipse(x + tile * 0.4, y + tile * 0.42, tile * 0.3, tile * 0.22);
  }
}

function drawHouse(g: Phaser.GameObjects.Graphics, s: number): void {
  g.fillStyle(COLORS.stem).fillRoundedRect(-s * 0.18, -s * 0.06, s * 0.36, s * 0.46, s * 0.1);
  g.fillStyle(COLORS.door).fillRoundedRect(-s * 0.07, s * 0.2, s * 0.14, s * 0.22, s * 0.06);
  g.fillStyle(HOUSE_PALETTES['red']?.capShade ?? COLORS.mushroomCap).fillEllipse(0, -s * 0.04, s * 0.92, s * 0.26);
  g.fillStyle(COLORS.mushroomCap).fillEllipse(0, -s * 0.16, s * 0.88, s * 0.62);
  g.fillStyle(COLORS.white);
  for (const [x, y, r] of [[-0.24, -0.2, 0.08], [0.06, -0.32, 0.09], [0.27, -0.14, 0.065], [-0.04, -0.14, 0.05]] as const) {
    g.fillCircle(x * s, y * s, r * s);
  }
}

function drawWorkshop(g: Phaser.GameObjects.Graphics, s: number): void {
  // Chimney, wooden walls, a big door and a roof with an overhang.
  g.fillStyle(COLORS.stoneDark).fillRoundedRect(s * 0.14, -s * 0.46, s * 0.14, s * 0.3, s * 0.03);
  g.fillStyle(COLORS.woodLight).fillRoundedRect(-s * 0.36, -s * 0.06, s * 0.72, s * 0.5, s * 0.05);
  g.fillStyle(COLORS.wood).fillRect(-s * 0.36, s * 0.08, s * 0.72, s * 0.04);
  g.fillStyle(COLORS.woodDark).fillRoundedRect(-s * 0.1, s * 0.16, s * 0.2, s * 0.28, s * 0.04);
  g.fillStyle(COLORS.roof).fillTriangle(-s * 0.48, -s * 0.04, 0, -s * 0.46, s * 0.48, -s * 0.04);
  g.fillStyle(COLORS.roofShade).fillTriangle(0, -s * 0.46, s * 0.48, -s * 0.04, s * 0.08, -s * 0.04);
}

function drawFlower(g: Phaser.GameObjects.Graphics, s: number): void {
  g.lineStyle(s * 0.07, COLORS.stalk, 1).lineBetween(0, s * 0.45, 0, -s * 0.04);
  g.fillStyle(COLORS.stalk).fillEllipse(s * 0.14, s * 0.26, s * 0.22, s * 0.1);
  g.fillStyle(COLORS.flower);
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2 - Math.PI / 2;
    g.fillCircle(Math.cos(angle) * s * 0.2, -s * 0.16 + Math.sin(angle) * s * 0.2, s * 0.15);
  }
  g.fillStyle(COLORS.flowerCenter).fillCircle(0, -s * 0.16, s * 0.12);
}

function drawArrows(g: Phaser.GameObjects.Graphics, s: number): void {
  const reach = s * 0.44;
  const head = s * 0.17;
  g.fillStyle(COLORS.buttonIcon);
  g.fillRoundedRect(-reach, -s * 0.04, reach * 2, s * 0.08, s * 0.04);
  g.fillRoundedRect(-s * 0.04, -reach, s * 0.08, reach * 2, s * 0.04);
  g.fillTriangle(-reach - head * 0.2, 0, -reach + head, -head, -reach + head, head);
  g.fillTriangle(reach + head * 0.2, 0, reach - head, -head, reach - head, head);
  g.fillTriangle(0, -reach - head * 0.2, -head, -reach + head, head, -reach + head);
  g.fillTriangle(0, reach + head * 0.2, -head, reach - head, head, reach - head);
}

function drawHammer(g: Phaser.GameObjects.Graphics, s: number): void {
  const angle = -0.7;
  const place = (points: readonly (readonly [number, number])[]): number[] => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return points.flatMap(([x, y]) => [(x * cos - y * sin) * s, (x * sin + y * cos) * s]);
  };
  const fill = (color: number, points: readonly (readonly [number, number])[]): void => {
    const flat = place(points);
    g.fillStyle(color).fillPoints(
      flat.reduce<Phaser.Types.Math.Vector2Like[]>((acc, value, index) => {
        if (index % 2 === 0) {
          acc.push({ x: value, y: flat[index + 1] ?? 0 });
        }
        return acc;
      }, []),
      true,
    );
  };
  fill(COLORS.wood, [[-0.055, -0.08], [0.055, -0.08], [0.055, 0.5], [-0.055, 0.5]]);
  fill(COLORS.woodDark, [[0.01, -0.08], [0.055, -0.08], [0.055, 0.5], [0.01, 0.5]]);
  fill(COLORS.iron, [[-0.27, -0.36], [0.27, -0.36], [0.27, -0.1], [-0.27, -0.1]]);
  fill(COLORS.ironLight, [[-0.27, -0.36], [0.27, -0.36], [0.27, -0.29], [-0.27, -0.29]]);
}

/** A market stall: striped awning over a wooden counter with a coin on it – "the shop". */
function drawStall(g: Phaser.GameObjects.Graphics, s: number): void {
  // Posts and counter.
  g.fillStyle(COLORS.woodDark).fillRect(-s * 0.36, -s * 0.12, s * 0.07, s * 0.54);
  g.fillStyle(COLORS.woodDark).fillRect(s * 0.29, -s * 0.12, s * 0.07, s * 0.54);
  g.fillStyle(COLORS.wood).fillRoundedRect(-s * 0.4, s * 0.16, s * 0.8, s * 0.3, s * 0.04);
  g.fillStyle(COLORS.woodLight).fillRoundedRect(-s * 0.4, s * 0.12, s * 0.8, s * 0.1, s * 0.03);
  // A coin on the counter.
  g.fillStyle(COLORS.coinRim).fillCircle(0, s * 0.04, s * 0.13);
  g.fillStyle(COLORS.coin).fillCircle(0, s * 0.04, s * 0.1);
  g.fillStyle(COLORS.coinShine).fillCircle(-s * 0.03, s * 0.01, s * 0.035);
  // Awning: five stripes, red and white, with a scalloped edge.
  const stripe = (s * 0.88) / 5;
  for (let i = 0; i < 5; i += 1) {
    const x = -s * 0.44 + i * stripe;
    g.fillStyle(i % 2 === 0 ? COLORS.awningRed : COLORS.awningWhite);
    g.fillTriangle(x, -s * 0.12, x + stripe, -s * 0.12, x + stripe * 0.9, -s * 0.44);
    g.fillTriangle(x, -s * 0.12, x + stripe * 0.1, -s * 0.44, x + stripe * 0.9, -s * 0.44);
    g.fillCircle(x + stripe / 2, -s * 0.12, stripe / 2);
  }
}

/** A tiny island: sand, a round tree and two waves. */
function drawIsland(g: Phaser.GameObjects.Graphics, s: number): void {
  g.fillStyle(COLORS.waterShallow).fillEllipse(0, s * 0.3, s * 0.96, s * 0.34);
  g.fillStyle(COLORS.sandShade).fillEllipse(0, s * 0.26, s * 0.72, s * 0.26);
  g.fillStyle(COLORS.sand).fillEllipse(0, s * 0.22, s * 0.68, s * 0.24);
  g.fillStyle(COLORS.treeTrunk).fillRoundedRect(-s * 0.04, -s * 0.12, s * 0.08, s * 0.34, s * 0.02);
  g.fillStyle(COLORS.crownDark).fillCircle(0, -s * 0.2, s * 0.24);
  g.fillStyle(COLORS.treeCrown).fillCircle(-s * 0.02, -s * 0.23, s * 0.21);
  g.fillStyle(COLORS.treeCrownLight).fillCircle(-s * 0.08, -s * 0.29, s * 0.09);
  g.lineStyle(s * 0.04, COLORS.white, 0.9);
  for (const [x, y] of [[-0.3, 0.42], [0.2, 0.44]] as const) {
    g.beginPath();
    g.moveTo((x - 0.1) * s, y * s);
    g.lineTo(x * s, (y - 0.04) * s);
    g.lineTo((x + 0.1) * s, y * s);
    g.strokePath();
  }
}

/** A golden padlock around (0, 0) inside a box of `s × s` CSS px: "locked". */
export function drawPadlock(g: Phaser.GameObjects.Graphics, s: number): void {
  g.clear();
  // Shackle.
  g.lineStyle(s * 0.14, COLORS.ironLight, 1);
  g.beginPath();
  g.arc(0, -s * 0.08, s * 0.24, Math.PI, 0, false);
  g.lineTo(s * 0.24, s * 0.06);
  g.moveTo(-s * 0.24, -s * 0.08);
  g.lineTo(-s * 0.24, s * 0.06);
  g.strokePath();
  // Body with a rim, a shine and the keyhole.
  g.fillStyle(COLORS.white).fillRoundedRect(-s * 0.36, -s * 0.04, s * 0.72, s * 0.5, s * 0.1);
  g.fillStyle(COLORS.coinRim).fillRoundedRect(-s * 0.33, -s * 0.01, s * 0.66, s * 0.44, s * 0.08);
  g.fillStyle(COLORS.coin).fillRoundedRect(-s * 0.33, -s * 0.01, s * 0.66, s * 0.3, s * 0.08);
  g.fillStyle(COLORS.coinShine).fillRoundedRect(-s * 0.27, s * 0.03, s * 0.2, s * 0.06, s * 0.03);
  g.fillStyle(COLORS.woodDark).fillCircle(0, s * 0.16, s * 0.07);
  g.fillRect(-s * 0.03, s * 0.16, s * 0.06, s * 0.14);
}

/** A yellow star with a white rim around (0, 0), `r` is the outer radius in CSS px: "new". */
export function drawStar(g: Phaser.GameObjects.Graphics, r: number): void {
  g.clear();
  const points = (radius: number): { x: number; y: number }[] =>
    Array.from({ length: 10 }, (_, i) => {
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const reach = i % 2 === 0 ? radius : radius * 0.48;
      return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach };
    });
  g.fillStyle(COLORS.white).fillPoints(points(r), true);
  g.fillStyle(COLORS.coin).fillPoints(points(r * 0.82), true);
  g.fillStyle(COLORS.coinShine).fillCircle(-r * 0.12, -r * 0.14, r * 0.2);
}

/**
 * The icons of the two menu buttons, in the colour of a button face: a tray with an arrow going down into it (save as
 * a file) or up out of it (load from a file).
 */
export function drawFileIcon(g: Phaser.GameObjects.Graphics, kind: 'save' | 'load', s: number): void {
  g.clear();
  const color = COLORS.buttonIcon;
  const stroke = Math.max(3, s * 0.1);
  g.lineStyle(stroke, color, 1);
  // The tray.
  g.beginPath();
  g.moveTo(-s * 0.38, s * 0.1);
  g.lineTo(-s * 0.38, s * 0.38);
  g.lineTo(s * 0.38, s * 0.38);
  g.lineTo(s * 0.38, s * 0.1);
  g.strokePath();
  // The arrow: down into the tray, or up out of it.
  const dir = kind === 'save' ? 1 : -1;
  const tip = s * 0.2 * dir + s * 0.08;
  const tail = -s * 0.4 * dir + s * 0.08;
  g.beginPath();
  g.moveTo(0, tail);
  g.lineTo(0, tip);
  g.strokePath();
  g.beginPath();
  g.moveTo(-s * 0.2, tip - s * 0.2 * dir);
  g.lineTo(0, tip);
  g.lineTo(s * 0.2, tip - s * 0.2 * dir);
  g.strokePath();
}
