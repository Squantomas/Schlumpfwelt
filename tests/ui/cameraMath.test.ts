import { describe, expect, it } from 'vitest';
import {
  approach,
  clampView,
  fitRect,
  growRect,
  panView,
  screenToWorld,
  startView,
  tileAtWorld,
  transformView,
  visibleRect,
  worldToScreen,
  zoomAt,
  zoomLimits,
  type CameraView,
  type Rect,
  type Size,
} from '../../src/ui/cameraMath';

const TILE = 64;
/** 48×48 Kacheln plus 2 Kacheln Wasser rundum. */
const BOUNDS: Rect = { x: -128, y: -128, width: 3072 + 256, height: 3072 + 256 };
const TABLET: Size = { width: 1024, height: 768 };
const PHONE_PORTRAIT: Size = { width: 400, height: 800 };

function limitsFor(size: Size) {
  return zoomLimits(size, BOUNDS, TILE, 128);
}

describe('zoomLimits', () => {
  it('kleinster Zoom: die ganze Fläche passt auf den Schirm', () => {
    const limits = limitsFor(TABLET);
    expect(limits.min).toBeCloseTo(768 / 3328, 10);
    expect(BOUNDS.width * limits.min).toBeLessThanOrEqual(TABLET.width);
    expect(BOUNDS.height * limits.min).toBeLessThanOrEqual(TABLET.height + 1e-9);
  });

  it('größter Zoom: eine Kachel ist 128 CSS-Pixel groß', () => {
    expect(limitsFor(TABLET).max).toBe(2);
    expect(TILE * limitsFor(TABLET).max).toBe(128);
  });

  it('im Hochformat bestimmt die Breite den kleinsten Zoom', () => {
    expect(limitsFor(PHONE_PORTRAIT).min).toBeCloseTo(400 / 3328, 10);
  });

  it('der größte Zoom ist nie kleiner als der kleinste', () => {
    const huge: Size = { width: 100000, height: 100000 };
    const limits = limitsFor(huge);
    expect(limits.max).toBeGreaterThanOrEqual(limits.min);
  });

  it('übersteht einen Schirm der Größe 0', () => {
    const limits = zoomLimits({ width: 0, height: 0 }, BOUNDS, TILE, 128);
    expect(limits.min).toBeGreaterThan(0);
    expect(limits.max).toBeGreaterThanOrEqual(limits.min);
  });
});

describe('screenToWorld und worldToScreen', () => {
  const view: CameraView = { centerX: 500, centerY: 300, zoom: 2 };

  it('die Bildschirmmitte ist der Kamera-Mittelpunkt', () => {
    expect(screenToWorld(view, TABLET, { x: 512, y: 384 })).toEqual({ x: 500, y: 300 });
  });

  it('rechnet mit dem Zoom', () => {
    expect(screenToWorld(view, TABLET, { x: 512 + 100, y: 384 - 50 })).toEqual({ x: 550, y: 275 });
  });

  it('ist umkehrbar', () => {
    const world = { x: 123.5, y: 987.25 };
    const back = screenToWorld(view, TABLET, worldToScreen(view, TABLET, world));
    expect(back.x).toBeCloseTo(world.x, 9);
    expect(back.y).toBeCloseTo(world.y, 9);
  });
});

describe('visibleRect, growRect, fitRect', () => {
  it('visibleRect zeigt den sichtbaren Weltausschnitt', () => {
    expect(visibleRect({ centerX: 100, centerY: 50, zoom: 2 }, { width: 200, height: 100 })).toEqual({
      x: 50,
      y: 25,
      width: 100,
      height: 50,
    });
  });

  it('growRect fügt an jeder Seite Rand hinzu', () => {
    expect(growRect({ x: 10, y: 20, width: 100, height: 50 }, 5)).toEqual({ x: 5, y: 15, width: 110, height: 60 });
  });

  it('fitRect zentriert und lässt den Rand frei', () => {
    const view = fitRect({ width: 1000, height: 500 }, { x: 0, y: 0, width: 400, height: 400 }, 50);
    expect(view.centerX).toBe(200);
    expect(view.centerY).toBe(200);
    expect(view.zoom).toBeCloseTo(400 / 400, 10);
  });
});

describe('clampView', () => {
  it('lässt eine gültige Ansicht unverändert', () => {
    const view: CameraView = { centerX: 1500, centerY: 1500, zoom: 1 };
    expect(clampView(view, TABLET, BOUNDS, limitsFor(TABLET))).toEqual(view);
  });

  it('begrenzt den Zoom nach unten und oben', () => {
    const limits = limitsFor(TABLET);
    expect(clampView({ centerX: 1500, centerY: 1500, zoom: 0.001 }, TABLET, BOUNDS, limits).zoom).toBe(limits.min);
    expect(clampView({ centerX: 1500, centerY: 1500, zoom: 50 }, TABLET, BOUNDS, limits).zoom).toBe(limits.max);
  });

  it('zeigt nie etwas außerhalb der Grenzen (links oben)', () => {
    const view = clampView({ centerX: -5000, centerY: -5000, zoom: 1 }, TABLET, BOUNDS, limitsFor(TABLET));
    const seen = visibleRect(view, TABLET);
    expect(seen.x).toBeCloseTo(BOUNDS.x, 9);
    expect(seen.y).toBeCloseTo(BOUNDS.y, 9);
  });

  it('zeigt nie etwas außerhalb der Grenzen (rechts unten)', () => {
    const view = clampView({ centerX: 99999, centerY: 99999, zoom: 1 }, TABLET, BOUNDS, limitsFor(TABLET));
    const seen = visibleRect(view, TABLET);
    expect(seen.x + seen.width).toBeCloseTo(BOUNDS.x + BOUNDS.width, 9);
    expect(seen.y + seen.height).toBeCloseTo(BOUNDS.y + BOUNDS.height, 9);
  });

  it('zentriert die Fläche auf der Achse, auf der sie kleiner als der Schirm ist', () => {
    const limits = limitsFor(TABLET);
    const view = clampView({ centerX: 0, centerY: 0, zoom: limits.min }, TABLET, BOUNDS, limits);
    // Höhe passt genau, in der Breite ist Platz: zentriert.
    expect(view.centerX).toBeCloseTo(BOUNDS.x + BOUNDS.width / 2, 9);
    expect(view.centerY).toBeCloseTo(BOUNDS.y + BOUNDS.height / 2, 9);
  });

  it('die Insel kann nie aus dem Bild verschwinden: beim kleinsten Zoom ist die ganze Fläche sichtbar', () => {
    for (const size of [TABLET, PHONE_PORTRAIT, { width: 1920, height: 1080 }]) {
      const limits = limitsFor(size);
      const view = clampView({ centerX: 9999, centerY: -9999, zoom: 0 }, size, BOUNDS, limits);
      const seen = visibleRect(view, size);
      expect(seen.x).toBeLessThanOrEqual(BOUNDS.x + 1e-9);
      expect(seen.y).toBeLessThanOrEqual(BOUNDS.y + 1e-9);
      expect(seen.x + seen.width).toBeGreaterThanOrEqual(BOUNDS.x + BOUNDS.width - 1e-9);
      expect(seen.y + seen.height).toBeGreaterThanOrEqual(BOUNDS.y + BOUNDS.height - 1e-9);
    }
  });

  it('übersteht ungültige Zoomwerte', () => {
    const limits = limitsFor(TABLET);
    expect(clampView({ centerX: 0, centerY: 0, zoom: Number.NaN }, TABLET, BOUNDS, limits).zoom).toBe(limits.min);
  });
});

describe('panView', () => {
  const limits = limitsFor(TABLET);

  it('Ziehen nach rechts verschiebt die Kamera nach links (Bild folgt dem Finger)', () => {
    const view: CameraView = { centerX: 1500, centerY: 1500, zoom: 1 };
    const moved = panView(view, TABLET, BOUNDS, limits, 100, 0);
    expect(moved.centerX).toBe(1400);
    expect(moved.centerY).toBe(1500);
  });

  it('teilt durch den Zoom: 100 px Ziehen bei Zoom 2 sind 50 Weltpixel', () => {
    const view: CameraView = { centerX: 1500, centerY: 1500, zoom: 2 };
    expect(panView(view, TABLET, BOUNDS, limits, 0, -100).centerY).toBe(1550);
  });

  it('stoppt an der Grenze', () => {
    const view: CameraView = { centerX: 1500, centerY: 1500, zoom: 2 };
    const moved = panView(view, TABLET, BOUNDS, limits, 1e6, 1e6);
    const seen = visibleRect(moved, TABLET);
    expect(seen.x).toBeCloseTo(BOUNDS.x, 9);
    expect(seen.y).toBeCloseTo(BOUNDS.y, 9);
  });
});

describe('transformView und zoomAt', () => {
  const limits = limitsFor(TABLET);
  const start: CameraView = { centerX: 1500, centerY: 1400, zoom: 0.5 };

  it('Zoom um einen Bildschirmpunkt lässt die Welt darunter stehen', () => {
    const anchor = { x: 300, y: 200 };
    const before = screenToWorld(start, TABLET, anchor);
    const zoomed = zoomAt(start, TABLET, BOUNDS, limits, anchor, 1);
    expect(zoomed.zoom).toBe(1);
    const after = screenToWorld(zoomed, TABLET, anchor);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('Pinch: der Weltpunkt unter der alten Fingermitte wandert mit der Fingermitte', () => {
    const from = { x: 400, y: 300 };
    const to = { x: 450, y: 340 };
    const before = screenToWorld(start, TABLET, from);
    const result = transformView(start, TABLET, BOUNDS, limits, from, to, 1.6);
    expect(result.zoom).toBeCloseTo(0.8, 10);
    const after = screenToWorld(result, TABLET, to);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('Faktor 1 mit gleichem Anfang und Ende ändert nichts', () => {
    const same = transformView(start, TABLET, BOUNDS, limits, { x: 10, y: 10 }, { x: 10, y: 10 }, 1);
    expect(same.zoom).toBe(start.zoom);
    expect(same.centerX).toBeCloseTo(start.centerX, 9);
    expect(same.centerY).toBeCloseTo(start.centerY, 9);
  });

  it('hält den Zoom in den Grenzen', () => {
    expect(transformView(start, TABLET, BOUNDS, limits, { x: 0, y: 0 }, { x: 0, y: 0 }, 1000).zoom).toBe(limits.max);
    expect(transformView(start, TABLET, BOUNDS, limits, { x: 0, y: 0 }, { x: 0, y: 0 }, 0.0001).zoom).toBe(limits.min);
  });

  it('ignoriert ungültige Faktoren', () => {
    expect(transformView(start, TABLET, BOUNDS, limits, { x: 0, y: 0 }, { x: 0, y: 0 }, Number.NaN).zoom).toBe(0.5);
    expect(transformView(start, TABLET, BOUNDS, limits, { x: 0, y: 0 }, { x: 0, y: 0 }, -2).zoom).toBe(0.5);
  });

  it('Herauszoomen am Rand bleibt in den Grenzen', () => {
    const corner: CameraView = { centerX: -128 + 512 / 2, centerY: -128 + 384 / 2, zoom: 2 };
    const out = zoomAt(corner, TABLET, BOUNDS, limits, { x: 0, y: 0 }, 0.5);
    const seen = visibleRect(out, TABLET);
    expect(seen.x).toBeGreaterThanOrEqual(BOUNDS.x - 1e-9);
    expect(seen.y).toBeGreaterThanOrEqual(BOUNDS.y - 1e-9);
  });
});

describe('tileAtWorld', () => {
  const map: Size = { width: 48, height: 48 };

  it('findet die Kachel unter einem Weltpunkt', () => {
    expect(tileAtWorld({ x: 0, y: 0 }, TILE, map)).toEqual({ x: 0, y: 0 });
    expect(tileAtWorld({ x: 63.9, y: 64 }, TILE, map)).toEqual({ x: 0, y: 1 });
    expect(tileAtWorld({ x: 3071, y: 3071 }, TILE, map)).toEqual({ x: 47, y: 47 });
  });

  it('liefert außerhalb der Karte nichts', () => {
    expect(tileAtWorld({ x: -1, y: 10 }, TILE, map)).toBeUndefined();
    expect(tileAtWorld({ x: 10, y: -0.1 }, TILE, map)).toBeUndefined();
    expect(tileAtWorld({ x: 3072, y: 10 }, TILE, map)).toBeUndefined();
    expect(tileAtWorld({ x: 10, y: 3072 }, TILE, map)).toBeUndefined();
    expect(tileAtWorld({ x: Number.NaN, y: 10 }, TILE, map)).toBeUndefined();
  });
});

describe('approach', () => {
  it('kommt dem Ziel näher, ohne es zu überschreiten', () => {
    const next = approach(0, 10, 16, 100);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(10);
  });

  it('erreicht nach der Zeitkonstante etwa 63 %', () => {
    expect(approach(0, 1, 100, 100)).toBeCloseTo(1 - Math.exp(-1), 10);
  });

  it('ist unabhängig von der Bildrate', () => {
    let a = 0;
    for (let i = 0; i < 10; i += 1) {
      a = approach(a, 1, 10, 100);
    }
    expect(a).toBeCloseTo(approach(0, 1, 100, 100), 10);
  });

  it('bleibt bei Zeit 0 stehen und springt bei Zeitkonstante 0 zum Ziel', () => {
    expect(approach(3, 10, 0, 100)).toBe(3);
    expect(approach(3, 10, 16, 0)).toBe(10);
  });
});

describe('startView', () => {
  const focus = { x: 448, y: 448, width: 2176, height: 2176 };

  it('ist ohne Mindestgröße wie fitRect', () => {
    expect(startView({ width: 360, height: 640 }, focus, 12, 64)).toEqual(fitRect({ width: 360, height: 640 }, focus, 12));
  });

  it('zoomt auf einem kleinen Schirm auf die Mindestgröße der Kachel und schaut aufs Dorf', () => {
    const view = startView({ width: 360, height: 640 }, focus, 12, 64, 32, { x: 1536, y: 1536 });
    expect(view.zoom * 64).toBeCloseTo(32, 9);
    expect(view.centerX).toBe(1536);
    expect(view.centerY).toBe(1536);
  });

  it('lässt einen Schirm, auf dem die Kacheln schon groß genug sind, unverändert', () => {
    const roomy = { x: 0, y: 0, width: 512, height: 512 };
    expect(startView({ width: 1024, height: 768 }, roomy, 12, 64, 32, { x: 9, y: 9 })).toEqual(fitRect({ width: 1024, height: 768 }, roomy, 12));
  });
});
