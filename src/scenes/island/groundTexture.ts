import { hash2 } from '../../sim/random';
import { terrainAt, type Terrain, type WorldView } from '../../sim/world';
import { COLORS, FLOWER_PETALS, TILE_SIZE, cssColor, cssRgba } from '../../ui/style';

/**
 * Paints the whole ground (sea, beach, meadow, forest floor, rocky ground)
 * once onto a canvas. The scene turns that into a single texture, so the 2,300
 * tiles cost one image per frame instead of 2,300 game objects. Trees and
 * rocks are not part of it – they are sprites that are sorted by their y
 * position.
 *
 * Placeholder look until the real graphics come in M8: flat, friendly colours,
 * a darker lip below every raised edge, rounded outer corners and a bit of
 * scattered detail (flowers, tufts, moss, pebbles) that depends only on seed
 * and tile position. Every one of the five terrains has its own ground colour.
 */

/** Height of the darker lip below beach and meadow edges, in world px. */
const LIP = 5;
/** Radius of rounded outer corners, in world px. */
const CORNER = 22;
/** Margin that keeps decoration away from the (rounded) tile edges. */
const DECO_MARGIN = 14;

/**
 * Longest side the ground texture may have. 4096 px is the smallest maximum
 * texture size that tablets in use report (WebGL `MAX_TEXTURE_SIZE`); a bigger
 * map has to be painted in chunks.
 */
export const MAX_GROUND_TEXTURE_SIZE = 4096;

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

/** A rectangle of tiles, both ends included. */
export interface TileRange {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** The sea halos around land, widest first: how far each reaches beyond the edge of a land tile (px) and its colour. */
const HALOS: readonly (readonly [number, number])[] = [
  [TILE_SIZE * 1.3, COLORS.waterMid],
  [TILE_SIZE * 0.55, COLORS.waterShallow],
];
/** The white foam line is this much wider than a land tile (px), and shifted down by {@link LIP}. */
const FOAM_GROW = 5;
/** The biggest radius of a soft patch or blob of detail (px): the grass patches are `16 + 8` wide. */
const MAX_DETAIL_RADIUS = 24;

/** How far (px) the biggest detail reaches beyond its own tile (it sits `DECO_MARGIN` inside it). */
export const DETAIL_REACH_PX = MAX_DETAIL_RADIUS - DECO_MARGIN;

/**
 * How far (px) the painting of one tile reaches beyond the tile itself: the widest sea halo, the foam, the lip below
 * the edges and the biggest detail. `tests` check that it stays within {@link REPAINT_REACH} tiles, and that the
 * details the code really paints stay within {@link DETAIL_REACH_PX}.
 */
export const PAINT_REACH_PX = Math.max(...HALOS.map(([grow]) => grow), FOAM_GROW + LIP, LIP + 1, DETAIL_REACH_PX);

/**
 * How far (in tiles) the painting of one tile reaches into its neighbours, rounded up: {@link PAINT_REACH_PX} (the
 * 1.3-tile sea halo is the widest) in tiles. A change of one tile therefore needs the {@link REPAINT_REACH} tiles
 * around it painted again, and the tiles up to {@link REPAINT_REACH} further out painted into that area.
 */
export const REPAINT_REACH = 2;

/** The ground is cut into blocks of this many tiles (a side) – each its own texture, so a change uploads one or a few small ones. */
export const GROUND_BLOCK_TILES = 8;
/**
 * The part of a block texture that is shown reaches this many pixels over its neighbours, so blocks overlap and no
 * hairline gap shows between them whatever the zoom (the camera does not sit on whole pixels).
 */
export const GROUND_BLEED_PX = 4;
/**
 * The texture has a ring of this many more pixels around the shown part that is painted but never shown: the very edge
 * pixels of a canvas come out a little different from the rest (up to 30 of 255 in Chromium, still 5 to 13 two pixels in), the neighbouring block
 * must not be covered by them.
 */
export const GROUND_EDGE_PX = 4;

export interface GroundBlock {
  /** Column and row of the block. */
  readonly bx: number;
  readonly by: number;
  /** The tiles the block is made of. */
  readonly range: TileRange;
}

/** All blocks of a map, row by row; the last ones are smaller if the map is not a multiple of the block size. */
export function groundBlocks(world: Pick<WorldView, 'width' | 'height'>): GroundBlock[] {
  const blocks: GroundBlock[] = [];
  for (let by = 0; by * GROUND_BLOCK_TILES < world.height; by += 1) {
    for (let bx = 0; bx * GROUND_BLOCK_TILES < world.width; bx += 1) {
      blocks.push({
        bx,
        by,
        range: {
          x0: bx * GROUND_BLOCK_TILES,
          y0: by * GROUND_BLOCK_TILES,
          x1: Math.min(world.width, (bx + 1) * GROUND_BLOCK_TILES) - 1,
          y1: Math.min(world.height, (by + 1) * GROUND_BLOCK_TILES) - 1,
        },
      });
    }
  }
  return blocks;
}

/** The area a block's canvas covers in world pixels: its tiles plus the bleed and the unseen edge ring all around. */
export function blockArea(block: GroundBlock): { x: number; y: number; width: number; height: number } {
  const ring = GROUND_BLEED_PX + GROUND_EDGE_PX;
  return {
    x: block.range.x0 * TILE_SIZE - ring,
    y: block.range.y0 * TILE_SIZE - ring,
    width: (block.range.x1 - block.range.x0 + 1) * TILE_SIZE + 2 * ring,
    height: (block.range.y1 - block.range.y0 + 1) * TILE_SIZE + 2 * ring,
  };
}

/** The part of the canvas that is shown, in world pixels (the canvas without its unseen edge ring). */
export function blockShown(block: GroundBlock): { x: number; y: number; width: number; height: number } {
  const area = blockArea(block);
  return { x: area.x + GROUND_EDGE_PX, y: area.y + GROUND_EDGE_PX, width: area.width - 2 * GROUND_EDGE_PX, height: area.height - 2 * GROUND_EDGE_PX };
}

/** Paints one block from scratch onto a canvas of the size {@link blockArea} says (the origin of the canvas is the corner of that area). */
export function paintGroundBlock(ctx: CanvasRenderingContext2D, world: WorldView, seed: number, block: GroundBlock): void {
  const area = blockArea(block);
  ctx.save();
  ctx.translate(-area.x, -area.y);
  ctx.fillStyle = cssColor(COLORS.waterDeep);
  ctx.fillRect(area.x, area.y, area.width, area.height);
  // Tiles up to REPAINT_REACH outside the block can reach into it (halos, foam, details).
  paintLayers(ctx, world, seed, growRange(world, block.range, REPAINT_REACH));
  ctx.restore();
}

/**
 * The blocks that look different after the terrain of the tiles in `changed` changed: every block whose area
 * (with its bleed) meets the {@link PAINT_REACH_PX} pixels around the change.
 */
export function blocksTouching(world: Pick<WorldView, 'width' | 'height'>, changed: TileRange): GroundBlock[] {
  const x0 = changed.x0 * TILE_SIZE - PAINT_REACH_PX;
  const y0 = changed.y0 * TILE_SIZE - PAINT_REACH_PX;
  const x1 = (changed.x1 + 1) * TILE_SIZE + PAINT_REACH_PX;
  const y1 = (changed.y1 + 1) * TILE_SIZE + PAINT_REACH_PX;
  return groundBlocks(world).filter((block) => {
    const area = blockArea(block);
    return area.x < x1 && x0 < area.x + area.width && area.y < y1 && y0 < area.y + area.height;
  });
}

export function paintGround(ctx: CanvasRenderingContext2D, world: WorldView, seed: number): void {
  const { width, height } = groundSize(world);
  if (Math.max(width, height) > MAX_GROUND_TEXTURE_SIZE) {
    throw new Error(`Ground texture ${String(width)}×${String(height)} is bigger than ${String(MAX_GROUND_TEXTURE_SIZE)} px`);
  }
  ctx.fillStyle = cssColor(COLORS.waterDeep);
  ctx.fillRect(0, 0, width, height);
  paintLayers(ctx, world, seed, { x0: 0, y0: 0, x1: world.width - 1, y1: world.height - 1 });
}

function growRange(world: WorldView, range: TileRange, by: number): TileRange {
  return {
    x0: Math.max(0, range.x0 - by),
    y0: Math.max(0, range.y0 - by),
    x1: Math.min(world.width - 1, range.x1 + by),
    y1: Math.min(world.height - 1, range.y1 + by),
  };
}

/** All layers, bottom to top, for the tiles in `range` (the sea under them has been filled already). */
function paintLayers(ctx: CanvasRenderingContext2D, world: WorldView, seed: number, range: TileRange): void {
  const level = (x: number, y: number): number => levelOf(terrainAt(world, x, y));
  paintSeaHalos(ctx, level, range);
  paintFoam(ctx, level, range);
  // Beach: lip first, then the sand on top; then the same for the meadow.
  paintTiles(ctx, world, range, (x, y) => level(x, y) < 1, 1, LIP + 1, () => COLORS.sandShade);
  paintTiles(ctx, world, range, (x, y) => level(x, y) < 1, 1, 0, () => COLORS.sand);
  paintTiles(ctx, world, range, (x, y) => level(x, y) < 2, 2, LIP, () => COLORS.grassShade);
  paintTiles(ctx, world, range, (x, y) => level(x, y) < 2, 2, 0, () => COLORS.grass);
  // Forest floor and rocky ground are patches on the meadow with their own colour.
  paintPatch(ctx, world, range, 'forest', COLORS.forestFloor);
  paintPatch(ctx, world, range, 'rock', COLORS.rockFloor);

  paintDetails(ctx, world, seed, range);
}

/** Lighter water around the land: three soft steps from deep to shallow. */
function paintSeaHalos(ctx: CanvasRenderingContext2D, level: (x: number, y: number) => number, range: TileRange): void {
  for (const [grow, color] of HALOS) {
    ctx.fillStyle = cssColor(color);
    forEachTile(range, (x, y) => {
      if (level(x, y) >= 1) {
        roundedRect(ctx, x * TILE_SIZE - grow, y * TILE_SIZE - grow, TILE_SIZE + 2 * grow, TILE_SIZE + 2 * grow, grow + CORNER);
        ctx.fill();
      }
    });
  }
}

/** White foam line along the coast, just outside the beach. */
function paintFoam(ctx: CanvasRenderingContext2D, level: (x: number, y: number) => number, range: TileRange): void {
  ctx.fillStyle = cssRgba(COLORS.foam, 0.75);
  const grow = FOAM_GROW;
  forEachTile(range, (x, y) => {
    if (level(x, y) >= 1) {
      roundedRect(ctx, x * TILE_SIZE - grow, y * TILE_SIZE - grow + LIP, TILE_SIZE + 2 * grow, TILE_SIZE + 2 * grow, CORNER + grow);
      ctx.fill();
    }
  });
}

/**
 * Fills every tile of at least `minLevel`, shifted down by `offset`, with
 * rounded outer corners (where both neighbours on that side are `lower`).
 */
function paintTiles(
  ctx: CanvasRenderingContext2D,
  world: WorldView,
  range: TileRange,
  lower: (x: number, y: number) => boolean,
  minLevel: number,
  offset: number,
  colorOf: (terrain: Terrain) => number,
): void {
  forEachTile(range, (x, y) => {
    if (levelOf(terrainAt(world, x, y)) < minLevel) {
      return;
    }
    ctx.fillStyle = cssColor(colorOf(terrainAt(world, x, y)));
    paintTile(ctx, x, y, offset, lower);
    ctx.fill();
  });
}

/** Paints all tiles of one terrain in `color`; outer corners are rounded where both neighbours are another terrain. */
function paintPatch(ctx: CanvasRenderingContext2D, world: WorldView, range: TileRange, terrain: Terrain, color: number): void {
  ctx.fillStyle = cssColor(color);
  const other = (x: number, y: number): boolean => terrainAt(world, x, y) !== terrain;
  forEachTile(range, (x, y) => {
    if (terrainAt(world, x, y) === terrain) {
      paintTile(ctx, x, y, 0, other);
      ctx.fill();
    }
  });
}

function paintTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  offset: number,
  lower: (x: number, y: number) => boolean,
): void {
  const tl = lower(x - 1, y) && lower(x, y - 1) ? CORNER : 0;
  const tr = lower(x + 1, y) && lower(x, y - 1) ? CORNER : 0;
  const br = lower(x + 1, y) && lower(x, y + 1) ? CORNER : 0;
  const bl = lower(x - 1, y) && lower(x, y + 1) ? CORNER : 0;
  cornerRect(ctx, x * TILE_SIZE, y * TILE_SIZE + offset, TILE_SIZE, TILE_SIZE, tl, tr, br, bl);
}

/** Flowers and tufts on the meadow, moss and needles in the forest, pebbles on rocky ground, specks on sand. */
function paintDetails(ctx: CanvasRenderingContext2D, world: WorldView, seed: number, range: TileRange): void {
  forEachTile(range, (x, y) => {
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
          ctx.fillStyle = cssRgba(r(2) < 0.5 ? COLORS.patchLight : COLORS.patchDark, 0.07);
          const [cx, cy] = spot(3, 4);
          blob(ctx, cx, cy, 16 + r(5) * 8, 10 + r(6) * 6, r(7) * 3);
        }
        if (r(8) < 0.45) {
          const [tx, ty] = spot(9, 10);
          tuft(ctx, tx, ty, COLORS.grassShade);
        }
        if (r(11) < 0.11) {
          const [fx, fy] = spot(12, 13);
          flower(ctx, fx, fy, FLOWER_PETALS[Math.floor(r(14) * FLOWER_PETALS.length)] ?? COLORS.foam);
        }
        break;
      }
      case 'forest': {
        // Dark forest floor: darker and lighter patches, moss, fallen needles, now and then a mushroom.
        ctx.fillStyle = cssRgba(COLORS.forestFloorDark, 0.55);
        for (let i = 0; i < 2; i += 1) {
          const [bx, by] = spot(15 + i * 2, 16 + i * 2);
          blob(ctx, bx, by, 13 + r(20 + i) * 8, 8 + r(22 + i) * 5, r(24 + i) * 3);
        }
        ctx.fillStyle = cssRgba(COLORS.forestMoss, 0.6);
        for (let i = 0; i < 2; i += 1) {
          const [mx, my] = spot(30 + i * 2, 31 + i * 2);
          blob(ctx, mx, my, 6 + r(34 + i) * 4, 4 + r(36 + i) * 3, r(38 + i) * 3);
        }
        ctx.strokeStyle = cssRgba(COLORS.forestNeedle, 0.8);
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        for (let i = 0; i < 4; i += 1) {
          const [nx, ny] = spot(40 + i * 2, 41 + i * 2);
          const angle = r(50 + i) * Math.PI;
          ctx.beginPath();
          ctx.moveTo(nx, ny);
          ctx.lineTo(nx + Math.cos(angle) * 6, ny + Math.sin(angle) * 6);
          ctx.stroke();
        }
        if (r(60) < 0.07) {
          const [mx, my] = spot(61, 62);
          mushroom(ctx, mx, my);
        }
        break;
      }
      case 'rock': {
        // Stony ground: lighter and darker slabs, pebbles with a highlight, a crack.
        ctx.fillStyle = cssRgba(r(1) < 0.5 ? COLORS.rockFloorLight : COLORS.rockFloorDark, 0.55);
        const [sx, sy] = spot(2, 3);
        blob(ctx, sx, sy, 15 + r(4) * 8, 9 + r(5) * 5, r(6) * 3);
        for (let i = 0; i < 4; i += 1) {
          const [qx, qy] = spot(10 + i * 2, 11 + i * 2);
          const rx = 3 + r(20 + i) * 3.5;
          const ry = 2.2 + r(30 + i) * 2.2;
          ctx.fillStyle = cssColor(COLORS.rockFloorDark);
          blob(ctx, qx, qy + 1, rx, ry, 0);
          ctx.fillStyle = cssColor(COLORS.rockFloorLight);
          blob(ctx, qx, qy, rx, ry * 0.8, 0);
        }
        if (r(40) < 0.4) {
          const [cx, cy] = spot(41, 42);
          ctx.strokeStyle = cssRgba(COLORS.rockCrack, 0.5);
          ctx.lineWidth = 1.6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx - 8, cy - 3);
          ctx.lineTo(cx, cy + 1);
          ctx.lineTo(cx + 7, cy - 2);
          ctx.stroke();
        }
        break;
      }
      case 'sand': {
        ctx.fillStyle = cssRgba(COLORS.sandSpeck, 0.35);
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
          ctx.fillStyle = cssColor(COLORS.shell);
          blob(ctx, sx, sy, 5, 3.5, r(93) * 3);
        }
        break;
      }
      case 'water':
        break;
    }
  });
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rotation: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2);
  ctx.fill();
}

function tuft(ctx: CanvasRenderingContext2D, x: number, y: number, color: number): void {
  ctx.strokeStyle = cssColor(color);
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

function flower(ctx: CanvasRenderingContext2D, x: number, y: number, petals: number): void {
  ctx.fillStyle = cssColor(petals);
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

function mushroom(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.fillStyle = cssColor(COLORS.mushroomStem);
  ctx.fillRect(x - 1.8, y - 1, 3.6, 6);
  ctx.fillStyle = cssColor(COLORS.mushroomCap);
  ctx.beginPath();
  ctx.ellipse(x, y - 1, 6, 4.4, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = cssColor(COLORS.mushroomStem);
  for (const dx of [-2.6, 0.5, 3]) {
    ctx.beginPath();
    ctx.arc(x + dx, y - 3, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
}

function forEachTile(range: TileRange, visit: (x: number, y: number) => void): void {
  for (let y = range.y0; y <= range.y1; y += 1) {
    for (let x = range.x0; x <= range.x1; x += 1) {
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

/**
 * Removes the textures of the ground blocks and returns the empty list that replaces them: a scene that restarts (loading a
 * game, M5) must not try to remove the same textures again ("No texture found matching key").
 */
export function releaseGroundBlocks<T extends { readonly key: string }>(blocks: readonly T[], remove: (key: string) => void): T[] {
  for (const { key } of blocks) {
    remove(key);
  }
  return [];
}
