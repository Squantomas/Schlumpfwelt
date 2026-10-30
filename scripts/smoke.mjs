#!/usr/bin/env node
/**
 * Lokaler Smoke-Test (läuft NICHT in CI – dort gibt es kein Playwright).
 *
 *   npm run smoke                                # baut, startet `vite preview`, testet, räumt auf
 *   npm run smoke -- --no-build                  # vorhandenes dist/ verwenden
 *   npm run smoke -- --out docs/screenshots/m3   # anderer Screenshot-Ordner (Standard: m2)
 *   npm run smoke -- --m2-only                   # nur die Bau-Prüfungen (M2), ohne die Kamera-Prüfungen (schnell)
 *   npm run smoke -- --profile tablet            # nur Tablet bzw. nur Desktop
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
 *
 * Danach (M2, „Gestalten“) lädt der Test das Spiel neu und baut: Weg als L, Haus ohne Weg (Markierung
 * sichtbar), Weg daneben (Markierung weg), Blumen, Haus verschieben, Deko abreißen, ungültiger Platz auf
 * Wasser (rot, ✓ baut nichts), Ziehen mit aktivem Werkzeug bewegt nur die Kamera. Den Zustand liest er aus
 * `<html data-tool|preview|hint|markers|buildings|paths|terrain|ui>` (siehe `markVillage` in sceneMarker.ts);
 * die Lage der Knöpfe steht in `data-ui` (CSS-px). Screenshots: Werkzeugleiste, Vorschau grün und rot,
 * Haus ohne Weg, kleines Dorf.
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
const M2_ONLY = process.argv.includes('--m2-only');
/** `--profile tablet|desktop`: nur dieses Gerät testen (zum Entwickeln). */
const ONLY_PROFILE = argValue('--profile');
const SCREENSHOT_DIR = path.resolve(ROOT, argValue('--out') ?? path.join('docs', 'screenshots', 'm2'));

/** Kachelgröße und Wasser-Rand der Kamera (siehe `TILE_SIZE` und `camera.json`). */
const TILE = 64;
const MAP_TILES = 48;
const MARGIN_TILES = 2;
const BOUNDS = { min: -MARGIN_TILES * TILE, max: (MAP_TILES + MARGIN_TILES) * TILE };

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

/** Lage der Knöpfe (CSS-px) aus `<html data-ui>`: `{ 'zoom-in': { x, y, enabled }, 'tool-path': … }`. */
async function readUi(page) {
  return JSON.parse(await page.evaluate(() => document.documentElement.dataset.ui ?? '{}'));
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
      // Senkrechte Züge am linken Rand: In der Mitte unten liegt die Werkzeugleiste.
      const column = dx === 0 ? size.width * 0.12 : null;
      await touch.drag({ x: column ?? centre.x - dx / 2, y: centre.y - dy / 2 }, { x: column ?? centre.x + dx / 2, y: centre.y + dy / 2 }, { steps: 6, pauseMs: 20, holdMs: 200 });
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
  const zoomSpots = await readUi(page);
  const buttonX = zoomSpots['zoom-in'].x;
  const inY = zoomSpots['zoom-in'].y;
  const outY = zoomSpots['zoom-out'].y;
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
      // Senkrechte Züge am linken Rand: In der Mitte unten liegt die Werkzeugleiste.
      const column = dx === 0 ? size.width * 0.12 : null;
      await page.mouse.move(column ?? centre.x - dx / 2, centre.y - dy / 2);
      await page.mouse.down();
      for (let s = 1; s <= 6; s += 1) {
        await page.mouse.move(column ?? centre.x - dx / 2 + (dx * s) / 6, centre.y - dy / 2 + (dy * s) / 6);
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


// ---------------------------------------------------------------------------------------------
// M2 „Gestalten“: Wege, Häuser und Deko setzen, verschieben, abreißen
// ---------------------------------------------------------------------------------------------

/** Kantenlänge der Gebäude in Kacheln (siehe `buildings.json`); alles andere ist 1×1. */
const FOOTPRINT = { 'house-red': 2, 'house-blue': 2, 'house-yellow': 2, fountain: 2 };
const footprintOf = (type) => FOOTPRINT[type] ?? 1;

/** Bau-Zustand aus `<html data-tool|variant|preview|hint|markers|buildings|paths|terrain|ui>`. */
async function readVillage(page) {
  return page.evaluate(() => {
    const d = document.documentElement.dataset;
    return {
      tool: d.tool,
      variant: d.variant,
      preview: d.preview,
      hint: d.hint ?? '',
      markers: Number(d.markers),
      buildings: JSON.parse(d.buildings ?? '[]').map(([id, type, x, y, connected]) => ({ id, type, x, y, connected: connected === 1 })),
      paths: (d.paths ?? '').split(';').filter(Boolean).map((tile) => tile.split(',').map(Number)),
      terrain: d.terrain ?? '',
      ui: JSON.parse(d.ui ?? '{}'),
      lastTap: d.lastTap,
    };
  });
}

/** Wartet (Headless: etwa 8 fps), bis `predicate(village)` stimmt; wirft mit dem aktuellen Stand, wenn nicht. */
async function waitForVillage(page, predicate, what, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let village;
  while (Date.now() < deadline) {
    village = await readVillage(page);
    if (predicate(village)) return village;
    await sleep(120);
  }
  throw new Error(
    `Zeitüberschreitung beim Warten auf ${what} (Stand: Werkzeug ${village?.tool}, Vorschau ${village?.preview}, ${village?.buildings.length} Gebäude, ${village?.paths.length} Wegkacheln, Markierungen ${village?.markers})`,
  );
}

/** Mitte der Kachel auf dem Bildschirm (CSS-px). */
function screenOfTile(cam, size, tile) {
  return { x: size.width / 2 + ((tile.x + 0.5) * TILE - cam.x) * cam.zoom, y: size.height / 2 + ((tile.y + 0.5) * TILE - cam.y) * cam.zoom };
}

const tileKey = (x, y) => `${x},${y}`;

/** Belegte Kacheln: Gebäude (mit Grundriss) und Wege. */
function occupiedTiles(village) {
  const occupied = new Set(village.paths.map(([x, y]) => tileKey(x, y)));
  for (const b of village.buildings) {
    const size = footprintOf(b.type);
    for (let dy = 0; dy < size; dy += 1) for (let dx = 0; dx < size; dx += 1) occupied.add(tileKey(b.x + dx, b.y + dy));
  }
  return occupied;
}

/**
 * Sucht eine freie Wiesenfläche `w × h` (plus `margin` Kacheln Rand, auch frei und Wiese), die gut antippbar auf dem
 * Bildschirm liegt: nicht unter Werkzeugleiste, Auswahl, Hinweis und Zoom-Knöpfen. Nimmt die, die der Bildschirmmitte
 * (oder `near`, Bildschirmpunkt) am nächsten liegt. `skip` sind Kacheln, die zusätzlich als belegt gelten.
 */
function findFreeArea(village, cam, size, w, h, { margin = 1, near, skip = [] } = {}) {
  const occupied = occupiedTiles(village);
  for (const tile of skip) occupied.add(tileKey(tile.x, tile.y));
  const toolbarTop = village.ui['tool-path'].y - 52;
  const usable = { left: 90, right: size.width - 140, top: 110, bottom: toolbarTop - 160 };
  const target = near ?? { x: size.width / 2, y: (usable.top + usable.bottom) / 2 };
  const grass = (x, y) => village.terrain[y * MAP_TILES + x] === 'g' && !occupied.has(tileKey(x, y));
  let best;
  for (let y = 2; y < MAP_TILES - 2 - h; y += 1) {
    for (let x = 2; x < MAP_TILES - 2 - w; x += 1) {
      let free = true;
      for (let dy = -margin; dy < h + margin && free; dy += 1) for (let dx = -margin; dx < w + margin && free; dx += 1) free = grass(x + dx, y + dy);
      if (!free) continue;
      const first = screenOfTile(cam, size, { x, y });
      const last = screenOfTile(cam, size, { x: x + w - 1, y: y + h - 1 });
      if (first.x < usable.left || last.x > usable.right || first.y < usable.top || last.y > usable.bottom) continue;
      const distance = Math.hypot((first.x + last.x) / 2 - target.x, (first.y + last.y) / 2 - target.y);
      if (!best || distance < best.distance) best = { x, y, distance };
    }
  }
  return best;
}

/** Ein Wasser-Block `2×2`, der auf dem Bildschirm antippbar ist, möglichst nahe an `near`. */
function findWater(village, cam, size, near) {
  let best;
  for (let y = 1; y < MAP_TILES - 1; y += 1) {
    for (let x = 0; x < MAP_TILES - 1; x += 1) {
      const water = [0, 1].every((dy) => [0, 1].every((dx) => village.terrain[(y + dy) * MAP_TILES + x + dx] === 'w'));
      if (!water) continue;
      const p = screenOfTile(cam, size, { x, y });
      if (p.x < 30 || p.x > size.width - 150 || p.y < 120 || p.y > size.height - 260) continue;
      const distance = Math.hypot(p.x - near.x, p.y - near.y);
      if (!best || distance < best.distance) best = { x, y, distance };
    }
  }
  return best;
}

/**
 * Baut im Spiel (M2) und prüft den Zustand. `input.tap(point)` tippt oder klickt. Jeder Fehler wird als Problem
 * gemeldet, der Test bricht dann ab (die Schritte bauen aufeinander auf).
 */
async function testBuilding({ page, check, shot, size, input, drag, name }) {
  const step = (what) => console.log(`  [${name}] ${what}`);
  const cameraAtRest = () => waitForCameraRest(page);
  const tapUi = async (spot) => {
    const village = await waitForVillage(page, (v) => spot in v.ui, `den Knopf „${spot}“`, 4000);
    const p = village.ui[spot];
    await input.tap({ x: p.x, y: p.y });
  };
  const tapTile = async (tile) => {
    const cam = await cameraAtRest();
    const p = screenOfTile(cam, size, tile);
    check(p.x > 10 && p.x < size.width - 10 && p.y > 10 && p.y < size.height - 10, `Kachel ${tileKey(tile.x, tile.y)} liegt nicht im Bild (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
    await input.tap(p);
    await waitForVillage(page, (v) => v.lastTap === tileKey(tile.x, tile.y), `den Tipp auf Kachel ${tileKey(tile.x, tile.y)} bei ${p.x.toFixed(0)},${p.y.toFixed(0)} (zuletzt getippt: ${(await readVillage(page)).lastTap})`, 4000);
    await sleep(250); // ein paar Frames, damit Vorschau und Knöpfe nachziehen
  };
  const selectTool = async (tool) => {
    await tapUi(`tool-${tool}`);
    await waitForVillage(page, (v) => v.tool === tool, `Werkzeug ${tool}`);
  };
  const exitTool = async (tool) => {
    await tapUi(`tool-${tool}`);
    await waitForVillage(page, (v) => v.tool === 'view', 'zurück auf „Anschauen“');
  };
  /** ✓ antippen und warten, bis `predicate` stimmt. */
  const confirm = async (predicate, what) => {
    await waitForVillage(page, (v) => v.ui.confirm?.enabled === true, 'ein aktives ✓');
    await tapUi('confirm');
    return waitForVillage(page, predicate, what);
  };
  const count = (village, type) => village.buildings.filter((b) => b.type === type).length;

  let village = await waitForVillage(page, (v) => v.buildings.length > 0, 'das Startdorf');
  check(village.tool === 'view', `Start: Werkzeug ${village.tool} statt „view“`);
  check(village.buildings.some((b) => b.type.startsWith('house') && b.connected) && village.paths.length > 0, 'Start: kein Haus mit Weg im Startdorf');
  check(village.markers === 0, `Start: ${village.markers} Markierungen, erwartet 0`);
  for (const tool of ['path', 'house', 'deco', 'move', 'demolish']) check(`tool-${tool}` in village.ui, `Werkzeugleiste: Knopf ${tool} fehlt`);
  await sleep(800);
  await shot(`${name}-werkzeugleiste`);

  // --- Ungültiger Platz auf Wasser: rote Vorschau, ✓ baut nichts ---
  step('Haus auf Wasser: rot, ✓ baut nichts');
  await selectTool('house');
  await waitForVillage(page, (v) => 'variant-house-blue' in v.ui, 'die Hausauswahl');
  let cam = await cameraAtRest();
  const water = findWater(village, cam, size, { x: size.width * 0.2, y: size.height * 0.3 });
  check(water !== undefined, 'Kein Wasser im Bild gefunden');
  if (water) {
    await tapTile({ x: water.x, y: water.y + 1 });
    village = await waitForVillage(page, (v) => v.preview === 'place:terrain', 'rote Vorschau auf Wasser');
    check(village.ui.confirm?.enabled === false, 'Wasser: ✓ ist nicht abgeblendet');
    await shot(`${name}-vorschau-wasser`);
    const before = village.buildings.length;
    await tapUi('confirm');
    await sleep(900);
    village = await readVillage(page);
    check(village.buildings.length === before, 'Wasser: ✓ hat trotzdem gebaut');
    check(village.hint !== '', 'Wasser: ✓ zeigt keinen kurzen Hinweis');
    check(village.preview === 'place:terrain', 'Wasser: Vorschau ist nach dem ✓ verschwunden');
    await tapUi('cancel');
    await waitForVillage(page, (v) => v.preview === 'none', 'ohne Vorschau nach ✕');
  }
  await exitTool('house');

  // --- Heranzoomen: Kacheln etwa 47 px ---
  const zoomSpots = (await readVillage(page)).ui;
  for (let i = 0; i < 2; i += 1) {
    await input.tap(zoomSpots['zoom-in']);
    await sleep(200);
  }
  cam = await cameraAtRest();
  check(cam.zoom * TILE > 40, `Heranzoomen: Kachel nur ${(cam.zoom * TILE).toFixed(0)} px groß`);
  village = await readVillage(page);

  // --- Rot auch auf einem Gebäude („blocked“) ---
  step('Haus auf ein Haus: rot');
  await selectTool('house');
  const start = village.buildings.find((b) => b.type.startsWith('house'));
  await tapTile({ x: start.x, y: start.y + 1 });
  village = await waitForVillage(page, (v) => v.preview === 'place:blocked', 'rote Vorschau auf dem Haus');
  await shot(`${name}-vorschau-rot`);
  await tapUi('confirm');
  await sleep(700);
  check((await readVillage(page)).buildings.length === village.buildings.length, 'Überlappung: ✓ hat trotzdem gebaut');
  await tapUi('cancel');
  await exitTool('house');

  // --- Weg als L: Anfang antippen, Ende antippen, ✓ ---
  step('Weg als L');
  village = await readVillage(page);
  cam = await cameraAtRest();
  const pathArea = findFreeArea(village, cam, size, 4, 3, { near: { x: size.width * 0.72, y: size.height * 0.3 } });
  check(pathArea !== undefined, 'Kein freier Platz für den Weg gefunden');
  if (!pathArea) return;
  const lTiles = [0, 1, 2, 3].map((dx) => ({ x: pathArea.x + dx, y: pathArea.y })).concat([1, 2].map((dy) => ({ x: pathArea.x + 3, y: pathArea.y + dy })));
  await selectTool('path');
  await tapTile(lTiles[0]);
  await waitForVillage(page, (v) => v.preview === 'path:ok=1,blocked=0,existing=0', 'Weg-Vorschau mit einer Kachel');
  await tapTile(lTiles[lTiles.length - 1]);
  await waitForVillage(page, (v) => v.preview === 'path:ok=6,blocked=0,existing=0', 'L-förmige Weg-Vorschau (6 Kacheln)');
  const pathsBefore = village.paths.length;
  village = await confirm((v) => v.paths.length === pathsBefore + 6, 'sechs neue Wegkacheln');
  check(lTiles.every((tile) => village.paths.some(([x, y]) => x === tile.x && y === tile.y)), 'Weg: nicht alle Kacheln der L-Linie liegen');
  check(village.tool === 'path' && village.preview === 'none', `Weg: nach ✓ Werkzeug ${village.tool}, Vorschau ${village.preview}`);

  // --- Haus ohne Weg: Markierung sichtbar ---
  step('Haus ohne Weg: Markierung');
  await selectTool('house');
  await tapUi('variant-house-blue');
  await waitForVillage(page, (v) => v.variant === 'house-blue', 'Variante Blaues Pilzhaus');
  cam = await cameraAtRest();
  const houseArea = findFreeArea(village, cam, size, 2, 2, { near: { x: size.width * 0.3, y: size.height * 0.35 } });
  check(houseArea !== undefined, 'Kein freier Platz für das Haus gefunden');
  if (!houseArea) return;
  // Erst eine andere Kachel antippen, dann die richtige: die Vorschau wandert.
  const decoy = findFreeArea(village, cam, size, 2, 2, { near: { x: size.width * 0.55, y: size.height * 0.5 }, skip: [{ x: houseArea.x, y: houseArea.y }] });
  if (decoy) {
    await tapTile({ x: decoy.x, y: decoy.y + 1 });
    await waitForVillage(page, (v) => v.preview === 'place:ok', 'grüne Vorschau (erste Kachel)');
  }
  await tapTile({ x: houseArea.x, y: houseArea.y + 1 });
  await waitForVillage(page, (v) => v.preview === 'place:ok', 'grüne Vorschau');
  await shot(`${name}-vorschau-gruen`);
  const houses = village.buildings.length;
  village = await confirm((v) => v.buildings.length === houses + 1 && v.markers === 1, 'das neue Haus mit Markierung');
  const blueHouse = village.buildings.find((b) => b.type === 'house-blue');
  check(blueHouse && blueHouse.x === houseArea.x && blueHouse.y === houseArea.y, `Haus steht auf ${blueHouse?.x},${blueHouse?.y} statt ${houseArea.x},${houseArea.y}`);
  check(blueHouse && !blueHouse.connected, 'Haus ohne Weg gilt als angeschlossen');
  check(village.tool === 'house', `Haus: nach ✓ Werkzeug ${village.tool}`);
  await sleep(700); // die Markierung ploppt auf
  await shot(`${name}-haus-ohne-weg`);

  // --- Weg daneben: Markierung verschwindet ---
  step('Weg daneben: Markierung weg');
  await selectTool('path');
  await tapTile({ x: blueHouse.x - 1, y: blueHouse.y + 1 });
  // Das zweite Ende liegt oberhalb: unter der Vorschau sitzen ✓ und ✕.
  await tapTile({ x: blueHouse.x - 1, y: blueHouse.y });
  village = await confirm((v) => v.markers === 0, 'keine Markierung mehr');
  check(village.buildings.find((b) => b.id === blueHouse.id)?.connected === true, 'Haus gilt nach dem Weg nicht als angeschlossen');

  // --- Blumen nacheinander ---
  step('Blumen');
  await selectTool('deco');
  await waitForVillage(page, (v) => v.variant === 'flower', 'Variante Blume');
  const flowers = [];
  for (let i = 0; i < 2; i += 1) {
    village = await readVillage(page);
    cam = await cameraAtRest();
    const spot = findFreeArea(village, cam, size, 1, 1, { near: { x: size.width * (0.35 + i * 0.2), y: size.height * 0.28 }, skip: flowers });
    check(spot !== undefined, 'Kein freier Platz für die Blume');
    if (!spot) return;
    flowers.push({ x: spot.x, y: spot.y });
    const before = count(village, 'flower');
    await tapTile(spot);
    await waitForVillage(page, (v) => v.preview === 'place:ok', 'grüne Vorschau für die Blume');
    village = await confirm((v) => count(v, 'flower') === before + 1, `Blume ${i + 1}`);
    check(village.tool === 'deco', `Blume ${i + 1}: Werkzeug ${village.tool} nach ✓, erwartet „deco“`);
  }

  // --- Haus verschieben (weg vom Weg: die Markierung kommt zurück) ---
  step('Haus verschieben');
  await selectTool('move');
  village = await readVillage(page);
  cam = await cameraAtRest();
  const target = findFreeArea(village, cam, size, 2, 2, { near: { x: size.width * 0.3, y: size.height * 0.62 } });
  check(target !== undefined, 'Kein freier Platz zum Verschieben gefunden');
  if (!target) return;
  await tapTile({ x: blueHouse.x + 1, y: blueHouse.y + 1 }); // jede Kachel des Hauses wählt es
  await waitForVillage(page, (v) => v.preview === 'move:chosen', 'das gewählte Haus');
  await shot(`${name}-verschieben`);
  await tapTile({ x: target.x, y: target.y + 1 });
  await waitForVillage(page, (v) => v.preview === 'move:ok', 'grünes Ziel');
  village = await confirm((v) => v.buildings.some((b) => b.id === blueHouse.id && b.x === target.x && b.y === target.y), 'das verschobene Haus');
  check(village.markers === 1, `Verschoben: ${village.markers} Markierungen, erwartet 1 (nun ohne Weg)`);
  check(village.tool === 'move', `Verschieben: Werkzeug ${village.tool} nach ✓`);

  // --- Deko abreißen ---
  step('Deko abreißen');
  await selectTool('demolish');
  village = await readVillage(page);
  const flowersBefore = count(village, 'flower');
  await tapTile(flowers[0]);
  await waitForVillage(page, (v) => v.preview === 'demolish:1', 'die rote Markierung');
  await shot(`${name}-abreissen`);
  village = await confirm((v) => count(v, 'flower') === flowersBefore - 1, 'die abgerissene Blume');
  check(!village.buildings.some((b) => b.type === 'flower' && b.x === flowers[0].x && b.y === flowers[0].y), 'Die falsche Blume wurde abgerissen');
  await sleep(700);
  await exitTool('demolish');
  await sleep(500);
  await shot(`${name}-dorf`);

  // --- Antippen eines Hauses ohne Weg erklärt, was fehlt ---
  step('Hinweis am Haus ohne Weg');
  await tapTile({ x: target.x, y: target.y });
  await waitForVillage(page, (v) => /braucht einen Weg/.test(v.hint), 'den Hinweis „braucht einen Weg“');

  // --- Ziehen bleibt die Kamera, auch mit aktivem Werkzeug ---
  if (drag) {
    step('Ziehen bewegt nur die Kamera');
    await selectTool('deco');
    const camBefore = await cameraAtRest();
    const countBefore = (await readVillage(page)).buildings.length;
    await drag({ x: size.width * 0.35, y: size.height * 0.35 }, { x: size.width * 0.55, y: size.height * 0.3 });
    const camAfter = await cameraAtRest();
    village = await readVillage(page);
    check(Math.abs(camAfter.x - camBefore.x) > 20 || Math.abs(camAfter.y - camBefore.y) > 5, 'Ziehen mit Werkzeug: Kamera hat sich nicht bewegt');
    check(village.preview === 'none', `Ziehen mit Werkzeug: Vorschau ${village.preview}, erwartet „none“`);
    check(village.buildings.length === countBefore, 'Ziehen mit Werkzeug hat gebaut');
    await exitTool('deco');
  }
}

/** Startet das Spiel (Tippen zum Spielen) und wartet auf die Insel. */
async function enterIsland(page, profile, waitForScene) {
  await page.goto(GAME_URL, { waitUntil: 'load' });
  await waitForScene('boot');
  await page.waitForTimeout(500);
  const { width, height } = profile.context.viewport;
  if (profile.context.hasTouch) await page.touchscreen.tap(width / 2, height * 0.54);
  else await page.mouse.click(width / 2, height * 0.54);
  await waitForScene('island');
  await waitForCameraRest(page);
  await page.waitForTimeout(2500);
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

  if (!M2_ONLY) {
    if (profile.context.hasTouch) {
      await testTouchCamera({ page, context, problems, check, shot, size: { width, height } });
    } else {
      await testMouseCamera({ page, problems, check, shot, size: { width, height } });
    }
    // Frische Insel für die Bau-Prüfungen (die Kamera-Prüfungen haben Zoom und Ausschnitt verstellt).
    await enterIsland(page, profile, waitForScene);
  }

  const size = { width, height };
  const input = profile.context.hasTouch
    ? { tap: (p) => page.touchscreen.tap(p.x, p.y) }
    : { tap: (p) => page.mouse.click(p.x, p.y) };
  const cdp = profile.context.hasTouch ? await context.newCDPSession(page) : undefined;
  const drag = cdp ? (from, to) => touchDevice(cdp).drag(from, to, { steps: 8, pauseMs: 30, holdMs: 200 }) : undefined;
  try {
    await testBuilding({ page, check, shot, size, input, drag, name: profile.name });
  } catch (error) {
    problems.push(`Bauen: ${error.message}`);
    await shot(`${profile.name}-bauen-fehler`).catch(() => {});
  }
  await cdp?.detach();

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
      for (const profile of PROFILES.filter((p) => ONLY_PROFILE === undefined || p.name === ONLY_PROFILE)) {
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
