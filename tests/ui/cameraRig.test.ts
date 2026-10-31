import { beforeEach, describe, expect, it } from 'vitest';
import { screenToWorld, visibleRect, type Rect, type Size } from '../../src/ui/cameraMath';
import { CameraRig } from '../../src/ui/cameraRig';

const TILE = 64;
const MAP: Rect = { x: 0, y: 0, width: 3072, height: 3072 };
const BOUNDS: Rect = { x: -128, y: -128, width: 3328, height: 3328 };
/** Die Insel: grob 34×34 Kacheln in der Mitte. */
const FOCUS: Rect = { x: 7 * TILE, y: 7 * TILE, width: 34 * TILE, height: 34 * TILE };
const TABLET: Size = { width: 1024, height: 768 };

let rig: CameraRig;

function makeRig(): CameraRig {
  return new CameraRig({ bounds: BOUNDS, focus: FOCUS, focusPadding: 24, tileSize: TILE, maxTileCssPx: 128 });
}

function runFor(ms: number, step = 16): void {
  for (let t = 0; t < ms; t += step) {
    rig.update(step);
  }
}

beforeEach(() => {
  rig = makeRig();
  rig.resize(TABLET);
});

describe('Startansicht auf kleinen Schirmen', () => {
  const VILLAGE = { x: 24 * TILE, y: 24 * TILE };
  const makeStartRig = (): CameraRig =>
    new CameraRig({ bounds: BOUNDS, focus: FOCUS, focusPadding: 24, tileSize: TILE, maxTileCssPx: 128, minStartTileCssPx: 32, startCenter: VILLAGE });

  it.each([[360, 640], [320, 568], [568, 320], [375, 667], [1024, 768], [768, 1024], [1280, 800]] as const)('zeigt bei %i×%i eine Kachel von mindestens 32 CSS-px', (width, height) => {
    const small = makeStartRig();
    small.resize({ width, height });
    expect(small.view.zoom * TILE).toBeGreaterThanOrEqual(32 - 1e-9);
  });

  it('zentriert die Startansicht eines Handys aufs Startdorf, statt die ganze Insel winzig zu zeigen', () => {
    const phone = makeStartRig();
    phone.resize({ width: 360, height: 640 });
    expect(phone.view.centerX).toBeCloseTo(VILLAGE.x, 6);
    expect(phone.view.centerY).toBeCloseTo(VILLAGE.y, 6);
    const seen = visibleRect(phone.view, { width: 360, height: 640 });
    // Das Dorf (Haus, Garten, Markt in etwa 8 × 6 Kacheln) ist ganz im Bild.
    expect(seen.x).toBeLessThan(VILLAGE.x - 4 * TILE);
    expect(seen.x + seen.width).toBeGreaterThan(VILLAGE.x + 4 * TILE);
    expect(seen.y).toBeLessThan(VILLAGE.y - 3 * TILE);
  });

  it('lässt weiter das Herauszoomen und die Grenzen zu', () => {
    const phone = makeStartRig();
    phone.resize({ width: 360, height: 640 });
    const start = phone.view.zoom;
    phone.zoomBy(0.1, { x: 180, y: 320 });
    for (let t = 0; t < 2000; t += 16) {
      phone.update(16);
    }
    expect(phone.view.zoom).toBeLessThan(start);
    expect(phone.view.zoom).toBeGreaterThanOrEqual(phone.limits.min - 1e-9);
    const seen = visibleRect(phone.view, { width: 360, height: 640 });
    expect(seen.x).toBeGreaterThanOrEqual(BOUNDS.x - 1e-6);
  });

  it('geht mit reset() auf dieselbe Startansicht zurück', () => {
    const phone = makeStartRig();
    phone.resize({ width: 360, height: 640 });
    const start = { ...phone.view };
    phone.pan(-300, -200);
    phone.reset();
    expect(phone.view).toEqual(start);
  });

  it('ändert Schirme, auf denen die ganze Insel schon große Kacheln hat, nicht', () => {
    const roomy = new CameraRig({ bounds: BOUNDS, focus: { x: 20 * TILE, y: 20 * TILE, width: 8 * TILE, height: 8 * TILE }, focusPadding: 24, tileSize: TILE, maxTileCssPx: 128, minStartTileCssPx: 32, startCenter: VILLAGE });
    roomy.resize(TABLET);
    const plain = new CameraRig({ bounds: BOUNDS, focus: { x: 20 * TILE, y: 20 * TILE, width: 8 * TILE, height: 8 * TILE }, focusPadding: 24, tileSize: TILE, maxTileCssPx: 128 });
    plain.resize(TABLET);
    expect(roomy.view).toEqual(plain.view);
  });
});

describe('Startansicht', () => {
  it('zeigt die ganze Insel zentriert', () => {
    const seen = visibleRect(rig.view, TABLET);
    expect(seen.x).toBeLessThanOrEqual(FOCUS.x);
    expect(seen.y).toBeLessThanOrEqual(FOCUS.y);
    expect(seen.x + seen.width).toBeGreaterThanOrEqual(FOCUS.x + FOCUS.width);
    expect(seen.y + seen.height).toBeGreaterThanOrEqual(FOCUS.y + FOCUS.height);
    expect(rig.view.centerX).toBeCloseTo(MAP.width / 2, 6);
    expect(rig.view.centerY).toBeCloseTo(MAP.height / 2, 6);
  });

  it('liegt im erlaubten Zoombereich', () => {
    expect(rig.view.zoom).toBeGreaterThanOrEqual(rig.limits.min);
    expect(rig.view.zoom).toBeLessThanOrEqual(rig.limits.max);
  });
});

describe('Ziehen', () => {
  it('verschiebt das Bild mit dem Finger, wenn herangezoomt', () => {
    rig.pinch({ x: 512, y: 384 }, { x: 512, y: 384 }, 4);
    const before = screenToWorld(rig.view, TABLET, { x: 300, y: 300 });
    rig.pan(80, -40);
    const after = screenToWorld(rig.view, TABLET, { x: 380, y: 260 });
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('stoppt an der Grenze und bleibt dort', () => {
    rig.pinch({ x: 512, y: 384 }, { x: 512, y: 384 }, 4);
    rig.pan(1e6, 1e6);
    const seen = visibleRect(rig.view, TABLET);
    expect(seen.x).toBeCloseTo(BOUNDS.x, 6);
    expect(seen.y).toBeCloseTo(BOUNDS.y, 6);
    rig.pan(500, 500);
    expect(visibleRect(rig.view, TABLET).x).toBeCloseTo(BOUNDS.x, 6);
  });

  it('beim kleinsten Zoom lässt sich nichts verschieben', () => {
    rig.pinch({ x: 512, y: 384 }, { x: 512, y: 384 }, 0.0001);
    const before = rig.view;
    rig.pan(300, 200);
    expect(rig.view.centerY).toBeCloseTo(before.centerY, 6);
    expect(rig.view.zoom).toBe(rig.limits.min);
  });
});

describe('Weicher Zoom (Mausrad, Knöpfe)', () => {
  it('nähert sich dem Ziel an und erreicht es', () => {
    const start = rig.view.zoom;
    rig.zoomBy(1.6, { x: 512, y: 384 });
    expect(rig.animating).toBe(true);
    rig.update(16);
    expect(rig.view.zoom).toBeGreaterThan(start);
    expect(rig.view.zoom).toBeLessThan(start * 1.6);
    runFor(1500);
    expect(rig.view.zoom).toBeCloseTo(start * 1.6, 6);
    expect(rig.animating).toBe(false);
  });

  it('mehrere Schritte addieren sich', () => {
    const start = rig.view.zoom;
    rig.zoomBy(1.5, { x: 512, y: 384 });
    rig.zoomBy(1.5, { x: 512, y: 384 });
    runFor(1500);
    expect(rig.view.zoom).toBeCloseTo(start * 2.25, 6);
  });

  it('lässt den Punkt unter dem Anker stehen', () => {
    rig.pinch({ x: 512, y: 384 }, { x: 512, y: 384 }, 3);
    const anchor = { x: 200, y: 600 };
    const before = screenToWorld(rig.view, TABLET, anchor);
    rig.zoomBy(1.5, anchor);
    for (let i = 0; i < 20; i += 1) {
      rig.update(16);
      const now = screenToWorld(rig.view, TABLET, anchor);
      expect(now.x).toBeCloseTo(before.x, 4);
      expect(now.y).toBeCloseTo(before.y, 4);
    }
  });

  it('stoppt an den Zoom-Grenzen', () => {
    rig.zoomBy(1000, { x: 512, y: 384 });
    runFor(3000);
    expect(rig.view.zoom).toBeCloseTo(rig.limits.max, 6);
    expect(rig.view.zoom * TILE).toBeCloseTo(128, 3);
    rig.zoomBy(0.0001, { x: 512, y: 384 });
    runFor(5000);
    expect(rig.view.zoom).toBeCloseTo(rig.limits.min, 6);
    expect(rig.animating).toBe(false);
  });

  it('ignoriert ungültige Faktoren', () => {
    const start = rig.view.zoom;
    rig.zoomBy(Number.NaN, { x: 0, y: 0 });
    rig.zoomBy(-1, { x: 0, y: 0 });
    rig.zoomBy(0, { x: 0, y: 0 });
    runFor(500);
    expect(rig.view.zoom).toBe(start);
  });

  it('ein neuer Griff mit dem Finger bricht den Zoom ab', () => {
    rig.zoomBy(3, { x: 512, y: 384 });
    rig.update(16);
    rig.stop();
    const frozen = rig.view.zoom;
    runFor(500);
    expect(rig.view.zoom).toBe(frozen);
  });
});

describe('Nachgleiten', () => {
  beforeEach(() => {
    rig.pinch({ x: 512, y: 384 }, { x: 512, y: 384 }, 4);
  });

  it('gleitet weiter und kommt zur Ruhe', () => {
    const start = rig.view.centerX;
    rig.fling(-1, 0);
    expect(rig.animating).toBe(true);
    runFor(200);
    expect(rig.view.centerX).toBeGreaterThan(start);
    runFor(5000);
    expect(rig.animating).toBe(false);
    const rest = rig.view.centerX;
    runFor(500);
    expect(rig.view.centerX).toBe(rest);
  });

  it('wird langsamer', () => {
    rig.fling(-2, 0);
    const a = rig.view.centerX;
    runFor(160);
    const b = rig.view.centerX;
    runFor(160);
    const c = rig.view.centerX;
    runFor(160);
    const d = rig.view.centerX;
    expect(c - b).toBeLessThan(b - a);
    expect(d - c).toBeLessThan(c - b);
  });

  it('läuft gegen die Grenze und stoppt dort', () => {
    rig.pinch({ x: 512, y: 384 }, { x: 512, y: 384 }, 0.5);
    rig.fling(4, 4);
    runFor(8000);
    const seen = visibleRect(rig.view, TABLET);
    expect(seen.x).toBeCloseTo(BOUNDS.x, 6);
    expect(seen.y).toBeCloseTo(BOUNDS.y, 6);
    expect(rig.animating).toBe(false);
  });

  it('meldet das Nachgleiten (gliding), bis es zur Ruhe kommt oder angehalten wird', () => {
    expect(rig.gliding).toBe(false);
    rig.fling(-2, 0);
    expect(rig.gliding).toBe(true);
    rig.stop();
    expect(rig.gliding).toBe(false);
    rig.fling(-2, 0);
    runFor(8000);
    expect(rig.gliding).toBe(false);
  });

  it('ein weicher Zoom zählt nicht als Nachgleiten', () => {
    rig.zoomBy(1.5, { x: 512, y: 384 });
    expect(rig.gliding).toBe(false);
  });

  it('ein Griff mit dem Finger hält es an', () => {
    rig.fling(-2, 0);
    runFor(48);
    rig.stop();
    const stopped = rig.view.centerX;
    runFor(500);
    expect(rig.view.centerX).toBe(stopped);
  });

  it('Ziehen mit dem Finger stoppt das Nachgleiten', () => {
    rig.fling(-2, 0);
    rig.pan(0, 0);
    expect(rig.animating).toBe(false);
  });
});

describe('Größenänderung und Drehen', () => {
  it('wendet die Grenzen neu an', () => {
    rig.pinch({ x: 512, y: 384 }, { x: 512, y: 384 }, 4);
    rig.pan(1e6, 1e6);
    rig.resize({ width: 768, height: 1024 });
    const seen = visibleRect(rig.view, { width: 768, height: 1024 });
    expect(seen.x).toBeGreaterThanOrEqual(BOUNDS.x - 1e-6);
    expect(seen.y).toBeGreaterThanOrEqual(BOUNDS.y - 1e-6);
    expect(seen.x + seen.width).toBeLessThanOrEqual(BOUNDS.x + BOUNDS.width + 1e-6);
    expect(seen.y + seen.height).toBeLessThanOrEqual(BOUNDS.y + BOUNDS.height + 1e-6);
  });

  it('hebt den Zoom an, wenn der Schirm größer wird und die Fläche sonst nicht mehr füllt', () => {
    rig.pinch({ x: 512, y: 384 }, { x: 512, y: 384 }, 0.0001);
    const small = rig.view.zoom;
    rig.resize({ width: 2048, height: 1536 });
    expect(rig.view.zoom).toBeCloseTo(small * 2, 6);
  });

  it('behält Position und Zoom, wenn alles noch passt', () => {
    rig.pinch({ x: 512, y: 384 }, { x: 512, y: 384 }, 3);
    rig.pan(60, 30);
    const before = rig.view;
    rig.resize({ width: 1000, height: 760 });
    expect(rig.view.zoom).toBe(before.zoom);
    expect(rig.view.centerX).toBeCloseTo(before.centerX, 6);
    expect(rig.view.centerY).toBeCloseTo(before.centerY, 6);
  });

  it('reset geht zurück zur Startansicht', () => {
    const start = rig.view;
    rig.pinch({ x: 100, y: 100 }, { x: 150, y: 120 }, 5);
    rig.reset();
    expect(rig.view).toEqual(start);
  });
});

describe('Kamera auf kleinen und hochkant Bildschirmen', () => {
  it('Startansicht passt auch im Hochformat', () => {
    const portrait = makeRig();
    const size = { width: 768, height: 1024 };
    portrait.resize(size);
    const seen = visibleRect(portrait.view, size);
    expect(seen.x).toBeLessThanOrEqual(FOCUS.x);
    expect(seen.x + seen.width).toBeGreaterThanOrEqual(FOCUS.x + FOCUS.width);
  });
});
