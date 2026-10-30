import { describe, expect, it } from 'vitest';
import { generateIsland } from '../../src/sim/islandGen';
import { createWorld, isLand, setTerrain, terrainAt, type World } from '../../src/sim/world';
import { clampView, visibleRect, zoomLimits, type CameraBounds, type CameraView, type Rect, type Size } from '../../src/ui/cameraMath';
import { landRegions } from '../../src/ui/cameraRegions';
import { CameraRig } from '../../src/ui/cameraRig';

const TILE = 64;

function boundsFor(world: World, margin = 1): CameraBounds {
  return {
    x: -2 * TILE,
    y: -2 * TILE,
    width: (world.width + 4) * TILE,
    height: (world.height + 4) * TILE,
    centerRegions: landRegions(world, TILE, margin),
  };
}

/** Does the rectangle (world px) overlap at least one land tile? */
function showsLand(world: World, rect: Rect): boolean {
  const x0 = Math.max(0, Math.floor(rect.x / TILE));
  const x1 = Math.min(world.width - 1, Math.floor((rect.x + rect.width) / TILE));
  const y0 = Math.max(0, Math.floor(rect.y / TILE));
  const y1 = Math.min(world.height - 1, Math.floor((rect.y + rect.height) / TILE));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (isLand(terrainAt(world, x, y))) {
        return true;
      }
    }
  }
  return false;
}

describe('landRegions', () => {
  it('fasst die Kacheln einer Zeile zu einem Rechteck zusammen', () => {
    const world = createWorld(10, 6);
    for (const x of [3, 4, 5]) {
      setTerrain(world, x, 2, 'grass');
    }
    // Land (3..5, 2) plus 1 Kachel Rand: x 2..6, y 1..3
    expect(landRegions(world, 10, 1)).toEqual([
      { x: 20, y: 10, width: 50, height: 10 },
      { x: 20, y: 20, width: 50, height: 10 },
      { x: 20, y: 30, width: 50, height: 10 },
    ]);
  });

  it('ohne Rand nur die Landkacheln', () => {
    const world = createWorld(5, 5);
    setTerrain(world, 1, 1, 'sand');
    setTerrain(world, 3, 1, 'sand');
    expect(landRegions(world, 8, 0)).toEqual([
      { x: 8, y: 8, width: 8, height: 8 },
      { x: 24, y: 8, width: 8, height: 8 },
    ]);
  });

  it('bleibt in der Karte', () => {
    const world = createWorld(4, 4, 'grass');
    const regions = landRegions(world, 10, 2);
    for (const r of regions) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.width).toBeLessThanOrEqual(40);
    }
  });

  it('eine Welt ohne Land hat keine Bereiche', () => {
    expect(landRegions(createWorld(5, 5), 64)).toEqual([]);
  });
});

describe('Kamera-Mittelpunkt auf Land (Regressionstest: Insel verschwindet bei hohem Zoom)', () => {
  const SEEDS = Array.from({ length: 20 }, (_, i) => i * 7919 + 1);
  const VIEWPORTS: Size[] = [
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 1280, height: 800 },
    { width: 1920, height: 1080 },
    { width: 400, height: 800 },
    { width: 360, height: 640 },
  ];
  /** Mittelpunkte weit außerhalb in allen Richtungen und an den Ecken der Karte und der Insel. */
  const FAR = 1e6;
  const TARGETS: [number, number][] = [
    [-FAR, -FAR],
    [FAR, -FAR],
    [-FAR, FAR],
    [FAR, FAR],
    [-FAR, 1536],
    [FAR, 1536],
    [1536, -FAR],
    [1536, FAR],
    [0, 0],
    [3072, 0],
    [0, 3072],
    [3072, 3072],
  ];

  it('bei jedem Zoom zeigt jede Ecken-Ansicht Land', () => {
    for (const seed of SEEDS) {
      const world = generateIsland(seed);
      const bounds = boundsFor(world);
      for (const viewport of VIEWPORTS) {
        const limits = zoomLimits(viewport, bounds, TILE, 128);
        for (let step = 0; step <= 10; step += 1) {
          const zoom = limits.min * Math.pow(limits.max / limits.min, step / 10);
          for (const [x, y] of TARGETS) {
            const view = clampView({ centerX: x, centerY: y, zoom }, viewport, bounds, limits);
            const seen = visibleRect(view, viewport);
            expect(showsLand(world, seen), `Seed ${seed}, ${viewport.width}×${viewport.height}, Zoom ${zoom.toFixed(2)}, Ziel ${x},${y}`).toBe(true);
          }
        }
      }
    }
  });

  it('der Mittelpunkt liegt dabei auf Land oder direkt daneben', () => {
    const world = generateIsland(5);
    const bounds = boundsFor(world);
    const viewport = { width: 1024, height: 768 };
    const limits = zoomLimits(viewport, bounds, TILE, 128);
    for (const [x, y] of TARGETS) {
      const view = clampView({ centerX: x, centerY: y, zoom: limits.max }, viewport, bounds, limits);
      // Liegt der Mittelpunkt genau auf einer Kachelkante, gelten beide Kacheln.
      let near = false;
      for (const ex of [-0.01, 0.01]) {
        for (const ey of [-0.01, 0.01]) {
          const tx = Math.floor((view.centerX + ex) / TILE);
          const ty = Math.floor((view.centerY + ey) / TILE);
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              near ||= isLand(terrainAt(world, tx + dx, ty + dy));
            }
          }
        }
      }
      expect(near, `Ziel ${x},${y} → Mittelpunkt ${view.centerX},${view.centerY}`).toBe(true);
    }
  });

  it('die Kamera rutscht am Rand der Insel entlang statt zu hängen', () => {
    const world = generateIsland(3);
    const bounds = boundsFor(world, 0);
    const viewport = { width: 1024, height: 768 };
    const limits = zoomLimits(viewport, bounds, TILE, 128);
    const zoom = limits.max;
    // Von der Mitte immer weiter nach rechts-unten ziehen und dabei seitlich versetzen: bewegt sich weiter.
    let view: CameraView = clampView({ centerX: 1536, centerY: 1536, zoom }, viewport, bounds, limits);
    const xs: number[] = [];
    for (let i = 0; i < 40; i += 1) {
      view = clampView({ ...view, centerX: view.centerX + 80, centerY: view.centerY + 20 }, viewport, bounds, limits);
      xs.push(view.centerX);
    }
    expect(xs[xs.length - 1]).toBeGreaterThan(xs[0] ?? 0);
  });

  it('ohne Bereiche gilt nur die Kartengrenze (alter Zustand)', () => {
    const world = generateIsland(1);
    const bounds: CameraBounds = { x: -128, y: -128, width: 3328, height: 3328 };
    const viewport = { width: 1024, height: 768 };
    const limits = zoomLimits(viewport, bounds, TILE, 128);
    const view = clampView({ centerX: -FAR, centerY: -FAR, zoom: limits.max }, viewport, bounds, limits);
    expect(showsLand(world, visibleRect(view, viewport))).toBe(false);
  });

  it('CameraRig: Ziehen in alle Richtungen lässt bei jedem Zoom Land im Bild', () => {
    const world = generateIsland(42);
    const viewport = { width: 1024, height: 768 };
    const rig = new CameraRig({
      bounds: boundsFor(world),
      focus: { x: 7 * TILE, y: 7 * TILE, width: 34 * TILE, height: 34 * TILE },
      focusPadding: 12,
      tileSize: TILE,
      maxTileCssPx: 128,
    });
    rig.resize(viewport);
    for (const scale of [1, 2, 4, 8]) {
      rig.pinch({ x: 512, y: 384 }, { x: 512, y: 384 }, scale);
      for (const [dx, dy] of [
        [1e5, 1e5],
        [-2e5, 0],
        [0, -2e5],
        [2e5, 0],
        [0, 2e5],
        [-2e5, -2e5],
      ] as const) {
        rig.pan(dx, dy);
        expect(showsLand(world, visibleRect(rig.view, viewport)), `Zoom ${rig.view.zoom}, Zug ${dx},${dy}`).toBe(true);
      }
    }
  });
});
