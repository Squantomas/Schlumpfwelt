import { STYLE } from '../ui/style';

/**
 * A tiny way to write SVG pictures in TypeScript (M9). Every picture of the game is a small SVG document built from
 * the colour tokens of `src/ui/style.ts` (no colour is written into a picture by hand): round shapes, a soft coloured
 * outline (a darker shade of the fill, never black), light from the top left and a soft shadow towards the bottom
 * right – see `docs/STIL_LEITFADEN.md`. Pure strings, no browser: the pictures can be tested in Node and are turned
 * into textures by the scene (`src/scenes/art/artLoader.ts`).
 */

/** A colour: `0xrrggbb`, or a ready paint such as a gradient `url(#g0)`. */
export type Fill = number | string;

export interface Paint {
  readonly fill?: Fill;
  /** Outline colour; `true` = the outline of the fill colour (see {@link outlineOf}). */
  readonly stroke?: Fill | true;
  /** Outline width in logical px (default {@link STYLE.line}). */
  readonly width?: number;
  readonly opacity?: number;
  /** Draws the outline under the fill (the line keeps its full width outside, the shape is not made thinner). */
  readonly under?: boolean;
  readonly cap?: 'round' | 'butt';
}

export function hex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** Mixes two colours: `t = 0` gives `a`, `t = 1` gives `b`. */
export function mix(a: number, b: number, t: number): number {
  const channel = (shift: number): number => {
    const from = (a >> shift) & 0xff;
    const to = (b >> shift) & 0xff;
    return Math.round(from + (to - from) * t) & 0xff;
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** A darker shade of a colour (towards the ink of the outlines). */
export function darker(color: number, amount: number): number {
  return mix(color, STYLE.ink, amount);
}

/** A lighter tint of a colour (towards the warm light). */
export function lighter(color: number, amount: number): number {
  return mix(color, STYLE.light, amount);
}

/** The outline of a shape: its own colour, much darker – friendlier than black and still clear on every ground. */
export function outlineOf(fill: Fill): number {
  return typeof fill === 'number' ? darker(fill, STYLE.outlineMix) : STYLE.ink;
}

function num(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function fillValue(fill: Fill | undefined): string {
  if (fill === undefined) {
    return 'none';
  }
  return typeof fill === 'number' ? hex(fill) : fill;
}

function paintAttrs(paint: Paint): string {
  const parts = [`fill="${fillValue(paint.fill)}"`];
  if (paint.stroke !== undefined) {
    const color = paint.stroke === true ? outlineOf(paint.fill ?? STYLE.ink) : paint.stroke;
    parts.push(
      `stroke="${fillValue(color)}"`,
      `stroke-width="${num((paint.width ?? STYLE.line) * (paint.under === false ? 1 : 2))}"`,
      'stroke-linejoin="round"',
      `stroke-linecap="${paint.cap ?? 'round'}"`,
    );
    if (paint.under !== false) {
      parts.push('paint-order="stroke"');
    }
  }
  if (paint.opacity !== undefined && paint.opacity < 1) {
    parts.push(`opacity="${num(paint.opacity)}"`);
  }
  return parts.join(' ');
}

export function circle(cx: number, cy: number, r: number, paint: Paint): string {
  return `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" ${paintAttrs(paint)}/>`;
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, paint: Paint, rotateDeg = 0): string {
  const turn = rotateDeg === 0 ? '' : ` transform="rotate(${num(rotateDeg)} ${num(cx)} ${num(cy)})"`;
  return `<ellipse cx="${num(cx)}" cy="${num(cy)}" rx="${num(rx)}" ry="${num(ry)}"${turn} ${paintAttrs(paint)}/>`;
}

export function rect(x: number, y: number, w: number, h: number, r: number, paint: Paint): string {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  return `<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" rx="${num(radius)}" ${paintAttrs(paint)}/>`;
}

export function path(d: string, paint: Paint): string {
  return `<path d="${d}" ${paintAttrs(paint)}/>`;
}

/** A line (or zigzag) through the points: only an outline, no fill. */
export function line(points: readonly (readonly [number, number])[], color: Fill, width: number, opacity = 1): string {
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${num(x)} ${num(y)}`).join(' ');
  const alpha = opacity < 1 ? ` opacity="${num(opacity)}"` : '';
  return `<path d="${d}" fill="none" stroke="${fillValue(color)}" stroke-width="${num(width)}" stroke-linecap="round" stroke-linejoin="round"${alpha}/>`;
}

export function polygon(points: readonly (readonly [number, number])[], paint: Paint): string {
  return `<polygon points="${points.map(([x, y]) => `${num(x)},${num(y)}`).join(' ')}" ${paintAttrs(paint)}/>`;
}

export function group(children: readonly string[], options: { readonly transform?: string; readonly opacity?: number } = {}): string {
  const attrs = [options.transform ? ` transform="${options.transform}"` : '', options.opacity !== undefined && options.opacity < 1 ? ` opacity="${num(options.opacity)}"` : ''].join('');
  return `<g${attrs}>${children.join('')}</g>`;
}

/** Path helpers: `M`, a smooth curve and the like, with rounded numbers. */
export const d = {
  m: (x: number, y: number): string => `M${num(x)} ${num(y)}`,
  l: (x: number, y: number): string => `L${num(x)} ${num(y)}`,
  q: (cx: number, cy: number, x: number, y: number): string => `Q${num(cx)} ${num(cy)} ${num(x)} ${num(y)}`,
  c: (c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): string => `C${num(c1x)} ${num(c1y)} ${num(c2x)} ${num(c2y)} ${num(x)} ${num(y)}`,
  a: (rx: number, ry: number, large: boolean, sweep: boolean, x: number, y: number): string => `A${num(rx)} ${num(ry)} 0 ${large ? 1 : 0} ${sweep ? 1 : 0} ${num(x)} ${num(y)}`,
  z: 'Z',
};

/**
 * One SVG document: a logical size (world or CSS px – the size the picture has in the game) and a list of shapes;
 * gradients go into `<defs>` with ids that are unique in this document.
 */
export class Svg {
  private readonly defs: string[] = [];
  private readonly body: string[] = [];
  private next = 0;
  private children = 0;

  constructor(
    readonly width: number,
    readonly height: number,
    private readonly prefix = 'g',
  ) {}

  private newId(): string {
    const id = `${this.prefix}${String(this.next)}`;
    this.next += 1;
    return id;
  }

  /** A picture of its own size to be put into this one with {@link place} (its gradient ids do not clash). */
  inner(width: number, height: number): Svg {
    this.children += 1;
    return new Svg(width, height, `${this.prefix}${String(this.children)}_`);
  }

  /** Puts a picture made with {@link inner} at (x, y), `scale` times its size. */
  place(picture: Svg, x: number, y: number, scale = 1): this {
    this.defs.push(...picture.defs);
    this.body.push(group(picture.body, { transform: `translate(${num(x)} ${num(y)})${scale === 1 ? '' : ` scale(${num(scale)})`}` }));
    return this;
  }

  /** A top-to-bottom gradient (light on top: the light comes from above). Returns the paint. */
  vertical(top: number, bottom: number, y1 = 0, y2 = 1): string {
    const id = this.newId();
    this.defs.push(
      `<linearGradient id="${id}" x1="0" y1="${num(y1)}" x2="0" y2="${num(y2)}"><stop offset="0" stop-color="${hex(top)}"/><stop offset="1" stop-color="${hex(bottom)}"/></linearGradient>`,
    );
    return `url(#${id})`;
  }

  /**
   * A gradient between two points of the picture (logical px): one gradient over several shapes, such as all the
   * circles of a tree crown (light at the first point, shade at the second).
   */
  across(x1: number, y1: number, x2: number, y2: number, from: number, to: number): string {
    const id = this.newId();
    this.defs.push(
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}"><stop offset="0" stop-color="${hex(from)}"/><stop offset="1" stop-color="${hex(to)}"/></linearGradient>`,
    );
    return `url(#${id})`;
  }

  /** A gradient from the top left (light) to the bottom right (shade). */
  diagonal(light: number, shade: number): string {
    const id = this.newId();
    this.defs.push(
      `<linearGradient id="${id}" x1="0.15" y1="0.1" x2="0.85" y2="0.95"><stop offset="0" stop-color="${hex(light)}"/><stop offset="1" stop-color="${hex(shade)}"/></linearGradient>`,
    );
    return `url(#${id})`;
  }

  /** A round gradient whose bright spot sits up and to the left (a ball lit from the top left). */
  ball(light: number, shade: number): string {
    const id = this.newId();
    this.defs.push(
      `<radialGradient id="${id}" cx="0.35" cy="0.3" r="0.75"><stop offset="0" stop-color="${hex(light)}"/><stop offset="1" stop-color="${hex(shade)}"/></radialGradient>`,
    );
    return `url(#${id})`;
  }

  /** A soft round glow that fades out to the rim (lamp light, the moon). */
  glow(color: number, alpha: number): string {
    const id = this.newId();
    this.defs.push(
      `<radialGradient id="${id}"><stop offset="0" stop-color="${hex(color)}" stop-opacity="${num(alpha)}"/><stop offset="1" stop-color="${hex(color)}" stop-opacity="0"/></radialGradient>`,
    );
    return `url(#${id})`;
  }

  add(...parts: readonly string[]): this {
    this.body.push(...parts);
    return this;
  }

  /** The document, `scale` pixels per logical px (the texture is that much bigger than the picture in the game). */
  toString(scale = 1): string {
    const defs = this.defs.length > 0 ? `<defs>${this.defs.join('')}</defs>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${num(this.width * scale)}" height="${num(this.height * scale)}" viewBox="0 0 ${num(this.width)} ${num(this.height)}">${defs}${this.body.join('')}</svg>`;
  }
}

/** The soft shadow of a thing standing at (x, y): an ellipse a little to the right (the light comes from the top left). */
export function shadow(x: number, y: number, rx: number, ry: number, strength = 1): string {
  return ellipse(x + rx * STYLE.shadowShift, y, rx, ry, { fill: STYLE.shadow, opacity: STYLE.shadowAlpha * strength });
}

/**
 * A cluster of circles (a crown, a bush, a cloud) with one shared outline: first all circles a little bigger in the
 * outline colour, then the fills on top – the outline runs only around the whole shape.
 */
export function cluster(circles: readonly (readonly [number, number, number])[], fill: Fill, outline: Fill, width: number = STYLE.line): string {
  return [...circles.map(([x, y, r]) => circle(x, y, r + width, { fill: outline })), ...circles.map(([x, y, r]) => circle(x, y, r, { fill }))].join('');
}

/** Seamless patterns: an element near an edge of a `size` tile is drawn again on the other side, so tiles join. */
export function wrapped(x: number, y: number, reach: number, size: number, draw: (x: number, y: number) => string): string {
  const parts: string[] = [];
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      const px = x + dx;
      const py = y + dy;
      if (px + reach >= 0 && px - reach <= size && py + reach >= 0 && py - reach <= size) {
        parts.push(draw(px, py));
      }
    }
  }
  return parts.join('');
}
