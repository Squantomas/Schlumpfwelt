import { hash2 } from '../../sim/random';
import { terrainAt, type Terrain, type WorldView } from '../../sim/world';
import { COLORS, TILE_SIZE, cssColor } from '../../ui/style';

/**
 * Paints the whole ground (sea, beach, meadow) once onto a canvas. The scene
 * turns that into a single texture, so the 2,300 tiles cost one image per
 * frame instead of 2,300 game objects. Trees and rocks are not part of it –
 * they are sprites that are sorted by their y position.
 *
 * Placeholder look until the real graphics come in M8: flat, friendly colours,
 * a darker lip below every raised edge, rounded outer corners and a bit of
 * scattered detail (flowers, tufts, pebbles) that depends only on seed and
 * tile position.
 */

/** Height of the darker lip below beach and meadow edges, in world px. */
const LIP = 5;
/** Radius of rounded outer corners, in world px. */
const CORNER = 22;
/** Margin that keeps decoration away from the (rounded) tile edges. */
const DECO_MARGIN = 14;

/** Raised level of a terrain: sea 0, beach 1, meadow (also forest and rock floor) 2. */
function levelOf(terrain: Terrain): number {
  switch (terrain) {
    case 'water':
      return 0;
    case 'sand':
      return 1;
    case 'grass':
    case 'forest':
    case 'rock':
      return 2;
  }
}

export function groundSize(world: WorldView): { width: number; height: number } {
  return { width: world.width * TILE_SIZE, height: world.height * TILE_SIZE };
}

export function paintGround(ctx: CanvasRenderingContext2D, world: WorldView, seed: number): void {
  const level = (x: number, y: number): number => levelOf(terrainAt(world, x, y));
  const { width, height } = groundSize(world);

  ctx.fillStyle = cssColor(COLORS.waterDeep);
  ctx.fillRect(0, 0, width, height);

  paintSeaHalos(ctx, world, level);

  paintFoam(ctx, world, level);
  // Beach: lip first, then the sand on top; then the same for the meadow.
  paintTiles(ctx, world, level, 1, LIP + 1, () => COLORS.sandShade);
  paintTiles(ctx, world, level, 1, 0, () => COLORS.sand);
  paintTiles(ctx, world, level, 2, LIP, () => COLORS.grassShade);
  paintTiles(ctx, world, level, 2, 0, () => COLORS.grass);

  paintDetails(ctx, world, seed);
}

/** Lighter water around the land: three soft steps from deep to shallow. */
function paintSeaHalos(ctx: CanvasRenderingContext2D, world: WorldView, level: (x: number, y: number) => number): void {
  const halos: readonly [number, number][] = [
    [TILE_SIZE * 1.3, COLORS.waterMid],
    [TILE_SIZE * 0.55, COLORS.waterShallow],
  ];
  for (const [grow, color] of halos) {
    ctx.fillStyle = cssColor(color);
    forEachTile(world, (x, y) => {
      if (level(x, y) >= 1) {
        roundedRect(ctx, x * TILE_SIZE - grow, y * TILE_SIZE - grow, TILE_SIZE + 2 * grow, TILE_SIZE + 2 * grow, grow + CORNER);
        ctx.fill();
      }
    });
  }
}

/** White foam line along the coast, just outside the beach. */
function paintFoam(ctx: CanvasRenderingContext2D, world: WorldView, level: (x: number, y: number) => number): void {
  ctx.fillStyle = cssColor(COLORS.foam);
  ctx.globalAlpha = 0.75;
  const grow = 5;
  forEachTile(world, (x, y) => {
    if (level(x, y) >= 1) {
      roundedRect(ctx, x * TILE_SIZE - grow, y * TILE_SIZE - grow + LIP, TILE_SIZE + 2 * grow, TILE_SIZE + 2 * grow, CORNER + grow);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;
}

/**
 * Fills every tile of at least `minLevel`, shifted down by `offset`, with
 * rounded outer corners (where both neighbours on that side are lower).
 * `colorOf` gets the terrain of the tile.
 */
function paintTiles(
  ctx: CanvasRenderingContext2D,
  world: WorldView,
  level: (x: number, y: number) => number,
  minLevel: number,
  offset: number,
  colorOf: (terrain: Terrain) => number,
): void {
  const low = (x: number, y: number): boolean => level(x, y) < minLevel;
  forEachTile(world, (x, y) => {
    if (low(x, y)) {
      return;
    }
    ctx.fillStyle = cssColor(colorOf(terrainAt(world, x, y)));
    const tl = low(x - 1, y) && low(x, y - 1) ? CORNER : 0;
    const tr = low(x + 1, y) && low(x, y - 1) ? CORNER : 0;
    const br = low(x + 1, y) && low(x, y + 1) ? CORNER : 0;
    const bl = low(x - 1, y) && low(x, y + 1) ? CORNER : 0;
    cornerRect(ctx, x * TILE_SIZE, y * TILE_SIZE + offset, TILE_SIZE, TILE_SIZE, tl, tr, br, bl);
    ctx.fill();
  });
}

/** Flowers and tufts on the meadow, pebbles on rock floor, specks on sand. */
function paintDetails(ctx: CanvasRenderingContext2D, world: WorldView, seed: number): void {
  const flowerColors = ['#ff86bd', '#ffffff', '#ffe066', '#ffb3d9'] as const;
  forEachTile(world, (x, y) => {
    const terrain = terrainAt(world, x, y);
    const r = (n: number): number => hash2(seed + n * 101, x, y);
    const px = x * TILE_SIZE;
    const py = y * TILE_SIZE;
    const spot = (a: number, b: number): [number, number] => [
      px + DECO_MARGIN + r(a) * (TILE_SIZE - 2 * DECO_MARGIN),
      py + DECO_MARGIN + r(b) * (TILE_SIZE - 2 * DECO_MARGIN),
    ];

    switch (terrain) {
      case 'grass': {
        // Soft light and dark patches so the meadow does not look like a grid.
        if (r(1) < 0.35) {
          ctx.fillStyle = r(2) < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(40,110,30,0.07)';
          const [cx, cy] = spot(3, 4);
          ctx.beginPath();
          ctx.ellipse(cx, cy, 16 + r(5) * 8, 10 + r(6) * 6, r(7) * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        if (r(8) < 0.45) {
          const [tx, ty] = spot(9, 10);
          tuft(ctx, tx, ty);
        }
        if (r(11) < 0.11) {
          const [fx, fy] = spot(12, 13);
          flower(ctx, fx, fy, flowerColors[Math.floor(r(14) * flowerColors.length)] ?? '#ffffff');
        }
        break;
      }
      case 'forest': {
        if (r(15) < 0.5) {
          const [lx, ly] = spot(16, 17);
          ctx.fillStyle = 'rgba(40,100,30,0.18)';
          ctx.beginPath();
          ctx.ellipse(lx, ly, 8, 5, r(18) * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'rock': {
        ctx.fillStyle = 'rgba(138,144,160,0.55)';
        for (let i = 0; i < 3; i += 1) {
          const [sx, sy] = spot(20 + i * 2, 21 + i * 2);
          ctx.beginPath();
          ctx.ellipse(sx, sy, 3 + r(30 + i) * 3, 2 + r(40 + i) * 2, r(50 + i) * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'sand': {
        ctx.fillStyle = 'rgba(190,150,70,0.35)';
        for (let i = 0; i < 3; i += 1) {
          if (r(60 + i) < 0.6) {
            const [sx, sy] = spot(70 + i * 2, 71 + i * 2);
            ctx.beginPath();
            ctx.arc(sx, sy, 1.6 + r(80 + i) * 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (r(90) < 0.05) {
          const [sx, sy] = spot(91, 92);
          ctx.fillStyle = '#fff6e4';
          ctx.beginPath();
          ctx.ellipse(sx, sy, 5, 3.5, r(93) * 3, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'water':
        break;
    }
  });
}

function tuft(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = cssColor(COLORS.grassShade);
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 5, y);
  ctx.lineTo(x - 7, y - 7);
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 9);
  ctx.moveTo(x + 5, y);
  ctx.lineTo(x + 7, y - 7);
  ctx.stroke();
}

function flower(ctx: CanvasRenderingContext2D, x: number, y: number, petals: string): void {
  ctx.fillStyle = petals;
  for (let i = 0; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(x + Math.cos(angle) * 4, y + Math.sin(angle) * 4, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = cssColor(COLORS.flowerCenter);
  ctx.beginPath();
  ctx.arc(x, y, 2.6, 0, Math.PI * 2);
  ctx.fill();
}

function forEachTile(world: WorldView, visit: (x: number, y: number) => void): void {
  for (let y = 0; y < world.height; y += 1) {
    for (let x = 0; x < world.width; x += 1) {
      visit(x, y);
    }
  }
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number): void {
  cornerRect(ctx, x, y, w, h, radius, radius, radius, radius);
}

/** Rectangle path with an individual radius per corner (top left, top right, bottom right, bottom left). */
function cornerRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  tl: number,
  tr: number,
  br: number,
  bl: number,
): void {
  const limit = Math.min(w, h) / 2;
  const [a, b, c, d] = [tl, tr, br, bl].map((r) => Math.min(r, limit)) as [number, number, number, number];
  ctx.beginPath();
  ctx.moveTo(x + a, y);
  ctx.lineTo(x + w - b, y);
  ctx.arcTo(x + w, y, x + w, y + b, b);
  ctx.lineTo(x + w, y + h - c);
  ctx.arcTo(x + w, y + h, x + w - c, y + h, c);
  ctx.lineTo(x + d, y + h);
  ctx.arcTo(x, y + h, x, y + h - d, d);
  ctx.lineTo(x, y + a);
  ctx.arcTo(x, y, x + a, y, a);
  ctx.closePath();
}
