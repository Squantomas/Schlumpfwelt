import { describe, expect, it } from 'vitest';
import {
  DETAIL_REACH_PX,
  GROUND_BLEED_PX,
  GROUND_EDGE_PX,
  blockShown,
  GROUND_BLOCK_TILES,
  MAX_GROUND_TEXTURE_SIZE,
  PAINT_REACH_PX,
  REPAINT_REACH,
  blockArea,
  blocksTouching,
  groundBlocks,
  groundSize,
  paintGround,
  paintGroundBlock,
} from '../../src/scenes/island/groundTexture';
import { DEFAULT_WORLD_PARAMS, generateIsland } from '../../src/sim/islandGen';
import { createWorld, setTerrain } from '../../src/sim/world';
import { COLORS, TILE_SIZE, cssColor, rgb } from '../../src/ui/style';

/** Ein Canvas-Kontext, der nur mitschreibt, welche Füllfarben benutzt wurden. */
function recordingContext(): { ctx: CanvasRenderingContext2D; fills: Set<string> } {
  const fills = new Set<string>();
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, key: string) {
      if (key === 'fillStyle') {
        return target[key];
      }
      return (): void => undefined;
    },
    set(target, key: string, value: unknown) {
      target[key] = value;
      if (key === 'fillStyle' && typeof value === 'string') {
        fills.add(value);
      }
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, fills };
}

describe('Bodentextur', () => {
  it('die Kantenlänge bleibt unter dem Texturlimit von Tablets (4096 px)', () => {
    const { width, height } = groundSize({ width: DEFAULT_WORLD_PARAMS.width, height: DEFAULT_WORLD_PARAMS.height, tiles: [] });
    expect(MAX_GROUND_TEXTURE_SIZE).toBeLessThanOrEqual(4096);
    expect(width).toBeLessThanOrEqual(MAX_GROUND_TEXTURE_SIZE);
    expect(height).toBeLessThanOrEqual(MAX_GROUND_TEXTURE_SIZE);
    expect(width).toBe(48 * TILE_SIZE);
  });

  it('weigert sich, eine zu große Karte in eine Textur zu malen', () => {
    const { ctx } = recordingContext();
    const tooBig = createWorld(MAX_GROUND_TEXTURE_SIZE / TILE_SIZE + 1, 8);
    expect(() => {
      paintGround(ctx, tooBig, 1);
    }).toThrow(/bigger than/);
  });

  it('jede der fünf Geländearten hat eine eigene Bodenfarbe', () => {
    const world = createWorld(8, 8);
    setTerrain(world, 2, 2, 'sand');
    setTerrain(world, 3, 3, 'grass');
    setTerrain(world, 4, 4, 'forest');
    setTerrain(world, 5, 5, 'rock');
    const { ctx, fills } = recordingContext();
    paintGround(ctx, world, 7);
    const ground = [COLORS.waterDeep, COLORS.sand, COLORS.grass, COLORS.forestFloor, COLORS.rockFloor];
    expect(new Set(ground).size).toBe(5);
    for (const color of ground) {
      expect(fills.has(cssColor(color)), `Farbe ${cssColor(color)} wird gemalt`).toBe(true);
    }
  });

  it('Wald ist deutlich dunkler als Wiese', () => {
    const luminance = (c: number): number => {
      const [r, g, b] = rgb(c);
      return 0.3 * r + 0.59 * g + 0.11 * b;
    };
    expect(luminance(COLORS.forestFloor)).toBeLessThan(luminance(COLORS.grass) - 20);
  });

  it('Fels und Felsboden sind warmes Grau, nicht bläulich wie Wasser', () => {
    for (const color of [COLORS.rock, COLORS.rockLight, COLORS.rockShade, COLORS.rockFloor, COLORS.rockFloorLight, COLORS.rockFloorDark]) {
      const [r, , b] = rgb(color);
      expect(r, `Rot ≥ Blau bei ${cssColor(color)}`).toBeGreaterThanOrEqual(b);
    }
    // Wasser ist bläulich: Blau deutlich über Rot.
    for (const water of [COLORS.water, COLORS.waterShallow, COLORS.waterMid, COLORS.waterDeep]) {
      const [r, , b] = rgb(water);
      expect(b - r).toBeGreaterThan(40);
    }
  });

  it('malt eine echte Insel ohne Fehler', () => {
    const { ctx } = recordingContext();
    expect(() => {
      paintGround(ctx, generateIsland(42), 42);
    }).not.toThrow();
  });
});

/** Ein Canvas-Kontext, der Aufrufe zählt und sich Argumente von rect, fillRect, translate, ellipse und arc merkt. */
function countingContext(): { ctx: CanvasRenderingContext2D; calls: Map<string, number>; args: Map<string, number[][]> } {
  const calls = new Map<string, number>();
  const args = new Map<string, number[][]>();
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, key: string) {
      if (key in target) {
        return target[key];
      }
      return (...values: number[]): void => {
        calls.set(key, (calls.get(key) ?? 0) + 1);
        if (['rect', 'fillRect', 'translate', 'ellipse', 'arc'].includes(key)) {
          args.set(key, [...(args.get(key) ?? []), values]);
        }
      };
    },
    set(target, key: string, value: unknown) {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, args };
}

describe('Mal-Reichweite einer Kachel (Korrekturrunde 1, R3)', () => {
  it('ist höchstens REPAINT_REACH Kacheln breit – und nicht kleiner als REPAINT_REACH − 1 (sonst wäre die Reichweite zu großzügig)', () => {
    expect(PAINT_REACH_PX).toBeLessThanOrEqual(REPAINT_REACH * TILE_SIZE);
    expect(PAINT_REACH_PX).toBeGreaterThan((REPAINT_REACH - 1) * TILE_SIZE);
  });

  it('die Details, die wirklich gemalt werden (Flecken, Blumen, Steine …), ragen höchstens DETAIL_REACH_PX über ihre Kachel', () => {
    let worst = 0;
    for (const seed of [1, 2, 3, 5, 8, 13]) {
      const world = generateIsland(seed);
      const { ctx, args } = countingContext();
      paintGround(ctx, world, seed);
      const shapes: { x: number; y: number; reach: number }[] = [
        ...(args.get('ellipse') ?? []).map(([x = 0, y = 0, rx = 0, ry = 0]) => ({ x, y, reach: Math.max(rx, ry) })),
        ...(args.get('arc') ?? []).map(([x = 0, y = 0, r = 0]) => ({ x, y, reach: r })),
      ];
      for (const { x, y, reach } of shapes) {
        // Die Kachel, in der die Form ihren Mittelpunkt hat; Halos (große Rechtecke) und Schaum sind keine Ellipsen.
        const left = Math.floor(x / TILE_SIZE) * TILE_SIZE;
        const top = Math.floor(y / TILE_SIZE) * TILE_SIZE;
        const spill = Math.max(left - (x - reach), x + reach - (left + TILE_SIZE), top - (y - reach), y + reach - (top + TILE_SIZE), 0);
        worst = Math.max(worst, spill);
      }
    }
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeLessThanOrEqual(DETAIL_REACH_PX + 0.001);
    expect(DETAIL_REACH_PX).toBeLessThanOrEqual(PAINT_REACH_PX);
  });
});

describe('Boden in Blöcken (R4)', () => {
  it('teilt eine Karte in Blöcke, die jede Kachel genau einmal abdecken – auch wenn die Karte kein Vielfaches der Blockgröße ist', () => {
    for (const [width, height] of [[48, 48], [20, 13], [8, 8], [9, 1]] as const) {
      const seen = new Set<string>();
      for (const block of groundBlocks({ width, height })) {
        for (let y = block.range.y0; y <= block.range.y1; y += 1) {
          for (let x = block.range.x0; x <= block.range.x1; x += 1) {
            expect(seen.has(`${String(x)},${String(y)}`), `${String(x)},${String(y)} doppelt`).toBe(false);
            seen.add(`${String(x)},${String(y)}`);
          }
        }
      }
      expect(seen.size).toBe(width * height);
    }
    expect(groundBlocks({ width: 48, height: 48 })).toHaveLength((48 / GROUND_BLOCK_TILES) ** 2);
  });

  it('jede Block-Textur ist klein (weit unter der Kante von 4096 px) und hat ringsum den Rand zu den Nachbarn', () => {
    for (const block of groundBlocks({ width: 48, height: 48 })) {
      const area = blockArea(block);
      expect(Math.max(area.width, area.height)).toBeLessThanOrEqual(MAX_GROUND_TEXTURE_SIZE / 4);
      const shown = blockShown(block);
      expect(area.width).toBe((block.range.x1 - block.range.x0 + 1) * TILE_SIZE + 2 * (GROUND_BLEED_PX + GROUND_EDGE_PX));
      expect(shown.x).toBe(block.range.x0 * TILE_SIZE - GROUND_BLEED_PX);
      expect(shown.width).toBe((block.range.x1 - block.range.x0 + 1) * TILE_SIZE + 2 * GROUND_BLEED_PX);
    }
    // Die gezeigten Teile von Nachbarn überlappen sich um 2 × Rand: keine Lücke bei beliebigem Zoom.
    const [a, b] = groundBlocks({ width: 48, height: 48 });
    if (a && b) {
      expect(blockShown(a).x + blockShown(a).width - blockShown(b).x).toBe(2 * GROUND_BLEED_PX);
    }
  });

  it('malt einen Block in seine Fläche: Ursprung verschoben, Tiefwasser über die ganze Fläche, Kacheln bis REPAINT_REACH ringsum', () => {
    const world = generateIsland(7);
    const block = groundBlocks(world)[9];
    if (!block) {
      throw new Error('kein Block');
    }
    const area = blockArea(block);
    const { ctx, args } = countingContext();
    paintGroundBlock(ctx, world, 7, block);
    expect(args.get('translate')).toEqual([[-area.x, -area.y]]);
    expect(args.get('fillRect')).toContainEqual([area.x, area.y, area.width, area.height]);
  });

  it('eine Änderung berührt höchstens vier Blöcke, in der Blockmitte nur einen', () => {
    const world = generateIsland(7);
    const middle = blocksTouching(world, { x0: 12, y0: 20, x1: 12, y1: 20 });
    expect(middle.map((block) => [block.bx, block.by])).toEqual([[1, 2]]);
    for (const [x, y] of [[0, 0], [7, 7], [8, 8], [15, 16], [24, 24], [47, 47], [8, 3]] as const) {
      const touched = blocksTouching(world, { x0: x, y0: y, x1: x, y1: y });
      expect(touched.length, `${String(x)},${String(y)}`).toBeGreaterThanOrEqual(1);
      expect(touched.length, `${String(x)},${String(y)}`).toBeLessThanOrEqual(4);
    }
    // An einer Blockkante ändert die Nachbarblöcke mit (Halo reicht hinüber).
    expect(blocksTouching(world, { x0: 8, y0: 20, x1: 8, y1: 20 }).map((block) => block.bx).sort()).toEqual([0, 1]);
  });

  it('ein Block deckt jede Kachel, deren Mal-Reichweite in seine Fläche fällt: nach einer Änderung sind alle betroffenen Blöcke dabei', () => {
    const world = generateIsland(7);
    // Für jede Kachel: jeder Block, dessen Fläche (mit Rand) näher als REPAINT_REACH an ihr liegt, wird neu gemalt.
    for (let y = 0; y < world.height; y += 3) {
      for (let x = 0; x < world.width; x += 3) {
        const touched = new Set(blocksTouching(world, { x0: x, y0: y, x1: x, y1: y }).map((block) => `${String(block.bx)},${String(block.by)}`));
        for (const block of groundBlocks(world)) {
          const gapX = Math.max(blockArea(block).x - (x + 1) * TILE_SIZE, x * TILE_SIZE - (blockArea(block).x + blockArea(block).width), 0);
          const gapY = Math.max(blockArea(block).y - (y + 1) * TILE_SIZE, y * TILE_SIZE - (blockArea(block).y + blockArea(block).height), 0);
          if (Math.max(gapX, gapY) < PAINT_REACH_PX) {
            expect(touched.has(`${String(block.bx)},${String(block.by)}`), `Block ${String(block.bx)},${String(block.by)} bei ${String(x)},${String(y)}`).toBe(true);
          }
        }
      }
    }
  });

  it('malt die Farben der neuen Geländeart in einen Block (Wald auf einer Wiese)', () => {
    const world = createWorld(16, 16, 'grass');
    setTerrain(world, 6, 6, 'forest');
    const { ctx, fills } = recordingContext();
    const block = groundBlocks(world)[0];
    if (!block) {
      throw new Error('kein Block');
    }
    paintGroundBlock(ctx, world, 3, block);
    expect(fills.has(cssColor(COLORS.forestFloor))).toBe(true);
    expect(fills.has(cssColor(COLORS.grass))).toBe(true);
  });
});
