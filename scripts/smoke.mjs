#!/usr/bin/env node
/**
 * Lokaler Smoke-Test (läuft NICHT in CI – dort gibt es kein Playwright).
 *
 *   npm run smoke                                # baut, startet `vite preview`, testet, räumt auf
 *   npm run smoke -- --no-build                  # vorhandenes dist/ verwenden
 *   npm run smoke -- --out docs/screenshots/m2   # anderer Screenshot-Ordner (Standard: m1)
 *
 * Öffnet das Spiel (feste Insel `?seed=1`) als Tablet (1024×768, Touch,
 * devicePixelRatio 2, quer und hochkant) und als Desktop (1280×800, Maus),
 * tippt „Tippen zum Spielen“ an und prüft die Kamera der Insel:
 *   - Tablet: Ziehen und Zwei-Finger-Pinch per CDP `Input.dispatchTouchEvent`
 *     (echte Touch-Ereignisse mit zwei Berührpunkten), Tippen, +/−-Knöpfe,
 *     Drehen.
 *   - Desktop: Ziehen mit der linken Maustaste (rechte Taste zieht nicht),
 *     Mausrad-Zoom um den Mauszeiger, Tippen.
 *   - Beide: Die Kamera stoppt an der Grenze (Weltrand plus Wasser-Rand), und
 *     bei Maximalzoom bleibt auch in allen Ecken Land im Bild (`data-camera-land`);
 *     Pinch und Ziehen lösen kein Tippen aus; der Tipp-Ring ist nach dem
 *     Tippen im Screenshot sichtbar (Vergleich mit dem Bild nach dem Ausblenden).
 * Den Kamerazustand liest der Test aus `<html data-camera-*>` und `data-last-tap`.
 * Screenshots: Start, Insel, Insel hochkant, herangezoomt, Grenze erreicht, Ecke bei Maximalzoom, Tipp-Ring.
 * Exitcode ≠ 0 bei Konsolenfehlern, Seitenfehlern, fehlgeschlagenen Requests,
 * fehlgeschlagenen Kamera-Prüfungen oder wenn das Spiel nicht in die
 * Insel-Szene wechselt.
 *
 * Playwright wird NICHT als Abhängigkeit installiert: das Skript nutzt das
 * global vorinstallierte Paket (NODE_PATH oder `npm root -g`).
 */
import { execSync, spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4173;
const URL = `http://localhost:${PORT}/Schlumpfwelt/`;
/** Feste Insel, damit Screenshots und Prüfungen reproduzierbar sind. */
const GAME_URL = `${URL}?seed=1`;
const SCREENSHOT_DIR = path.resolve(ROOT, argValue('--out') ?? path.join('docs', 'screenshots', 'm1'));

/** Kachelgröße und Wasser-Rand der Kamera (siehe `TILE_SIZE` und `camera.json`). */
const TILE = 64;
const MAP_TILES = 48;
const MARGIN_TILES = 2;
const BOUNDS = { min: -MARGIN_TILES * TILE, max: (MAP_TILES + MARGIN_TILES) * TILE };
/** Zoom-Knöpfe unten rechts (siehe IslandScene): Radius, Rand, Abstand in CSS-px. */
const BUTTON = { radius: 34, margin: 16, gap: 12 };

const PROFILES = [
  {
    name: 'tablet',
    context: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
    rotateTo: { width: 768, height: 1024 },
  },
  {
    name: 'desktop',
    context: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
  },
];

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function loadPlaywright() {
  const localRequire = createRequire(import.meta.url);
  try {
    return localRequire('playwright');
  } catch {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return createRequire(path.join(globalRoot, 'noop.js'))('playwright');
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} ist fehlgeschlagen`);
  }
}

function startPreview() {
  const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const server = spawn(process.execPath, [vite, 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', (chunk) => (output += chunk));
  server.stderr.on('data', (chunk) => (output += chunk));
  server.output = () => output;
  return server;
}

async function waitForServer(server, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`vite preview wurde beendet:\n${server.output()}`);
    }
    try {
      const response = await fetch(URL);
      if (response.ok) return;
    } catch {
      // Server startet noch.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`vite preview antwortet nicht auf ${URL}:\n${server.output()}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Kamerazustand aus `<html data-camera-*>` (Mittelpunkt in Welt-Pixeln, Zoom = CSS-px pro Welt-Pixel). */
async function readCamera(page) {
  return page.evaluate(() => {
    const d = document.documentElement.dataset;
    return {
      zoom: Number(d.cameraZoom),
      x: Number(d.cameraX),
      y: Number(d.cameraY),
      min: Number(d.cameraMinZoom),
      max: Number(d.cameraMaxZoom),
      land: Number(d.cameraLand),
      lastTap: d.lastTap,
    };
  });
}

/** Wartet, bis Nachgleiten und weicher Zoom fertig sind (Kamera ändert sich nicht mehr). */
async function waitForCameraRest(page) {
  let previous = await readCamera(page);
  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    const current = await readCamera(page);
    if (current.zoom === previous.zoom && current.x === previous.x && current.y === previous.y) return current;
    previous = current;
  }
  return previous;
}

/** Erlaubter Bereich für den Kamera-Mittelpunkt einer Achse; ist die Fläche kleiner als der Schirm, ist er mittig. */
function centerRange(viewLength, zoom) {
  const half = viewLength / (2 * zoom);
  const middle = (BOUNDS.min + BOUNDS.max) / 2;
  if (BOUNDS.max - BOUNDS.min <= 2 * half) return [middle, middle];
  return [BOUNDS.min + half, BOUNDS.max - half];
}

function checkInsideBounds(cam, size, check, when) {
  const [minX, maxX] = centerRange(size.width, cam.zoom);
  const [minY, maxY] = centerRange(size.height, cam.zoom);
  const slack = 1.5; // data-camera-* ist auf 0,1 Welt-Pixel gerundet
  check(cam.x >= minX - slack && cam.x <= maxX + slack, `${when}: Kamera x=${cam.x} außerhalb [${minX.toFixed(1)}, ${maxX.toFixed(1)}]`);
  check(cam.y >= minY - slack && cam.y <= maxY + slack, `${when}: Kamera y=${cam.y} außerhalb [${minY.toFixed(1)}, ${maxY.toFixed(1)}]`);
  check(cam.zoom >= cam.min - 1e-3 && cam.zoom <= cam.max + 1e-3, `${when}: Zoom ${cam.zoom} außerhalb [${cam.min}, ${cam.max}]`);
  check(cam.land > 0, `${when}: kein Land im Bild (Kamera ${cam.x}, ${cam.y}, Zoom ${cam.zoom})`);
}

/** Die Kachel unter einem Bildschirmpunkt, aus dem Kamerazustand berechnet. */
function tileUnder(cam, size, point) {
  const worldX = cam.x + (point.x - size.width / 2) / cam.zoom;
  const worldY = cam.y + (point.y - size.height / 2) / cam.zoom;
  return `${Math.floor(worldX / TILE)},${Math.floor(worldY / TILE)}`;
}

/** Weltpunkt unter einem Bildschirmpunkt. */
function worldUnder(cam, size, point) {
  return { x: cam.x + (point.x - size.width / 2) / cam.zoom, y: cam.y + (point.y - size.height / 2) / cam.zoom };
}

/** Echte Touch-Ereignisse über das DevTools-Protokoll (Playwright kann nur Tippen, nicht Ziehen/Pinch). */
function touchDevice(cdp) {
  const send = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((point, id) => ({ x: point.x, y: point.y, id })),
    });
  return {
    /** Ein Finger zieht von `from` nach `to`; `pauseMs` pro Schritt, `holdMs` Ruhe vor dem Loslassen (0 = Wischen mit Schwung). */
    async drag(from, to, { steps = 10, pauseMs = 25, holdMs = 0 } = {}) {
      await send('touchStart', [from]);
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        await send('touchMove', [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }]);
        await sleep(pauseMs);
      }
      if (holdMs > 0) await sleep(holdMs);
      await send('touchEnd', []);
    },
    /** Zwei Finger links und rechts von `center`, Abstand wächst/schrumpft von `fromGap` auf `toGap`. */
    async pinch(center, fromGap, toGap, { steps = 10, pauseMs = 40 } = {}) {
      const fingers = (gap) => [
        { x: center.x - gap / 2, y: center.y },
        { x: center.x + gap / 2, y: center.y },
      ];
      await send('touchStart', [fingers(fromGap)[0]]);
      await send('touchStart', fingers(fromGap));
      for (let i = 1; i <= steps; i += 1) {
        await send('touchMove', fingers(fromGap + (toGap - fromGap) * (i / steps)));
        await sleep(pauseMs);
      }
      await send('touchEnd', []);
    },
  };
}

/**
 * Der weiche Ring auf der angetippten Kachel ist im Screenshot direkt nach dem Tippen zu sehen:
 * Das Bild des Ausschnitts unterscheidet sich vom Bild nach dem Ausblenden. Headless rendert nur mit
 * etwa 8 fps, deshalb bis zu drei Versuche. Der Screenshot mit Ring landet als `<name>-ring.png` im Ordner.
 */
async function checkTapRing({ page, check, tap, point, name }) {
  const clip = { x: Math.max(0, point.x - 110), y: Math.max(0, point.y - 110), width: 220, height: 220 };
  const grab = () => page.screenshot({ clip, scale: 'css' });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await sleep(2000); // der Ring vom letzten Versuch ist weg
    await tap(point);
    await sleep(300); // mindestens ein Frame mit Ring
    // Ein Screenshot dauert auf dem Tablet (DPR 2) länger als der Ring lebt: Spiel anhalten, Bild festhalten.
    await page.evaluate(() => {
      window.__holdFrames = true;
    });
    const during = await grab();
    await page.evaluate(() => window.__releaseFrames());
    await sleep(2500);
    const after = await grab();
    if (!during.equals(after)) {
      await writeFile(path.join(SCREENSHOT_DIR, `${name}-ring.png`), during);
      return;
    }
  }
  check(false, 'Tipp-Ring war im Screenshot nach dem Tippen nicht zu sehen');
}

/**
 * Bei Maximalzoom in alle vier Ecken ziehen: Es bleibt immer Land im Bild (die Insel verschwindet nie).
 * `dragBy(dx, dy)` zieht mit dem Finger oder der Maus um (dx, dy); die Kamera bewegt sich entgegengesetzt.
 */
async function checkCorners({ page, check, shot, size, dragBy, name }) {
  const toCorner = async (fx, fy, label) => {
    let previous = await readCamera(page);
    for (let i = 0; i < 12; i += 1) {
      await dragBy(fx * size.width * 0.8, fy * size.height * 0.8);
      const current = await waitForCameraRest(page);
      checkInsideBounds(current, size, check, `Ecke ${label}`);
      if (Math.abs(current.x - previous.x) < 0.2 && Math.abs(current.y - previous.y) < 0.2) return current;
      previous = current;
    }
    check(false, `Ecke ${label}: Kamera kam nicht zur Ruhe`);
    return previous;
  };
  const topLeft = await toCorner(1, 1, 'links oben');
  await shot(`${name}-ecke`);
  const topRight = await toCorner(-1, 1, 'rechts oben');
  const bottomRight = await toCorner(-1, -1, 'rechts unten');
  const bottomLeft = await toCorner(1, -1, 'links unten');
  check(topRight.x > topLeft.x + 300 && bottomRight.y > topRight.y + 300 && bottomLeft.x < bottomRight.x - 300, 'Ecken: Kamera hat sich nicht durch alle vier Ecken bewegt');
}

/** Tablet: Ziehen, Pinch, Tippen, Knöpfe und Grenzen mit Touch. */
async function testTouchCamera({ page, context, check, shot, size }) {
  const cdp = await context.newCDPSession(page);
  const touch = touchDevice(cdp);
  const centre = { x: size.width / 2, y: size.height / 2 };

  const start = await waitForCameraRest(page);
  check(start.zoom > start.min && start.zoom < start.max, `Start: Zoom ${start.zoom} nicht im Bereich (${start.min}, ${start.max})`);
  check(Math.abs(start.x - (BOUNDS.min + BOUNDS.max) / 2) < 200 && Math.abs(start.y - (BOUNDS.min + BOUNDS.max) / 2) < 200, `Start: Insel nicht zentriert (${start.x}, ${start.y})`);
  check(start.lastTap === undefined, 'Start: schon ein Tipp registriert');
  checkInsideBounds(start, size, check, 'Start');

  // --- Pinch: Abstand 100 → 400 (Faktor 4) um die Mitte; heranzoomen ---
  await touch.pinch(centre, 100, 400);
  const zoomed = await waitForCameraRest(page);
  const ratio = zoomed.zoom / start.zoom;
  check(ratio > 3.2 && ratio < 4.8, `Pinch auseinander: Zoom ×${ratio.toFixed(2)} statt etwa ×4`);
  check(Math.abs(zoomed.x - start.x) < 12 && Math.abs(zoomed.y - start.y) < 12, `Pinch um die Mitte verschiebt die Kamera (${start.x},${start.y} → ${zoomed.x},${zoomed.y})`);
  check(zoomed.lastTap === undefined, 'Pinch endete als Tippen');
  checkInsideBounds(zoomed, size, check, 'nach Pinch');
  await shot('tablet-zoom');

  // --- Pinch um einen Punkt neben der Mitte: der Weltpunkt unter der Fingermitte bleibt stehen ---
  const focus = { x: centre.x + 150, y: centre.y - 100 };
  const before = worldUnder(zoomed, size, focus);
  await touch.pinch(focus, 300, 150);
  const zoomedOut = await waitForCameraRest(page);
  check(zoomedOut.zoom < zoomed.zoom * 0.7, `Pinch zusammen: Zoom ${zoomed.zoom} → ${zoomedOut.zoom} nicht kleiner`);
  const after = worldUnder(zoomedOut, size, focus);
  check(Math.abs(after.x - before.x) < 25 && Math.abs(after.y - before.y) < 25, `Pinch: Punkt unter den Fingern wanderte (${before.x.toFixed(0)},${before.y.toFixed(0)} → ${after.x.toFixed(0)},${after.y.toFixed(0)})`);
  check(zoomedOut.lastTap === undefined, 'Zweiter Pinch endete als Tippen');

  // --- Ziehen mit einem Finger: das Bild folgt dem Finger ---
  await touch.pinch(centre, 100, 400); // wieder nah ran, damit es Spielraum gibt
  const near = await waitForCameraRest(page);
  await touch.drag({ x: centre.x + 100, y: centre.y }, { x: centre.x - 60, y: centre.y }, { steps: 8, pauseMs: 30, holdMs: 250 });
  const dragged = await waitForCameraRest(page);
  const expectedShift = 160 / near.zoom;
  check(
    Math.abs(dragged.x - (near.x + expectedShift)) < 8 && Math.abs(dragged.y - near.y) < 8,
    `Ziehen: Kamera x ${near.x} → ${dragged.x}, erwartet etwa ${(near.x + expectedShift).toFixed(1)} (160 px bei Zoom ${near.zoom})`,
  );
  check(dragged.lastTap === undefined, 'Ziehen endete als Tippen');

  // --- Wischen: bleibt in den Grenzen. Das Nachgleiten selbst ist in tests/ui (gestures, cameraRig) geprüft: ---
  // --- Headless-Chromium rendert nur mit etwa 8 fps und fasst Touch-Moves pro Frame zusammen, die Wischgeschwindigkeit ist hier nicht messbar. ---
  await touch.drag({ x: centre.x + 200, y: centre.y }, { x: centre.x - 200, y: centre.y }, { steps: 8, pauseMs: 15 });
  const swiped = await waitForCameraRest(page);
  check(swiped.x - dragged.x >= 400 / near.zoom - 8, `Wischen: Kamera x ${dragged.x} → ${swiped.x}, mindestens ${(400 / near.zoom).toFixed(1)} erwartet`);
  checkInsideBounds(swiped, size, check, 'nach Wischen');
  await checkTapRing({ page, check, tap: (p) => page.touchscreen.tap(p.x, p.y), point: centre, name: 'tablet' });

  // Etwas herauszoomen, damit die Ränder mit wenigen Zügen erreicht sind.
  await touch.pinch(centre, 400, 120);
  await waitForCameraRest(page);

  // --- Grenze: immer weiter in eine Richtung ziehen; die Kamera stoppt am Rand ---
  const reachEdge = async (dx, dy, axis, label) => {
    let cam = await readCamera(page);
    for (let i = 0; i < 12; i += 1) {
      await touch.drag({ x: centre.x - dx / 2, y: centre.y - dy / 2 }, { x: centre.x + dx / 2, y: centre.y + dy / 2 }, { steps: 6, pauseMs: 20, holdMs: 200 });
      const next = await waitForCameraRest(page);
      checkInsideBounds(next, size, check, `Grenze ${label}`);
      const moved = Math.abs(next[axis] - cam[axis]);
      cam = next;
      if (moved < 0.2) return cam;
    }
    check(false, `Grenze ${label}: Kamera kam auch nach vielen Zügen nicht zur Ruhe`);
    return cam;
  };
  const left = await reachEdge(size.width * 0.9, 0, 'x', 'links');
  check(left.x < near.x - 100, `Grenze links: Kamera x=${left.x} nicht links von ${near.x}`);
  await touch.drag({ x: centre.x - 300, y: centre.y }, { x: centre.x + 300, y: centre.y }, { steps: 6, pauseMs: 20, holdMs: 200 });
  const stillLeft = await waitForCameraRest(page);
  check(Math.abs(stillLeft.x - left.x) < 0.3, `Grenze links: weiteres Ziehen verschob die Kamera (${left.x} → ${stillLeft.x})`);
  await shot('tablet-grenze'); // linker Rand: Insel rechts, Wasser links
  const top = await reachEdge(0, size.height * 0.9, 'y', 'oben');
  check(top.y < near.y - 100, `Grenze oben: Kamera y=${top.y} nicht über ${near.y}`);
  const right = await reachEdge(-size.width * 0.9, 0, 'x', 'rechts');
  check(right.x > left.x + 500, `Grenze rechts: Kamera x=${right.x} nicht rechts von ${left.x}`);
  const bottom = await reachEdge(0, -size.height * 0.9, 'y', 'unten');
  check(bottom.y > top.y + 500, `Grenze unten: Kamera y=${bottom.y} nicht unter ${top.y}`);

  // --- Maximalzoom: in alle Ecken ziehen, es bleibt Land im Bild ---
  await touch.pinch(centre, 100, 500);
  await touch.pinch(centre, 100, 500);
  const maxed = await waitForCameraRest(page);
  check(Math.abs(maxed.zoom - maxed.max) < 1e-3, `Ecken: Maximalzoom nicht erreicht (${maxed.zoom} statt ${maxed.max})`);
  await checkCorners({
    page,
    check,
    shot,
    size,
    name: 'tablet',
    dragBy: (dx, dy) => touch.drag({ x: centre.x - dx / 2, y: centre.y - dy / 2 }, { x: centre.x + dx / 2, y: centre.y + dy / 2 }, { steps: 6, pauseMs: 20, holdMs: 200 }),
  });

  // --- Tippen: meldet die Kachel unter dem Finger ---
  const tapPoint = { x: size.width * 0.4, y: size.height * 0.4 };
  const tapCam = await readCamera(page);
  await page.touchscreen.tap(tapPoint.x, tapPoint.y);
  await sleep(400);
  const tapped = await readCamera(page);
  check(tapped.lastTap === tileUnder(tapCam, size, tapPoint), `Tippen: Kachel ${tapped.lastTap}, erwartet ${tileUnder(tapCam, size, tapPoint)}`);

  // --- Herauszoomen bis zum Minimum: die ganze Fläche bleibt sichtbar, die Insel mittig ---
  await touch.pinch(centre, 400, 20, { steps: 8 });
  await touch.pinch(centre, 400, 20, { steps: 8 });
  const far = await waitForCameraRest(page);
  check(Math.abs(far.zoom - far.min) < 1e-3, `Herauszoomen: Zoom ${far.zoom} erreicht das Minimum ${far.min} nicht`);
  const mid = (BOUNDS.min + BOUNDS.max) / 2;
  check(Math.abs(far.x - mid) < 1.5 && Math.abs(far.y - mid) < 1.5, `Herauszoomen: Insel nicht mittig (${far.x}, ${far.y})`);

  // --- +/−-Knöpfe: Zoom ändert sich, ohne Kachel-Tipp ---
  const buttonX = size.width - BUTTON.margin - BUTTON.radius;
  const outY = size.height - BUTTON.margin - BUTTON.radius;
  const inY = outY - 2 * BUTTON.radius - BUTTON.gap;
  const tapsBefore = (await readCamera(page)).lastTap;
  await page.touchscreen.tap(buttonX, inY);
  const afterPlus = await waitForCameraRest(page);
  check(afterPlus.zoom > far.zoom * 1.4, `Plus-Knopf: Zoom ${far.zoom} → ${afterPlus.zoom}`);
  await page.touchscreen.tap(buttonX, inY);
  await page.touchscreen.tap(buttonX, inY);
  const afterMore = await waitForCameraRest(page);
  check(afterMore.zoom > afterPlus.zoom * 1.4, `Plus-Knopf (mehrfach): Zoom ${afterPlus.zoom} → ${afterMore.zoom}`);
  await page.touchscreen.tap(buttonX, outY);
  const afterMinus = await waitForCameraRest(page);
  check(afterMinus.zoom < afterMore.zoom / 1.4, `Minus-Knopf: Zoom ${afterMore.zoom} → ${afterMinus.zoom}`);
  check((await readCamera(page)).lastTap === tapsBefore, 'Ein Knopf-Tipp wurde als Kachel-Tipp gemeldet');
  checkInsideBounds(afterMinus, size, check, 'nach Knöpfen');
  await cdp.detach();
}

/** Desktop: Ziehen mit der Maus, Mausrad, Tippen, Grenzen. */
async function testMouseCamera({ page, check, shot, size }) {
  const centre = { x: size.width / 2, y: size.height / 2 };
  const start = await waitForCameraRest(page);
  check(start.zoom > start.min && start.zoom < start.max, `Start: Zoom ${start.zoom} nicht im Bereich (${start.min}, ${start.max})`);
  checkInsideBounds(start, size, check, 'Start');

  // --- Mausrad: zoomt um den Mauszeiger (der Weltpunkt darunter bleibt stehen) ---
  // Erst etwas hineinzoomen: solange die ganze Karte schmaler als der Schirm ist, hält sie die Kamera mittig.
  const pointer = { x: centre.x - 220, y: centre.y + 140 };
  await page.mouse.move(pointer.x, pointer.y);
  for (let i = 0; i < 4; i += 1) {
    await page.mouse.wheel(0, -120);
    await sleep(80);
  }
  const zoomedIn = await waitForCameraRest(page);
  check(zoomedIn.zoom > start.zoom * 1.5, `Mausrad: Zoom ${start.zoom} → ${zoomedIn.zoom}`);
  const before = worldUnder(zoomedIn, size, pointer);
  for (let i = 0; i < 2; i += 1) {
    await page.mouse.wheel(0, -120);
    await sleep(80);
  }
  const zoomed = await waitForCameraRest(page);
  check(zoomed.zoom > zoomedIn.zoom * 1.2, `Mausrad: Zoom ${zoomedIn.zoom} → ${zoomed.zoom}`);
  const after = worldUnder(zoomed, size, pointer);
  check(Math.abs(after.x - before.x) < 2 && Math.abs(after.y - before.y) < 2, `Mausrad: Punkt unter dem Zeiger wanderte (${before.x.toFixed(1)},${before.y.toFixed(1)} → ${after.x.toFixed(1)},${after.y.toFixed(1)})`);
  await page.mouse.wheel(0, 120);
  const backOut = await waitForCameraRest(page);
  check(backOut.zoom < zoomed.zoom, `Mausrad zurück: Zoom ${zoomed.zoom} → ${backOut.zoom}`);

  // --- Ganz heranzoomen: Zoom stoppt am Maximum (Kachel = 128 px) ---
  for (let i = 0; i < 12; i += 1) {
    await page.mouse.wheel(0, -240);
    await sleep(40);
  }
  const near = await waitForCameraRest(page);
  check(Math.abs(near.zoom - near.max) < 1e-3, `Maximum: Zoom ${near.zoom}, erwartet ${near.max}`);
  check(Math.abs(near.max * TILE - 128) < 0.5, `Maximum: Kachel ${near.max * TILE} px statt 128`);
  await shot('desktop-zoom');

  // --- Ziehen mit der linken Taste ---
  await page.mouse.move(centre.x + 100, centre.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) {
    await page.mouse.move(centre.x + 100 - i * 20, centre.y + i * 5);
    await sleep(40);
  }
  await sleep(250);
  await page.mouse.up();
  const dragged = await waitForCameraRest(page);
  check(
    Math.abs(dragged.x - (near.x + 160 / near.zoom)) < 6 && Math.abs(dragged.y - (near.y - 40 / near.zoom)) < 6,
    `Ziehen: Kamera (${near.x}, ${near.y}) → (${dragged.x}, ${dragged.y}), erwartet (${(near.x + 160 / near.zoom).toFixed(1)}, ${(near.y - 40 / near.zoom).toFixed(1)})`,
  );
  check(dragged.lastTap === undefined, 'Ziehen mit der Maus endete als Tippen');

  // --- Rechte Maustaste zieht nicht ---
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(centre.x - 200, centre.y - 100, { steps: 6 });
  await page.mouse.up({ button: 'right' });
  const afterRight = await waitForCameraRest(page);
  check(Math.abs(afterRight.x - dragged.x) < 0.2 && Math.abs(afterRight.y - dragged.y) < 0.2, 'Rechte Maustaste hat die Kamera verschoben');
  check(afterRight.lastTap === undefined, 'Rechte Maustaste löste einen Tipp aus');

  // --- Linke Taste halten und ziehen, dabei rechts klicken: die Links-Geste läuft weiter und wird kein Tipp ---
  const beforeBoth = await readCamera(page);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x + 40, centre.y, { steps: 4 });
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await page.mouse.move(centre.x + 100, centre.y, { steps: 4 });
  await sleep(300);
  await page.mouse.up();
  const afterBoth = await waitForCameraRest(page);
  check(Math.abs(afterBoth.x - beforeBoth.x) > 90 / beforeBoth.zoom, `Rechtsklick während des Ziehens beendete die Geste (x ${beforeBoth.x} → ${afterBoth.x})`);
  check(afterBoth.lastTap === undefined, 'Rechtsklick während der Links-Geste endete als Tipp');

  await checkTapRing({ page, check, tap: (p) => page.mouse.click(p.x, p.y), point: centre, name: 'desktop' });

  // --- Grenzen: nach links, oben, rechts, unten ziehen (erst etwas herauszoomen: weniger Züge bis zum Rand) ---
  await page.mouse.move(centre.x, centre.y);
  for (let i = 0; i < 5; i += 1) {
    await page.mouse.wheel(0, 150);
    await sleep(60);
  }
  await waitForCameraRest(page);
  const reachEdge = async (dx, dy, axis, label) => {
    let cam = await readCamera(page);
    for (let i = 0; i < 12; i += 1) {
      await page.mouse.move(centre.x - dx / 2, centre.y - dy / 2);
      await page.mouse.down();
      for (let s = 1; s <= 6; s += 1) {
        await page.mouse.move(centre.x - dx / 2 + (dx * s) / 6, centre.y - dy / 2 + (dy * s) / 6);
        await sleep(25);
      }
      await sleep(250);
      await page.mouse.up();
      const next = await waitForCameraRest(page);
      checkInsideBounds(next, size, check, `Grenze ${label}`);
      const moved = Math.abs(next[axis] - cam[axis]);
      cam = next;
      if (moved < 0.2) return cam;
    }
    check(false, `Grenze ${label}: Kamera kam auch nach vielen Zügen nicht zur Ruhe`);
    return cam;
  };
  const left = await reachEdge(size.width * 0.8, 0, 'x', 'links');
  check(left.x < near.x - 100, `Grenze links: Kamera x=${left.x} nicht links von ${near.x}`);
  await shot('desktop-grenze'); // linker Rand: Insel rechts, Wasser links
  const top = await reachEdge(0, size.height * 0.8, 'y', 'oben');
  check(top.y < near.y - 100, `Grenze oben: Kamera y=${top.y} nicht über ${near.y}`);
  const right = await reachEdge(-size.width * 0.8, 0, 'x', 'rechts');
  check(right.x > left.x + 500, `Grenze rechts: Kamera x=${right.x} nicht rechts von ${left.x}`);
  const bottom = await reachEdge(0, -size.height * 0.8, 'y', 'unten');
  check(bottom.y > top.y + 500, `Grenze unten: Kamera y=${bottom.y} nicht unter ${top.y}`);

  // --- Maximalzoom: in alle Ecken ziehen, es bleibt Land im Bild ---
  await page.mouse.move(centre.x, centre.y);
  for (let i = 0; i < 12; i += 1) {
    await page.mouse.wheel(0, -240);
    await sleep(40);
  }
  const maxed = await waitForCameraRest(page);
  check(Math.abs(maxed.zoom - maxed.max) < 1e-3, `Ecken: Maximalzoom nicht erreicht (${maxed.zoom} statt ${maxed.max})`);
  await checkCorners({
    page,
    check,
    shot,
    size,
    name: 'desktop',
    dragBy: async (dx, dy) => {
      await page.mouse.move(centre.x - dx / 2, centre.y - dy / 2);
      await page.mouse.down();
      for (let step = 1; step <= 6; step += 1) {
        await page.mouse.move(centre.x - dx / 2 + (dx * step) / 6, centre.y - dy / 2 + (dy * step) / 6);
        await sleep(25);
      }
      await sleep(250);
      await page.mouse.up();
    },
  });

  // --- Klicken meldet die Kachel ---
  const clickPoint = { x: size.width * 0.3, y: size.height * 0.4 };
  const clickCam = await readCamera(page);
  await page.mouse.click(clickPoint.x, clickPoint.y);
  await sleep(400);
  const clicked = await readCamera(page);
  check(clicked.lastTap === tileUnder(clickCam, size, clickPoint), `Klick: Kachel ${clicked.lastTap}, erwartet ${tileUnder(clickCam, size, clickPoint)}`);

  // --- Herauszoomen bis zum Minimum: ganze Fläche sichtbar, mittig ---
  for (let i = 0; i < 20; i += 1) {
    await page.mouse.wheel(0, 240);
    await sleep(40);
  }
  const far = await waitForCameraRest(page);
  check(Math.abs(far.zoom - far.min) < 1e-3, `Herauszoomen: Zoom ${far.zoom} erreicht das Minimum ${far.min} nicht`);
  const mid = (BOUNDS.min + BOUNDS.max) / 2;
  check(Math.abs(far.x - mid) < 1.5 && Math.abs(far.y - mid) < 1.5, `Herauszoomen: Insel nicht mittig (${far.x}, ${far.y})`);
}

async function testProfile(browser, profile) {
  const problems = [];
  const context = await browser.newContext(profile.context);
  // Lässt sich das Zeichnen anhalten (`__holdFrames`), um Screenshots flüchtiger Effekte aufzunehmen.
  await context.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    const held = [];
    window.__holdFrames = false;
    window.__releaseFrames = () => {
      window.__holdFrames = false;
      for (const callback of held.splice(0)) raf(callback);
    };
    window.requestAnimationFrame = (callback) =>
      raf((time) => {
        if (window.__holdFrames) held.push(callback);
        else callback(time);
      });
  });
  const page = await context.newPage();

  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`Konsolenfehler: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`Seitenfehler: ${error.message}`));
  page.on('requestfailed', (request) => problems.push(`Request fehlgeschlagen: ${request.url()}`));
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });

  const shot = (name) => page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), scale: 'css' });
  const waitForScene = (scene) =>
    page.waitForSelector(`html[data-scene="${scene}"]`, { state: 'attached', timeout: 10_000 });

  await page.goto(GAME_URL, { waitUntil: 'load' });
  await waitForScene('boot');
  await page.waitForTimeout(500);

  const info = await page.evaluate(() => {
    const canvas = document.querySelector('#game canvas');
    return {
      title: document.title,
      canvasWidth: canvas?.width ?? 0,
      cssWidth: canvas?.clientWidth ?? 0,
      cssHeight: canvas?.clientHeight ?? 0,
      scrollable: document.documentElement.scrollHeight > window.innerHeight + 1,
      touchAction: canvas ? getComputedStyle(canvas).touchAction : '',
    };
  });
  const { width, height } = profile.context.viewport;
  const expectedScale = Math.min(profile.context.deviceScaleFactor, 2);
  if (info.title.trim() === '') problems.push('Seitentitel ist leer');
  if (info.cssWidth !== width || info.cssHeight !== height) {
    problems.push(`Canvas ${info.cssWidth}×${info.cssHeight} statt ${width}×${height} (CSS px)`);
  }
  if (Math.abs(info.canvasWidth / info.cssWidth - expectedScale) > 0.01) {
    problems.push(`Render-Skalierung ${info.canvasWidth / info.cssWidth} statt ${expectedScale}`);
  }
  if (info.scrollable) problems.push('Seite lässt sich scrollen');
  if (info.touchAction !== 'none') problems.push(`touch-action auf dem Canvas ist "${info.touchAction}"`);

  await shot(`${profile.name}-start`);

  // „Tippen zum Spielen“: der Knopf sitzt mittig, etwas unterhalb der Mitte.
  const x = width / 2;
  const y = height * 0.54;
  if (profile.context.hasTouch) {
    await page.touchscreen.tap(x, y);
  } else {
    await page.mouse.click(x, y);
  }
  await waitForScene('island');
  await waitForCameraRest(page);
  await page.waitForTimeout(2500); // Einblenden (Fade) abwarten: Headless rendert nur mit etwa 8 fps
  await shot(`${profile.name}-insel`);

  const check = (condition, message) => {
    if (!condition) problems.push(message);
  };
  if (profile.rotateTo) {
    await page.setViewportSize(profile.rotateTo);
    await page.waitForTimeout(800);
    const rotated = await page.evaluate(() => {
      const canvas = document.querySelector('#game canvas');
      return { cssWidth: canvas?.clientWidth ?? 0, cssHeight: canvas?.clientHeight ?? 0 };
    });
    if (rotated.cssWidth !== profile.rotateTo.width || rotated.cssHeight !== profile.rotateTo.height) {
      problems.push(`Nach dem Drehen: Canvas ${rotated.cssWidth}×${rotated.cssHeight}`);
    }
    await waitForCameraRest(page);
    const cam = await readCamera(page);
    checkInsideBounds(cam, profile.rotateTo, check, 'nach dem Drehen');
    check(cam.zoom >= cam.min - 1e-3, `Nach dem Drehen: Zoom ${cam.zoom} unter dem Minimum ${cam.min}`);
    await shot(`${profile.name}-insel-hochkant`);
    await page.setViewportSize(profile.context.viewport);
    await page.waitForTimeout(800);
    await waitForCameraRest(page);
  }

  if (profile.context.hasTouch) {
    await testTouchCamera({ page, context, problems, check, shot, size: { width, height } });
  } else {
    await testMouseCamera({ page, problems, check, shot, size: { width, height } });
  }

  await context.close();
  return { info, problems };
}

async function main() {
  const skipBuild = process.argv.includes('--no-build');
  if (!skipBuild) run('npm', ['run', 'build']);

  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const { chromium } = loadPlaywright();
  const server = startPreview();
  let failed = false;

  try {
    await waitForServer(server);
    const browser = await chromium.launch();
    try {
      for (const profile of PROFILES) {
        const { info, problems } = await testProfile(browser, profile);
        const status = problems.length === 0 ? 'OK' : 'FEHLER';
        console.log(`[${status}] ${profile.name}: Titel "${info.title}", Canvas ${info.canvasWidth}px für ${info.cssWidth} CSS-px`);
        for (const problem of problems) console.log(`  - ${problem}`);
        failed ||= problems.length > 0;
      }
    } finally {
      await browser.close();
    }
  } finally {
    server.kill();
  }

  console.log(failed ? 'Smoke-Test fehlgeschlagen.' : `Smoke-Test bestanden. Screenshots: ${path.relative(ROOT, SCREENSHOT_DIR)}/`);
  process.exitCode = failed ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
