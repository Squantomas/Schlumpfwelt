import { describe, expect, it } from 'vitest';
import { circleSegments, cornerRadius, ellipseOutline, ellipseTriangles, roundRectOutline, roundRectPieces, type Pieces, type Triangle } from '../../src/ui/shapes';

const triangleArea = ([a, b, c]: Triangle): number => Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
const areaOf = (pieces: Pieces): number => pieces.rects.reduce((sum, r) => sum + r.width * r.height, 0) + pieces.triangles.reduce((sum, t) => sum + triangleArea(t), 0);

describe('circleSegments', () => {
  it('hat genug Ecken für einen runden Rand und nicht mehr als nötig', () => {
    expect(circleSegments(2)).toBe(16);
    expect(circleSegments(34)).toBeGreaterThanOrEqual(30);
    expect(circleSegments(5000)).toBe(72);
    for (const r of [8, 20, 34, 60, 120]) {
      // At twice the size (retina) the edge is off by at most half a pixel.
      const n = circleSegments(r);
      expect(2 * r * (1 - Math.cos(Math.PI / n)), String(r)).toBeLessThan(0.5);
    }
  });
});

describe('roundRectPieces', () => {
  it('deckt die Fläche des abgerundeten Rechtecks ab (bis auf die Ecken-Näherung)', () => {
    for (const [w, h, r] of [
      [200, 80, 20],
      [64, 64, 10],
      [300, 40, 20],
      [40, 40, 20],
    ] as const) {
      const exact = w * h - (4 - Math.PI) * cornerRadius(w, h, r) ** 2;
      const area = areaOf(roundRectPieces(10, 20, w, h, r));
      expect(area / exact, `${String(w)}×${String(h)} r${String(r)}`).toBeGreaterThan(0.99);
      expect(area).toBeLessThanOrEqual(exact + 1e-6);
    }
  });

  it('bleibt im Rechteck und braucht nur wenige Teile', () => {
    const pieces = roundRectPieces(0, 0, 460, 270, 26);
    for (const rect of pieces.rects) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(460);
      expect(rect.y + rect.height).toBeLessThanOrEqual(270);
    }
    for (const point of pieces.triangles.flat()) {
      expect(point.x).toBeGreaterThanOrEqual(-1e-9);
      expect(point.y).toBeGreaterThanOrEqual(-1e-9);
      expect(point.x).toBeLessThanOrEqual(460 + 1e-9);
      expect(point.y).toBeLessThanOrEqual(270 + 1e-9);
    }
    // Phaser itself uses 400 points (100 per corner).
    expect(pieces.rects.length + pieces.triangles.length).toBeLessThan(50);
  });

  it('wird ohne Radius ein einfaches Rechteck und kappt zu große Radien', () => {
    expect(roundRectPieces(1, 2, 30, 40, 0)).toEqual({ rects: [{ x: 1, y: 2, width: 30, height: 40 }], triangles: [] });
    expect(cornerRadius(30, 40, 100)).toBe(15);
    expect(cornerRadius(30, 40, -3)).toBe(0);
    // A pill (radius = half the height): no side strips of height 0.
    expect(roundRectPieces(0, 0, 100, 20, 10).rects).toHaveLength(1);
  });
});

describe('roundRectOutline', () => {
  it('läuft im Uhrzeigersinn um das Rechteck und bleibt darin', () => {
    const points = roundRectOutline(0, 0, 100, 50, 10);
    expect(points[0]?.x).toBeCloseTo(0, 9);
    expect(points[0]?.y).toBeCloseTo(10, 9);
    // Top left → top right → bottom right → bottom left.
    const last = points[points.length - 1];
    expect(last?.x).toBeCloseTo(0, 9);
    expect(last?.y).toBeCloseTo(40, 9);
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(-1e-9);
      expect(point.x).toBeLessThanOrEqual(100 + 1e-9);
      expect(point.y).toBeGreaterThanOrEqual(-1e-9);
      expect(point.y).toBeLessThanOrEqual(50 + 1e-9);
    }
    expect(roundRectOutline(0, 0, 10, 10, 0)).toHaveLength(4);
  });
});

describe('Kreise und Ellipsen', () => {
  it('der Fächer hat fast die Fläche des Kreises, die Ellipse die der Ellipse', () => {
    const circle = ellipseTriangles(50, 50, 30, 30);
    expect(areaOf({ rects: [], triangles: circle }) / (Math.PI * 900)).toBeGreaterThan(0.99);
    const ellipse = ellipseTriangles(0, 0, 40, 10, 32);
    expect(ellipse).toHaveLength(32);
    expect(areaOf({ rects: [], triangles: ellipse }) / (Math.PI * 400)).toBeGreaterThan(0.99);
  });

  it('der Umriss hat jeden Punkt nur einmal und liegt auf dem Kreis', () => {
    const outline = ellipseOutline(0, 0, 20, 20, 24);
    expect(outline).toHaveLength(24);
    for (const point of outline) {
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(20, 9);
    }
  });
});
