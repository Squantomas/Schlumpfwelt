import { describe, expect, it } from 'vitest';
import { groundSize, MAX_GROUND_TEXTURE_SIZE, paintGround } from '../../src/scenes/island/groundTexture';
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
