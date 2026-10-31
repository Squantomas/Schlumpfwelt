import { describe, expect, it } from 'vitest';
import { groundSize, MAX_GROUND_TEXTURE_SIZE, REPAINT_REACH, paintGround, repaintGround } from '../../src/scenes/island/groundTexture';
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

/** Ein Canvas-Kontext, der zählt, wie oft gefüllt wurde, und sich die Rechtecke von rect/fillRect merkt. */
function countingContext(): { ctx: CanvasRenderingContext2D; calls: Map<string, number>; rects: number[][] } {
  const calls = new Map<string, number>();
  const rects: number[][] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, key: string) {
      if (key in target) {
        return target[key];
      }
      return (...args: number[]): void => {
        calls.set(key, (calls.get(key) ?? 0) + 1);
        if (key === 'rect' || key === 'fillRect') {
          rects.push(args);
        }
      };
    },
    set(target, key: string, value: unknown) {
      target[key] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls, rects };
}

describe('Boden neu malen (Baum pflanzen, Land aufschütten)', () => {
  it('malt nur die Umgebung der geänderten Kachel – ein Bruchteil der Arbeit eines ganzen Bildes', () => {
    const world = generateIsland(7);
    const full = countingContext();
    paintGround(full.ctx, world, 7);
    const part = countingContext();
    const area = repaintGround(part.ctx, world, 7, { x0: 24, y0: 24, x1: 24, y1: 24 });
    const total = (calls: Map<string, number>): number => [...calls.values()].reduce((sum, n) => sum + n, 0);
    expect(total(part.calls)).toBeLessThan(total(full.calls) / 10);
    expect(area).toEqual({ x0: 24 - REPAINT_REACH, y0: 24 - REPAINT_REACH, x1: 24 + REPAINT_REACH, y1: 24 + REPAINT_REACH });
  });

  it('schneidet auf diesen Bereich zu und füllt ihn mit der Tiefwasserfarbe, bevor es malt', () => {
    const world = generateIsland(7);
    const { ctx, rects } = countingContext();
    repaintGround(ctx, world, 7, { x0: 10, y0: 12, x1: 11, y1: 12 });
    const left = (10 - REPAINT_REACH) * TILE_SIZE;
    const top = (12 - REPAINT_REACH) * TILE_SIZE;
    const width = (2 + 2 * REPAINT_REACH) * TILE_SIZE;
    const height = (1 + 2 * REPAINT_REACH) * TILE_SIZE;
    expect(rects).toContainEqual([left, top, width, height]);
    // Der Hintergrund wird nur in diesem Bereich gemalt, nie über die ganze Karte.
    const mapSize = groundSize(world);
    expect(rects.some((rect) => rect[2] === mapSize.width && rect[3] === mapSize.height)).toBe(false);
  });

  it('bleibt am Kartenrand in der Karte', () => {
    const world = generateIsland(7);
    const { ctx } = countingContext();
    expect(repaintGround(ctx, world, 7, { x0: 0, y0: 0, x1: 0, y1: 0 })).toEqual({ x0: 0, y0: 0, x1: REPAINT_REACH, y1: REPAINT_REACH });
    expect(repaintGround(ctx, world, 7, { x0: 47, y0: 47, x1: 47, y1: 47 })).toEqual({ x0: 47 - REPAINT_REACH, y0: 47 - REPAINT_REACH, x1: 47, y1: 47 });
  });

  it('malt die Farben der neuen Geländeart (Wald auf einer Wiese)', () => {
    const world = createWorld(12, 12, 'grass');
    setTerrain(world, 6, 6, 'forest');
    const { ctx, fills } = recordingContext();
    repaintGround(ctx, world, 3, { x0: 6, y0: 6, x1: 6, y1: 6 });
    expect(fills.has(cssColor(COLORS.forestFloor))).toBe(true);
    expect(fills.has(cssColor(COLORS.grass))).toBe(true);
  });
});
