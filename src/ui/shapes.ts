/**
 * Round shapes as a few flat pieces (M6, for speed). Phaser's Graphics turn
 * every arc into 100 points and cut every filled path into triangles again in
 * every frame; a rounded panel costs 400 points, a round button three times
 * 100 – that was most of the time of a frame. Here the same shapes are built
 * from rectangles and fans of triangles with only as many corners as the size
 * needs (pure maths, tested; {@link FastGraphics} draws them).
 */

export interface Pt {
  readonly x: number;
  readonly y: number;
}

export interface RectPiece {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type Triangle = readonly [Pt, Pt, Pt];

export interface Pieces {
  readonly rects: readonly RectPiece[];
  readonly triangles: readonly Triangle[];
}

/**
 * Corners of a whole circle of radius `radius`: enough that the edge is off by
 * less than about a quarter of a pixel at twice the size (a retina screen).
 */
export function circleSegments(radius: number): number {
  const r = Math.abs(radius);
  return Math.max(16, Math.min(72, Math.ceil(6 * Math.sqrt(r))));
}

/** Points on an ellipse around (cx, cy), `count` of them, starting at angle `from` and going `sweep` (radians); the last one ends the sweep. */
function arcPoints(cx: number, cy: number, rx: number, ry: number, from: number, sweep: number, count: number): Pt[] {
  const points: Pt[] = [];
  for (let i = 0; i <= count; i += 1) {
    const angle = from + (sweep * i) / count;
    points.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry });
  }
  return points;
}

/** A fan of triangles from `center` along `rim` (each two neighbouring rim points and the centre). */
function fan(center: Pt, rim: readonly Pt[]): Triangle[] {
  const triangles: Triangle[] = [];
  for (let i = 0; i + 1 < rim.length; i += 1) {
    const a = rim[i];
    const b = rim[i + 1];
    if (a && b) {
      triangles.push([center, a, b]);
    }
  }
  return triangles;
}

/** The radius a rounded rectangle can really have (never more than half its shorter side, never below 0). */
export function cornerRadius(width: number, height: number, radius: number): number {
  return Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2));
}

/** A filled rounded rectangle: three rectangles (middle, left, right) and a fan in each corner – the pieces do not overlap. */
export function roundRectPieces(x: number, y: number, width: number, height: number, radius: number): Pieces {
  const r = cornerRadius(width, height, radius);
  if (r <= 0) {
    return { rects: [{ x, y, width, height }], triangles: [] };
  }
  const n = Math.max(2, Math.ceil(circleSegments(r) / 4));
  const rects: RectPiece[] = [{ x: x + r, y, width: width - 2 * r, height }];
  if (height - 2 * r > 0) {
    rects.push({ x, y: y + r, width: r, height: height - 2 * r }, { x: x + width - r, y: y + r, width: r, height: height - 2 * r });
  }
  const corners: [number, number, number][] = [
    [x + r, y + r, Math.PI],
    [x + width - r, y + r, -Math.PI / 2],
    [x + width - r, y + height - r, 0],
    [x + r, y + height - r, Math.PI / 2],
  ];
  const triangles = corners.flatMap(([cx, cy, from]) => fan({ x: cx, y: cy }, arcPoints(cx, cy, r, r, from, Math.PI / 2, n)));
  return { rects: rects.filter((rect) => rect.width > 0 && rect.height > 0), triangles };
}

/** The outline of a rounded rectangle, clockwise from the top left corner (closed by the caller). */
export function roundRectOutline(x: number, y: number, width: number, height: number, radius: number): Pt[] {
  const r = cornerRadius(width, height, radius);
  if (r <= 0) {
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
  }
  const n = Math.max(2, Math.ceil(circleSegments(r) / 4));
  return [
    ...arcPoints(x + r, y + r, r, r, Math.PI, Math.PI / 2, n),
    ...arcPoints(x + width - r, y + r, r, r, -Math.PI / 2, Math.PI / 2, n),
    ...arcPoints(x + width - r, y + height - r, r, r, 0, Math.PI / 2, n),
    ...arcPoints(x + r, y + height - r, r, r, Math.PI / 2, Math.PI / 2, n),
  ];
}

/** A filled ellipse (a circle when `rx` = `ry`) as a fan of triangles; `segments` corners (default: by size). */
export function ellipseTriangles(cx: number, cy: number, rx: number, ry: number, segments?: number): Triangle[] {
  const n = Math.max(3, Math.floor(segments ?? circleSegments(Math.max(Math.abs(rx), Math.abs(ry)))));
  return fan({ x: cx, y: cy }, arcPoints(cx, cy, Math.abs(rx), Math.abs(ry), 0, Math.PI * 2, n));
}

/** The outline of an ellipse (without repeating the first point). */
export function ellipseOutline(cx: number, cy: number, rx: number, ry: number, segments?: number): Pt[] {
  const n = Math.max(3, Math.floor(segments ?? circleSegments(Math.max(Math.abs(rx), Math.abs(ry)))));
  return arcPoints(cx, cy, Math.abs(rx), Math.abs(ry), 0, Math.PI * 2, n).slice(0, n);
}
