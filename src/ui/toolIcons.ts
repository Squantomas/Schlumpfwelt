import type Phaser from 'phaser';
import type { ToolId } from './buildTool';
import { COLORS, HOUSE_PALETTES } from './style';

/**
 * Little pictures for the toolbar, drawn with Phaser graphics around (0, 0)
 * inside a box of `s × s` CSS px. Placeholders until the real graphics (M8).
 */
export function drawToolIcon(g: Phaser.GameObjects.Graphics, tool: Exclude<ToolId, 'view'>, s: number): void {
  g.clear();
  switch (tool) {
    case 'path':
      drawPath(g, s);
      break;
    case 'house':
      drawHouse(g, s);
      break;
    case 'deco':
      drawFlower(g, s);
      break;
    case 'move':
      drawArrows(g, s);
      break;
    case 'demolish':
      drawHammer(g, s);
      break;
  }
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
