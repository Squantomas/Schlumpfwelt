#!/usr/bin/env node
/**
 * Lokaler Smoke-Test (läuft NICHT in CI – dort gibt es kein Playwright).
 *
 *   npm run smoke                                # baut, startet `vite preview`, testet, räumt auf
 *   npm run smoke -- --no-build                  # vorhandenes dist/ verwenden
 *   npm run smoke -- --out docs/screenshots/m5   # anderer Screenshot-Ordner (Standard: m4)
 *   npm run smoke -- --m2-only                   # nur die Bau-Prüfungen (M2), ohne Kamera, Wirtschaft und Shop (schnell)
 *   npm run smoke -- --m3-only                   # nur die Wirtschafts-Prüfungen (M3), ohne Kamera, Bauen und Shop
 *   npm run smoke -- --m4-only                   # nur die Shop-Prüfungen (M4): Reiter, Schlösser, Freischaltung, Insel (etwa 5 Minuten)
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
 * die Lage der Knöpfe steht in `data-ui` (CSS-px). Screenshots (nur diese kommen nach docs/screenshots/mN/, alle anderen in ein
 * temporäres Verzeichnis): Werkzeugleiste, Vorschau grün und rot, Weg-Vorschau, Haus ohne Weg, Verschieben, Dorf.
 * Seit M4 setzt man alles über den Shop (Werkzeugleiste: Weg, Shop, Verschieben, Abreißen): `tool-shop` öffnet ihn,
 * `tab-<Reiter>`, `item-<Typ>`, `shop-close`, `page-prev|next` stehen in `data-ui`; `data-shop` (`closed` oder
 * `<Reiter>:<Seite>/<Seiten>`), `data-unlocked`, `data-earned`, `data-planted`, `data-tip` und `data-repaint`
 * (Kosten des Boden-Neumalens) kommen dazu. Die M4-Prüfungen: Shop öffnen, Reiter wechseln, gesperrte Karten mit
 * Schloss, Freischaltung (Holzfäller → Schreinerei und Steinbruch, Meldung „Neu im Shop“, Stern), Artikel aus dem Shop
 * setzen, Baum pflanzen und wieder abreißen, Land aufschütten, kleine Bildschirme.
 * Exitcode ≠ 0 bei Konsolenfehlern, Seitenfehlern, fehlgeschlagenen Requests,
 * fehlgeschlagenen Kamera-Prüfungen oder wenn das Spiel nicht in die
 * Insel-Szene wechselt.
 *
 * Playwright wird NICHT als Abhängigkeit installiert: das Skript nutzt das
 * global vorinstallierte Paket (NODE_PATH oder `npm root -g`).
 */
import { execSync, spawn, spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4173;
const URL = `http://localhost:${PORT}/Schlumpfwelt/`;
/** Feste Insel, damit Screenshots und Prüfungen reproduzierbar sind. */
const GAME_URL = `${URL}?seed=1`;
const M2_ONLY = process.argv.includes('--m2-only');
const M3_ONLY = process.argv.includes('--m3-only');
const M4_ONLY = process.argv.includes('--m4-only');
/** `--profile tablet|desktop`: nur dieses Gerät testen (zum Entwickeln). */
const ONLY_PROFILE = argValue('--profile');
const SCREENSHOT_DIR = path.resolve(ROOT, argValue('--out') ?? path.join('docs', 'screenshots', 'm4'));
/** Alle übrigen Screenshots (Kamera-Prüfungen früherer Meilensteine, Zwischenschritte) landen hier, nicht im Repo. */
const TEMP_SCREENSHOT_DIR = path.join(os.tmpdir(), 'schlumpfwelt-smoke');
/** Nur diese Bilder gehören in `docs/screenshots/mN/` – die Screenshots dieses Meilensteins (M4: Shop). */
const KEEP_SCREENSHOTS = new Set([
  'tablet-shop-haeuser',
  'tablet-shop-deko-gesperrt',
  'tablet-shop-insel',
  'tablet-neu-im-shop',
  'tablet-baum-gepflanzt',
  'tablet-land-aufgeschuettet',
  'tablet-shop-handy-hochkant',
  'tablet-shop-handy-quer',
]);

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
      await writeFile(path.join(TEMP_SCREENSHOT_DIR, `${name}-ring.png`), during);
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
      await dragBy(fx * size.width * 0.8, fy * size.height * 0.7);
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
  const top = await reachEdge(0, size.height * 0.7, 'y', 'oben');
  check(top.y < near.y - 100, `Grenze oben: Kamera y=${top.y} nicht über ${near.y}`);
  const right = await reachEdge(-size.width * 0.9, 0, 'x', 'rechts');
  check(right.x > left.x + 500, `Grenze rechts: Kamera x=${right.x} nicht rechts von ${left.x}`);
  const bottom = await reachEdge(0, -size.height * 0.7, 'y', 'unten');
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
  const top = await reachEdge(0, size.height * 0.7, 'y', 'oben');
  check(top.y < near.y - 100, `Grenze oben: Kamera y=${top.y} nicht über ${near.y}`);
  const right = await reachEdge(-size.width * 0.8, 0, 'x', 'rechts');
  check(right.x > left.x + 500, `Grenze rechts: Kamera x=${right.x} nicht rechts von ${left.x}`);
  const bottom = await reachEdge(0, -size.height * 0.7, 'y', 'unten');
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
const FOOTPRINT = {
  'house-red': 2,
  'house-blue': 2,
  'house-yellow': 2,
  'house-big': 3,
  'house-garden': 3,
  fountain: 2,
  pond: 2,
  flowerbed: 2,
  lumberjack: 2,
  'berry-garden': 2,
  quarry: 2,
  carpenter: 2,
  bakery: 2,
  market: 3,
};
const footprintOf = (type) => FOOTPRINT[type] ?? 1;

/** In welchem Reiter des Shops ein Typ steht (siehe `shop.category` in `buildings.json`). */
const SHOP_TAB = {
  'house-red': 'houses',
  'house-blue': 'houses',
  'house-yellow': 'houses',
  'house-big': 'houses',
  'house-garden': 'houses',
  flower: 'deco',
  bush: 'deco',
  fence: 'deco',
  bench: 'deco',
  flowerbed: 'deco',
  lantern: 'deco',
  pond: 'deco',
  fountain: 'deco',
  lumberjack: 'production',
  'berry-garden': 'production',
  quarry: 'production',
  carpenter: 'production',
  bakery: 'production',
  market: 'production',
  tree: 'island',
  rock: 'island',
  beach: 'island',
  meadow: 'island',
};

/** Bau-Zustand aus `<html data-tool|variant|preview|hint|markers|buildings|paths|terrain|ui|stock|producers|card|shop|tip|unlocked|earned|planted|repaint>`. */
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
      stock: JSON.parse(d.stock ?? '{}'),
      producers: JSON.parse(d.producers ?? '[]').map(([id, status, delivered]) => ({ id, status, delivered })),
      card: d.card ?? '',
      shop: d.shop ?? 'closed',
      tip: d.tip ?? '',
      unlocked: (d.unlocked ?? '').split(',').filter(Boolean),
      earned: Number(d.earned ?? 0),
      planted: Number(d.planted ?? 0),
      repaint: JSON.parse(d.repaint ?? '{}'),
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
  // Oben liegen Lagerleiste und (bei aktivem Werkzeug) die Hinweisleiste bis etwa y = 160.
  const usable = { left: 90, right: size.width - 140, top: 170, bottom: toolbarTop - 160 };
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
 * Prüft den offenen Shop auf einem Bildschirm `w × h`: das Feld liegt unter der Lagerleiste und im Bild, Zoom-Knöpfe und
 * Werkzeugleiste sind verdeckt, Reiter, ✕ und Pfeile sind mindestens 48 px groß, jede Seite zeigt mindestens 2 Karten, die
 * Karten liegen im Feld, überlappen sich nicht und sind mindestens 88×72 px groß.
 */
function checkShopFits({ village: v, w, h, tab, check }) {
  const where = `${w}×${h} (${tab})`;
  const inBounds = (spot, p) => check(p.x - 24 >= 0 && p.x + 24 <= w && p.y - 24 >= 0 && p.y + 24 <= h, `${where}: „${spot}“ ragt über den Bildrand (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
  for (const [spot, p] of Object.entries(v.ui)) inBounds(spot, p);
  const stockBottom = v.ui.stock.y + v.ui.stock.h / 2;
  const panel = v.ui.shop;
  check(panel !== undefined, `${where}: kein Shop-Feld veröffentlicht`);
  if (!panel) return;
  check(panel.y - panel.h / 2 >= stockBottom - 0.5 && panel.y + panel.h / 2 <= h + 0.5 && panel.x - panel.w / 2 >= -0.5 && panel.x + panel.w / 2 <= w + 0.5, `${where}: Shop überdeckt die Lagerleiste oder ragt über den Rand`);
  check(!('zoom-in' in v.ui) && !('zoom-out' in v.ui) && !('tool-path' in v.ui) && !('confirm' in v.ui), `${where}: Zoom-Knöpfe, Werkzeugleiste oder ✓ liegen unter dem Shop`);
  const cards = Object.entries(v.ui).filter(([spot]) => spot.startsWith('item-'));
  check(cards.length >= 2, `${where}: nur ${cards.length} Karten pro Seite`);
  for (const [spot, c] of cards) {
    check(c.x - c.w / 2 >= panel.x - panel.w / 2 && c.x + c.w / 2 <= panel.x + panel.w / 2 && c.y - c.h / 2 >= panel.y - panel.h / 2 && c.y + c.h / 2 <= panel.y + panel.h / 2, `${where}: „${spot}“ liegt nicht im Shop-Feld`);
    check(c.h >= 72 && c.w >= 88, `${where}: „${spot}“ nur ${c.w}×${c.h} px`);
  }
  for (const [a, ca] of cards) {
    for (const [b, cb] of cards) {
      if (a < b) check(Math.abs(ca.x - cb.x) >= (ca.w + cb.w) / 2 - 0.5 || Math.abs(ca.y - cb.y) >= (ca.h + cb.h) / 2 - 0.5, `${where}: „${a}“ überdeckt „${b}“`);
    }
  }
  for (const spot of [...Object.keys(v.ui).filter((name) => name.startsWith('tab-')), 'shop-close', ...Object.keys(v.ui).filter((name) => name.startsWith('page-'))]) {
    const p = v.ui[spot];
    check(p !== undefined && (p.w === undefined || (p.w >= 48 && p.h >= 48)), `${where}: „${spot}“ kleiner als 48 px`);
  }
  // Reiter, ✕ und Karten überdecken sich auch gegenseitig nicht.
  const parts = Object.entries(v.ui).filter(([spot]) => spot.startsWith('item-') || spot.startsWith('tab-') || spot === 'shop-close');
  for (const [a, pa] of parts) {
    for (const [b, pb] of parts) {
      if (a < b && pa.w !== undefined && pb.w !== undefined) {
        check(Math.abs(pa.x - pb.x) >= (pa.w + pb.w) / 2 - 0.5 || Math.abs(pa.y - pb.y) >= (pa.h + pb.h) / 2 - 0.5, `${where}: „${a}“ überdeckt „${b}“`);
      }
    }
  }
}

/** Gemeinsame Bedien-Helfer für die Bau- und Wirtschafts-Prüfungen: Knöpfe, Kacheln, Werkzeug, ✓. */
function buildHelpers({ page, check, size, input, name }) {
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
  /** Öffnet den Shop (Knopf in der Werkzeugleiste) und wartet, bis er offen ist. */
  const openShop = async () => {
    await tapUi('tool-shop');
    return waitForVillage(page, (v) => v.shop !== 'closed' && v.tool === 'shop', 'den offenen Shop');
  };
  /** Wechselt im offenen Shop den Reiter. */
  const openTab = async (tab) => {
    await tapUi(`tab-${tab}`);
    return waitForVillage(page, (v) => v.shop.startsWith(`${tab}:`), `der Reiter ${tab}`);
  };
  /**
   * Wählt einen Artikel im Shop: öffnet ihn (falls zu), wechselt den Reiter, blättert bei Bedarf und tippt die Karte.
   * Danach ist das Platzieren an (`tool` = place, `variant` = Typ) und der Shop zu.
   */
  const pickItem = async (typeId) => {
    let v = await readVillage(page);
    if (v.shop === 'closed') v = await openShop();
    const tab = SHOP_TAB[typeId];
    if (!v.shop.startsWith(`${tab}:`)) v = await openTab(tab);
    for (let i = 0; i < 6 && !(`item-${typeId}` in v.ui); i += 1) {
      await tapUi('page-next');
      await sleep(350);
      v = await readVillage(page);
    }
    check(`item-${typeId}` in v.ui, `Shop: Karte ${typeId} fehlt im Reiter ${tab}`);
    await tapUi(`item-${typeId}`);
    return waitForVillage(page, (state) => state.tool === 'place' && state.variant === typeId && state.shop === 'closed', `den gewählten Artikel ${typeId}`);
  };
  /** Zurück auf „Anschauen“ geht nur über das ✕ in der Hinweisleiste (das Werkzeug erneut antippen schaltet nicht ab). */
  const exitTool = async () => {
    await tapUi('exit');
    await waitForVillage(page, (v) => v.tool === 'view', 'zurück auf „Anschauen“');
  };
  /** ✓ antippen und warten, bis `predicate` stimmt. */
  const confirm = async (predicate, what) => {
    await waitForVillage(page, (v) => v.ui.confirm?.enabled === true, 'ein aktives ✓');
    await tapUi('confirm');
    return waitForVillage(page, predicate, what);
  };
  return { step, cameraAtRest, tapUi, tapTile, selectTool, openShop, openTab, pickItem, exitTool, confirm };
}

/**
 * Baut im Spiel (M2) und prüft den Zustand. `input.tap(point)` tippt oder klickt. Jeder Fehler wird als Problem
 * gemeldet, der Test bricht dann ab (die Schritte bauen aufeinander auf).
 */
async function testBuilding({ page, check, shot, size, input, drag, name }) {
  const { step, cameraAtRest, tapUi, tapTile, selectTool, openShop, openTab, pickItem, exitTool, confirm } = buildHelpers({ page, check, size, input, name });
  const count = (village, type) => village.buildings.filter((b) => b.type === type).length;

  let village = await waitForVillage(page, (v) => v.buildings.length > 0, 'das Startdorf');
  // Seit M3 startet die Kamera mit Kacheln von mindestens 32 px; die Bau-Prüfungen brauchen den Überblick (Wasser, freie Flächen) wie früher.
  for (let i = 0; i < 2; i += 1) {
    await input.tap(village.ui['zoom-out']);
    await sleep(300);
  }
  await cameraAtRest();
  village = await readVillage(page);
  check(village.tool === 'view', `Start: Werkzeug ${village.tool} statt „view“`);
  check(village.buildings.some((b) => b.type.startsWith('house') && b.connected) && village.paths.length > 0, 'Start: kein Haus mit Weg im Startdorf');
  check(village.markers === 0, `Start: ${village.markers} Markierungen, erwartet 0`);
  for (const tool of ['path', 'shop', 'move', 'demolish']) check(`tool-${tool}` in village.ui, `Werkzeugleiste: Knopf ${tool} fehlt`);
  check(!('tool-house' in village.ui) && !('tool-deco' in village.ui) && !('tool-building' in village.ui), 'Werkzeugleiste: die alten Kauf-Werkzeuge Haus, Gebäude, Deko sind noch da');
  await sleep(800);
  await shot(`${name}-werkzeugleiste`);

  // --- Ungültiger Platz auf Wasser: rote Vorschau, ✓ baut nichts ---
  step('Haus auf Wasser: rot, ✓ baut nichts');
  await pickItem('house-red');
  // Der Shop-Knopf öffnet den Shop auch beim Platzieren; ✕ im Shop führt zum selben Artikel zurück.
  await tapUi('tool-shop');
  await waitForVillage(page, (v) => v.shop !== 'closed', 'der Shop aus dem Platzieren heraus');
  await tapUi('shop-close');
  await waitForVillage(page, (v) => v.tool === 'place' && v.variant === 'house-red' && v.shop === 'closed', 'zurück zum roten Pilzhaus');
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
    check(/Wasser/.test(village.hint), `Wasser: Hinweis „${village.hint}“ nennt den Grund nicht`);
    check(village.preview === 'place:terrain', 'Wasser: Vorschau ist nach dem ✓ verschwunden');
    await tapUi('cancel');
    await waitForVillage(page, (v) => v.preview === 'none', 'ohne Vorschau nach ✕');
  }
  await exitTool();

  // --- Weg zu einem Ziel auf Wasser: keine Route, rot, ✓ gesperrt, Grund im Hinweis ---
  step('Weg zum Wasser: rot, ✓ gesperrt');
  village = await readVillage(page);
  const from = findFreeArea(village, cam, size, 1, 1, { margin: 0 });
  check(from !== undefined && water !== undefined, 'Kein Platz für den Weg zum Wasser gefunden');
  if (from && water) {
    await selectTool('path');
    await tapTile(from);
    await tapTile(water);
    village = await waitForVillage(page, (v) => /^path:/.test(v.preview) && v.ui.confirm?.enabled === false, 'rote Weg-Vorschau mit gesperrtem ✓');
    check(/Wasser/.test(village.hint), `Weg zum Wasser: Hinweis „${village.hint}“ nennt den Grund nicht`);
    await tapUi('cancel');
    await exitTool();
  }

  // --- Heranzoomen: Kacheln etwa 47 px ---
  const zoomSpots = (await readVillage(page)).ui;
  for (let i = 0; i < 2; i += 1) {
    await input.tap(zoomSpots['zoom-in']);
    await sleep(200);
  }
  cam = await cameraAtRest();
  check(cam.zoom * TILE > 30, `Heranzoomen: Kachel nur ${(cam.zoom * TILE).toFixed(0)} px groß`);
  village = await readVillage(page);

  // --- Rot auch auf einem Gebäude („blocked“) ---
  step('Haus auf ein Haus: rot');
  await pickItem('house-red');
  const start = village.buildings.find((b) => b.type.startsWith('house'));
  await tapTile({ x: start.x, y: start.y + 1 });
  village = await waitForVillage(page, (v) => v.preview === 'place:blocked', 'rote Vorschau auf dem Haus');
  await shot(`${name}-vorschau-rot`);
  await tapUi('confirm');
  await sleep(700);
  check((await readVillage(page)).buildings.length === village.buildings.length, 'Überlappung: ✓ hat trotzdem gebaut');
  await tapUi('cancel');
  await exitTool();

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
  await shot(`${name}-weg-vorschau`);
  const pathsBefore = village.paths.length;
  village = await confirm((v) => v.paths.length === pathsBefore + 6, 'sechs neue Wegkacheln');
  check(lTiles.every((tile) => village.paths.some(([x, y]) => x === tile.x && y === tile.y)), 'Weg: nicht alle Kacheln der L-Linie liegen');
  check(village.tool === 'path' && village.preview === 'none', `Weg: nach ✓ Werkzeug ${village.tool}, Vorschau ${village.preview}`);

  // --- Haus ohne Weg: Markierung sichtbar ---
  step('Haus ohne Weg: Markierung');
  await pickItem('house-blue');
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
  // Beim Platzieren steht links unten der Chip „zurück zum Shop“; ein Tipp darauf öffnet den Shop, die Vorschau bleibt.
  await waitForVillage(page, (v) => 'chip' in v.ui && v.shop === 'closed', 'den Chip');
  await shot(`${name}-vorschau-gruen`);
  await tapUi('chip');
  await waitForVillage(page, (v) => v.shop !== 'closed' && 'item-house-yellow' in v.ui, 'der aus dem Chip geöffnete Shop');
  check(!('confirm' in (await readVillage(page)).ui), 'Shop offen: ✓ ist noch zu sehen');
  await tapUi('item-house-yellow');
  await waitForVillage(page, (v) => v.variant === 'house-yellow' && v.preview === 'place:ok' && 'chip' in v.ui, 'die gelbe Variante (Vorschau bleibt)');
  await tapUi('chip');
  await waitForVillage(page, (v) => 'item-house-blue' in v.ui, 'der Shop noch einmal');
  await tapUi('item-house-blue');
  await waitForVillage(page, (v) => v.variant === 'house-blue' && v.preview === 'place:ok' && 'chip' in v.ui, 'wieder die blaue Variante');
  const houses = village.buildings.length;
  village = await confirm((v) => v.buildings.length === houses + 1 && v.markers === 1, 'das neue Haus mit Markierung');
  const blueHouse = village.buildings.find((b) => b.type === 'house-blue');
  check(blueHouse && blueHouse.x === houseArea.x && blueHouse.y === houseArea.y, `Haus steht auf ${blueHouse?.x},${blueHouse?.y} statt ${houseArea.x},${houseArea.y}`);
  check(blueHouse && !blueHouse.connected, 'Haus ohne Weg gilt als angeschlossen');
  check(village.tool === 'place' && village.variant === 'house-blue', `Haus: nach ✓ Werkzeug ${village.tool}, Artikel ${village.variant}`);
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
  await pickItem('flower');
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
    check(village.tool === 'place' && village.variant === 'flower', `Blume ${i + 1}: Werkzeug ${village.tool} nach ✓, erwartet „place“ mit Blume`);
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
  await exitTool();
  await sleep(500);
  await shot(`${name}-dorf`);

  // --- Antippen eines Hauses ohne Weg erklärt, was fehlt ---
  step('Hinweis am Haus ohne Weg (Tipp aufs Dach)');
  await tapTile({ x: target.x, y: target.y - 1 }); // die Kachel hinter dem Haus, aber auf seinem Dach
  await waitForVillage(page, (v) => /braucht einen Weg/.test(v.hint), 'den Hinweis „braucht einen Weg“');

  // --- Ziehen bleibt die Kamera, auch mit aktivem Werkzeug ---
  if (drag) {
    step('Ziehen bewegt nur die Kamera');
    await pickItem('flower');
    const camBefore = await cameraAtRest();
    const countBefore = (await readVillage(page)).buildings.length;
    await drag({ x: size.width * 0.35, y: size.height * 0.35 }, { x: size.width * 0.55, y: size.height * 0.3 });
    const camAfter = await cameraAtRest();
    village = await readVillage(page);
    check(Math.abs(camAfter.x - camBefore.x) > 20 || Math.abs(camAfter.y - camBefore.y) > 5, 'Ziehen mit Werkzeug: Kamera hat sich nicht bewegt');
    check(village.preview === 'none', `Ziehen mit Werkzeug: Vorschau ${village.preview}, erwartet „none“`);
    check(village.buildings.length === countBefore, 'Ziehen mit Werkzeug hat gebaut');
    await exitTool();

    // --- Kleine Bildschirme (Handy hochkant und quer): nichts ragt über den Rand oder überdeckt etwas, Land bleibt antippbar ---
    for (const [w, h] of [[320, 568], [568, 320], [640, 360]]) {
      step(`Kleiner Bildschirm ${w}×${h}: Leisten im Bild, Land antippbar`);
      await page.setViewportSize({ width: w, height: h });
      await sleep(1500);
      const small = { width: w, height: h };
      const cam = await cameraAtRest();
      let v = await readVillage(page);
      const inBounds = (spot, p) => check(p.x - 24 >= 0 && p.x + 24 <= w && p.y - 24 >= 0 && p.y + 24 <= h, `${w}×${h}: „${spot}“ ragt über den Bildrand (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
      // Ein antippbares Grasstück: links oben von der Mitte, frei vom Bedienfeld (Hinweisleiste oben, Werkzeugleiste unten).
      const toolbarTop = v.ui['tool-path'].y - 40;
      // Oben liegen die Lagerleiste (M3) und darunter die Hinweisleiste (72 px), wenn ein Werkzeug an ist.
      const topFree = v.ui.stock ? v.ui.stock.y + v.ui.stock.h / 2 + 90 : 100;
      let best;
      for (let y = 0; y < MAP_TILES; y += 1) {
        for (let x = 0; x < MAP_TILES; x += 1) {
          if (v.terrain[y * MAP_TILES + x] !== 'g') continue;
          const p = screenOfTile(cam, small, { x, y });
          // Frei von Chip (links unten), ✓/✕ (rechts unten), Zoom-Knöpfen (rechts oben), Hinweis- und Werkzeugleiste.
          if (p.x < 92 || p.x > Math.max(150, w - 170) || p.y < topFree || p.y > toolbarTop - 24) continue;
          const distance = Math.hypot(p.x - w * 0.3, p.y - h * 0.4);
          if (!best || distance < best.distance) best = { x, y, p, distance };
        }
      }
      check(best !== undefined, `${w}×${h}: kein antippbares Land im Bild`);
      check(toolbarTop > h * 0.4, `${w}×${h}: Werkzeugleiste nimmt mehr als die halbe Höhe`);

      // Der Shop: jeder Reiter passt ins Bild, unter die Lagerleiste, die Karten überlappen sich nicht und liegen im Feld.
      await openShop();
      for (const tab of ['houses', 'deco', 'production', 'island']) {
        v = await openTab(tab);
        checkShopFits({ village: v, w, h, tab, check });
        if (tab === 'deco') await shot(`${name}-klein-${w}x${h}`);
      }
      await tapUi('shop-close');
      await waitForVillage(page, (state) => state.tool === 'view' && state.shop === 'closed', `der geschlossene Shop bei ${w}×${h}`);

      // Einen Artikel wählen und Land antippen: ✓/✕/Chip stören nichts.
      await pickItem('flower');
      await sleep(500); // kurz nach einem Tipp auf einen Knopf ignoriert die Karte Tipps (Doppeltipp-Schutz)
      if (best) {
        await input.tap(best.p);
        v = await waitForVillage(page, (state) => state.lastTap === tileKey(best.x, best.y) && state.preview.startsWith('place:') && 'confirm' in state.ui, `die Vorschau auf Land bei ${w}×${h}`, 5000);
        const zoomSpots = [v.ui['zoom-in'], v.ui['zoom-out']];
        for (const [spot, p] of Object.entries(v.ui)) inBounds(spot, p);
        for (const spot of ['confirm', 'cancel', 'chip']) {
          for (const z of zoomSpots) check(Math.hypot(v.ui[spot].x - z.x, v.ui[spot].y - z.y) >= 28 + 36, `${w}×${h}: „${spot}“ überdeckt einen Zoom-Knopf`);
        }
        check(Math.hypot(v.ui.confirm.x - v.ui.cancel.x, v.ui.confirm.y - v.ui.cancel.y) >= 72, `${w}×${h}: ✓ und ✕ überdecken sich`);
        // Der Chip öffnet den Shop: ✓/✕ sind dann weg; ✕ im Shop führt zurück zur Vorschau.
        await tapUi('chip');
        v = await waitForVillage(page, (state) => state.shop !== 'closed', 'der Shop aus dem Chip');
        check(!('confirm' in v.ui) && !('cancel' in v.ui), `${w}×${h}: ✓/✕ liegen unter dem offenen Shop`);
        await tapUi('shop-close');
        await waitForVillage(page, (state) => state.shop === 'closed' && state.tool === 'place' && state.preview.startsWith('place:') && 'confirm' in state.ui, 'die Vorschau nach dem Schließen des Shops');
        await sleep(500);
        await tapUi('cancel');
      }
      await tapUi('exit');
      await waitForVillage(page, (state) => state.tool === 'view', 'zurück auf „Anschauen“');
      // Im Anschauen: ein Tipp auf Land wird gemeldet.
      if (best) {
        await input.tap(best.p);
        await waitForVillage(page, (state) => state.lastTap === tileKey(best.x, best.y), `den Tipp auf Land bei ${w}×${h}`, 4000);
      }
    }
    await page.setViewportSize(size);
    await sleep(1000);
  }
}

// ---------------------------------------------------------------------------------------------
// M3 „Wirtschaft“: Lager, Kosten, Produktion, Markt, Infokarte
// ---------------------------------------------------------------------------------------------

/**
 * Sucht einen Bauplatz für ein Produktionsgebäude `fp × fp`: freie Wiese, mit einer Kante direkt an einem Weg
 * (`atPath`), mit `terrain` (Buchstabe: `f` Wald, `r` Fels) im Radius `radius` (`withNearby: true`) oder gerade ohne
 * (`withNearby: false`); gut antippbar, möglichst nah an der Bildschirmmitte. Gibt auch die Kachel zurück, die man antippt
 * (untere Reihe, Mitte bzw. links davon).
 */
function findWorkSpot(village, cam, size, { fp = 2, atPath = true, terrain, radius = 4, withNearby = true, skip = [] }) {
  const occupied = occupiedTiles(village);
  for (const tile of skip) occupied.add(tileKey(tile.x, tile.y));
  const pathSet = new Set(village.paths.map(([x, y]) => tileKey(x, y)));
  const toolbarTop = village.ui['tool-path'].y - 52;
  // Oben liegen Lagerleiste und (bei aktivem Werkzeug) die Hinweisleiste bis etwa y = 160.
  const usable = { left: 90, right: size.width - 140, top: 170, bottom: toolbarTop - 170 };
  const grass = (x, y) => village.terrain[y * MAP_TILES + x] === 'g' && !occupied.has(tileKey(x, y));
  let best;
  for (let y = 2; y < MAP_TILES - 2 - fp; y += 1) {
    for (let x = 2; x < MAP_TILES - 2 - fp; x += 1) {
      let free = true;
      for (let dy = 0; dy < fp && free; dy += 1) for (let dx = 0; dx < fp && free; dx += 1) free = grass(x + dx, y + dy);
      if (!free) continue;
      let touchesPath = false;
      for (let i = 0; i < fp; i += 1) {
        touchesPath ||= pathSet.has(tileKey(x + i, y - 1)) || pathSet.has(tileKey(x + i, y + fp)) || pathSet.has(tileKey(x - 1, y + i)) || pathSet.has(tileKey(x + fp, y + i));
      }
      if (atPath && !touchesPath) continue;
      if (!atPath && touchesPath) continue;
      if (terrain) {
        let found = false;
        for (let ty = y - radius; ty <= y + fp - 1 + radius && !found; ty += 1) {
          for (let tx = x - radius; tx <= x + fp - 1 + radius && !found; tx += 1) {
            found = tx >= 0 && ty >= 0 && tx < MAP_TILES && ty < MAP_TILES && village.terrain[ty * MAP_TILES + tx] === terrain;
          }
        }
        if (found !== withNearby) continue;
      }
      const tap = { x: x + Math.floor((fp - 1) / 2), y: y + fp - 1 };
      const p = screenOfTile(cam, size, tap);
      const top = screenOfTile(cam, size, { x, y });
      if (p.x < usable.left || p.x > usable.right || top.y < usable.top || p.y > usable.bottom) continue;
      const distance = Math.hypot(p.x - size.width / 2, p.y - size.height * 0.45);
      if (!best || distance < best.distance) best = { x, y, tap, distance };
    }
  }
  return best;
}

/** Überdeckt das Rechteck `rect` (Mitte x, y, Breite w, Höhe h) den Zoom-Knopf (Kreis um `zoom` mit Radius `radius`)? */
function rectHitsCircle(rect, zoom, radius) {
  const left = rect.x - rect.w / 2;
  const top = rect.y - rect.h / 2;
  const nearestX = Math.max(left, Math.min(zoom.x, left + rect.w));
  const nearestY = Math.max(top, Math.min(zoom.y, top + rect.h));
  return Math.hypot(zoom.x - nearestX, zoom.y - nearestY) < radius;
}

/** Wirtschaft (M3): Lager, Bauen kostet, Produktion, Abreißen erstattet, Infokarte, kleine Bildschirme. */
async function testEconomy({ page, check, shot, size, input, name }) {
  const { step, cameraAtRest, tapUi, tapTile, selectTool, openShop, openTab, pickItem, exitTool, confirm } = buildHelpers({ page, check, size, input, name });
  const waitStock = (predicate, what, timeoutMs = 30_000) => waitForVillage(page, (v) => Object.keys(v.stock).length > 0 && predicate(v.stock, v), what, timeoutMs);
  const typeCount = (village, type) => village.buildings.filter((b) => b.type === type).length;

  // --- Lageranzeige ---
  step('Lagerleiste');
  let village = await waitStock(() => true, 'die Lagerleiste');
  check(village.buildings.some((b) => b.type === 'market') && village.buildings.some((b) => b.type === 'berry-garden'), 'Start: Marktplatz oder Beerengarten fehlt im Startdorf');
  const start = village.stock;
  check(start.coins > 0 && start.wood > 0, `Start: Lager ${JSON.stringify(start)} ist leer`);
  for (const id of ['coins', 'wood', 'stone', 'berries', 'furniture', 'cake']) check(typeof start[id] === 'number', `Lagerleiste: ${id} fehlt`);
  const stockSpot = village.ui.stock;
  check(stockSpot !== undefined && stockSpot.w > 100 && stockSpot.h >= 30, 'Lagerleiste: keine Größe veröffentlicht');
  const zoomIn = village.ui['zoom-in'];
  const zoomRadius = size.height < 400 ? 28 : 34;
  check(!rectHitsCircle(stockSpot, zoomIn, zoomRadius) && !rectHitsCircle(stockSpot, village.ui['zoom-out'], zoomRadius), 'Lagerleiste überdeckt die Zoom-Knöpfe');
  const garden = village.buildings.find((b) => b.type === 'berry-garden');
  const market = village.buildings.find((b) => b.type === 'market');
  check(village.producers.find((p) => p.id === garden.id)?.status === 'working', 'Start: der Beerengarten arbeitet nicht');
  // Der Markt kauft auch überschüssige Beeren: im Leerlauf, bis mehr als die Reserve da ist.
  check(['idle', 'working'].includes(village.producers.find((p) => p.id === market.id)?.status), 'Start: der Markt ist weder im Leerlauf noch bei der Arbeit');
  check(village.markers === 0, `Start: ${village.markers} Schilder, erwartet 0`);
  await shot(`${name}-lagerleiste`);
  // Der Beerengarten liefert von allein (der Markt kauft Beeren über der Reserve, darum zählt die Lieferung, nicht das Lager).
  const gardenDelivered = village.producers.find((p) => p.id === garden.id)?.delivered ?? 0;
  await waitForVillage(page, (v) => (v.producers.find((p) => p.id === garden.id)?.delivered ?? 0) > gardenDelivered, 'eine Lieferung des Beerengartens', 40_000);

  // --- Shop-Reiter „Gebäude“ mit Kosten ---
  step('Shop: Reiter Gebäude mit Kosten');
  await openShop();
  village = await openTab('production');
  const productionTypes = ['lumberjack', 'berry-garden', 'quarry', 'carpenter', 'bakery', 'market'];
  for (const type of productionTypes) check(`item-${type}` in village.ui, `Gebäude-Reiter: ${type} fehlt`);
  // Am Start ist alles bezahlbar, was frei ist; Schreinerei und Steinbruch warten auf den ersten Holzfäller (Schloss, grau).
  check(['lumberjack', 'berry-garden', 'bakery', 'market'].every((type) => village.ui[`item-${type}`]?.state === 'ok' && village.ui[`item-${type}`]?.dim === false), 'Gebäude-Reiter: Holzfäller, Beerengarten, Bäckerei und Markt sollen am Start bezahlbar sein');
  check(['quarry', 'carpenter'].every((type) => village.ui[`item-${type}`]?.state === 'locked'), 'Gebäude-Reiter: Steinbruch und Schreinerei sollen am Start gesperrt sein');
  await sleep(500);
  await shot(`${name}-gebaeude-auswahl`);

  // --- Bäckerei am Weg: Geld wird abgebucht ---
  step('Bäckerei bauen');
  await pickItem('bakery');
  village = await readVillage(page); // mit Werkzeugleiste (der Shop war offen)
  let cam = await cameraAtRest();
  const bakerySpot = findWorkSpot(village, cam, size, { fp: 2, atPath: true });
  check(bakerySpot !== undefined, 'Kein Platz für die Bäckerei am Weg');
  if (!bakerySpot) return;
  const before = (await readVillage(page)).stock;
  await tapTile(bakerySpot.tap);
  await waitForVillage(page, (v) => v.preview === 'place:ok', 'grüne Vorschau für die Bäckerei');
  village = await confirm((v) => typeCount(v, 'bakery') === 1, 'die Bäckerei');
  const bakery = village.buildings.find((b) => b.type === 'bakery');
  check(bakery.connected, 'Bäckerei steht nicht am Weg');
  // Der Markt kauft nebenbei überschüssige Beeren: die Taler können ein paar Münzen über dem Preis liegen.
  village = await waitStock((stock) => stock.coins <= before.coins - 25 + 8 && stock.wood <= before.wood - 6, 'abgebuchte Kosten der Bäckerei', 8000);
  check(village.stock.coins >= before.coins - 25, `Bäckerei: Taler ${village.stock.coins}, erwartet mindestens ${before.coins - 25}`);

  // --- Holzfäller ohne Bäume in der Nähe: rot mit Hinweis ---
  step('Holzfäller ohne Bäume: rot');
  await pickItem('lumberjack');
  village = await readVillage(page);
  // Etwas herauszoomen: Platz ohne Bäume im Umkreis von 4 Kacheln gibt es erst mit größerem Ausschnitt.
  await input.tap(village.ui['zoom-out']);
  await sleep(300);
  cam = await cameraAtRest();
  const bare = findWorkSpot(village, cam, size, { fp: 2, atPath: false, terrain: 'f', radius: 4, withNearby: false });
  check(bare !== undefined, 'Kein Platz ohne Bäume in der Nähe gefunden');
  if (bare) {
    await sleep(500);
    await tapTile(bare.tap);
    village = await waitForVillage(page, (v) => v.preview === 'place:noNearby', 'rote Vorschau ohne Bäume');
    check(/Bäume/.test(village.hint), `Ohne Bäume: Hinweis „${village.hint}“ nennt den Grund nicht`);
    check(village.ui.confirm?.enabled === false, 'Ohne Bäume: ✓ ist nicht gesperrt');
    const count = village.buildings.length;
    await tapUi('confirm');
    await sleep(800);
    check((await readVillage(page)).buildings.length === count, 'Ohne Bäume: ✓ hat trotzdem gebaut');
    await tapUi('cancel');
    await waitForVillage(page, (v) => v.preview === 'none', 'ohne Vorschau nach ✕');
  }
  await input.tap((await readVillage(page)).ui['zoom-in']);
  await sleep(300);
  await cameraAtRest();

  // --- Holzfäller am Wald mit Weg: Radius-Vorschau, dann steigt das Holz ---
  step('Holzfäller am Wald');
  village = await readVillage(page);
  cam = await cameraAtRest();
  const wood = findWorkSpot(village, cam, size, { fp: 2, atPath: true, terrain: 'f', radius: 4, withNearby: true });
  check(wood !== undefined, 'Kein Platz für den Holzfäller am Weg mit Wald in der Nähe gefunden');
  if (!wood) return;
  await sleep(500);
  await tapTile(wood.tap);
  await waitForVillage(page, (v) => v.preview === 'place:ok', 'grüne Vorschau mit Radius');
  await sleep(600);
  await shot(`${name}-radius-vorschau`);
  const woodBefore = (await readVillage(page)).stock;
  village = await confirm((v) => typeCount(v, 'lumberjack') === 1, 'der Holzfäller');
  const lumberjack = village.buildings.find((b) => b.type === 'lumberjack');
  check(lumberjack.connected, 'Holzfäller steht nicht am Weg');
  village = await waitStock((stock) => stock.coins <= woodBefore.coins - 15 + 12 && stock.coins >= woodBefore.coins - 15, 'abgebuchte Kosten des Holzfällers (nur Taler)', 8000);
  const afterLumberjack = village.stock;
  check(afterLumberjack.wood >= woodBefore.wood, `Holzfäller: Holz ${afterLumberjack.wood} gesunken, er soll nur Taler kosten`);
  // Nach ein paar Sekunden liefert er: das Lager steigt, und der Holzfäller meldet „working“.
  village = await waitStock((stock) => stock.wood > afterLumberjack.wood, 'steigendes Holz (Holzfäller liefert)', 30_000);
  check(village.producers.find((p) => p.id === lumberjack.id)?.delivered >= 1, 'Holzfäller: delivered ist 0, obwohl das Holz stieg');
  check(village.producers.find((p) => p.id === lumberjack.id)?.status === 'working', 'Holzfäller arbeitet nicht');

  // --- Ohne Weg daneben: grün, aber der Hinweis sagt, was zu tun ist ---
  step('Gebäude ohne Weg: Hinweis');
  // Der Steinbruch ist seit dem Holzfäller frei.
  await pickItem('quarry');
  village = await readVillage(page);
  cam = await cameraAtRest();
  const lonely = findWorkSpot(village, cam, size, { fp: 2, atPath: false, terrain: 'r', radius: 5, withNearby: true });
  check(lonely !== undefined, 'Kein Platz am Fels ohne Weg gefunden');
  if (lonely) {
    await sleep(500);
    await tapTile(lonely.tap);
    village = await waitForVillage(page, (v) => v.preview === 'place:ok', 'grüne Vorschau ohne Weg');
    check(/Weg/.test(village.hint), `Ohne Weg: Hinweis „${village.hint}“ sagt nichts vom Weg`);
    await tapUi('cancel');
    await waitForVillage(page, (v) => v.preview === 'none', 'ohne Vorschau nach ✕');
  }

  // --- Zu teuer: rot, ✓ gesperrt, Hinweis nennt, was fehlt ---
  step('Zu teuer: Haus');
  await exitTool();
  village = await openShop();
  village = await openTab('houses');
  // Reicht das Geld noch für ein Haus (40 Taler, 8 Holz), wird eins gebaut; liegt es knapp darunter (ab 33 Taler), ein paar Blumen
  // (3 Taler): der Markt verdient weiter, das Haus soll aber auch ein paar Sekunden später noch zu teuer sein.
  const used = [{ x: lonely?.x ?? -9, y: lonely?.y ?? -9 }];
  for (let guard = 0; guard < 6; guard += 1) {
    const state = village.ui['item-house-red']?.state;
    const coins = village.stock.coins;
    if (state !== 'ok' && coins < 33) break;
    const item = state === 'ok' ? 'house-red' : 'flower';
    const fp = item === 'house-red' ? 2 : 1;
    await tapUi('tab-' + SHOP_TAB[item]);
    await waitForVillage(page, (v) => v.shop.startsWith(`${SHOP_TAB[item]}:`) && `item-${item}` in v.ui, `der Reiter für ${item}`);
    await tapUi(`item-${item}`);
    await waitForVillage(page, (v) => v.variant === item && v.shop === 'closed', `der Artikel ${item}`);
    village = await readVillage(page);
    cam = await cameraAtRest();
    const spot = findFreeArea(village, cam, size, fp, fp, { near: { x: size.width * 0.3, y: size.height * 0.4 }, skip: used });
    check(spot !== undefined, `Kein Platz für ${item}`);
    if (!spot) break;
    used.push({ x: spot.x, y: spot.y });
    await sleep(500);
    await tapTile({ x: spot.x, y: spot.y + fp - 1 });
    await waitForVillage(page, (v) => v.preview === 'place:ok', `grüne Vorschau für ${item}`);
    const before = village.buildings.length;
    await confirm((v) => v.buildings.length === before + 1, item);
    village = await openShop();
    village = await openTab('houses');
  }
  check(village.ui['item-house-red']?.state === 'dear' && village.ui['item-house-red']?.dim === true, 'Haus ist nicht ausgegraut, obwohl etwas fehlt');
  await tapUi('tab-deco');
  village = await waitForVillage(page, (v) => v.shop.startsWith('deco:') && 'item-flower' in v.ui, 'der Deko-Reiter');
  check(village.ui['item-flower'].dim === false, 'Blume ist ausgegraut, obwohl sie bezahlbar ist');
  await tapUi('tab-houses');
  await waitForVillage(page, (v) => v.shop.startsWith('houses:') && 'item-house-red' in v.ui, 'der Häuser-Reiter');
  await tapUi('item-house-red');
  village = await waitForVillage(page, (v) => v.variant === 'house-red' && /fehl/.test(v.hint), 'den Hinweis „Dir fehlen …“ schon beim Wählen');
  check(/Taler|Holz/.test(village.hint), `Haus: Hinweis „${village.hint}“ nennt nicht, was fehlt`);
  village = await readVillage(page);
  cam = await cameraAtRest();
  const houseSpot = findFreeArea(village, cam, size, 2, 2, { near: { x: size.width * 0.3, y: size.height * 0.4 } });
  check(houseSpot !== undefined, 'Kein Platz für das Haus');
  if (houseSpot) {
    await sleep(500);
    await tapTile({ x: houseSpot.x, y: houseSpot.y + 1 });
    village = await waitForVillage(page, (v) => v.preview === 'place:cost', 'rote Vorschau „zu teuer“');
    check(/fehl/.test(village.hint), `Zu teuer: Hinweis „${village.hint}“`);
    check(village.ui.confirm?.enabled === false, 'Zu teuer: ✓ ist nicht gesperrt');
    await sleep(500);
    await shot(`${name}-zu-teuer`);
    const count = village.buildings.length;
    const coins = village.stock.coins;
    await tapUi('confirm');
    await sleep(900);
    village = await readVillage(page);
    check(village.buildings.length === count, 'Zu teuer: ✓ hat trotzdem gebaut');
    check(village.stock.coins >= coins, 'Zu teuer: es wurde Geld abgebucht');
    await tapUi('cancel');
  }
  await exitTool();

  // --- Abreißen erstattet die vollen Kosten ---
  step('Abreißen erstattet');
  await selectTool('demolish');
  village = await readVillage(page);
  await tapTile({ x: lumberjack.x, y: lumberjack.y + 1 });
  village = await waitForVillage(page, (v) => v.preview === 'demolish:4', 'die rote Markierung am Holzfäller');
  check(/zurück/.test(village.hint) && /15 Taler/.test(village.hint), `Abreißen: Hinweis „${village.hint}“ nennt die Erstattung nicht`);
  const beforeDemolish = village.stock;
  await tapUi('confirm');
  village = await waitForVillage(page, (v) => typeCount(v, 'lumberjack') === 0, 'den abgerissenen Holzfäller');
  village = await waitStock((stock) => stock.coins >= beforeDemolish.coins + 15, 'die Erstattung im Lager', 8000);
  await sleep(300);
  await shot(`${name}-erstattung`);
  await exitTool();

  // --- Infokarte: öffnen, schließen per ✕, schließen per Tipp daneben ---
  step('Infokarte');
  village = await readVillage(page);
  check(village.card === '', 'Infokarte ist ohne Tipp offen');
  await cameraAtRest();
  const gardenTile = { x: garden.x + 1, y: garden.y + 1 };
  await tapTile(gardenTile);
  village = await waitForVillage(page, (v) => v.card === String(garden.id) && 'card-close' in v.ui, 'die Infokarte des Beerengartens');
  check(village.ui['card-close'].w >= 64, `Infokarte: ✕ nur ${village.ui['card-close'].w} px groß`);
  const card = village.ui.card;
  check(card.x - card.w / 2 >= 0 && card.x + card.w / 2 <= size.width && card.y - card.h / 2 >= 0 && card.y + card.h / 2 <= size.height, 'Infokarte ragt über den Rand');
  check(!rectHitsCircle(card, zoomIn, zoomRadius), 'Infokarte überdeckt einen Zoom-Knopf');
  check(card.y - card.h / 2 >= village.ui.stock.y + village.ui.stock.h / 2 - 0.5, 'Infokarte überdeckt die Lagerleiste');
  await sleep(900);
  await shot(`${name}-info-karte`);
  await tapUi('card-close');
  village = await waitForVillage(page, (v) => v.card === '', 'die geschlossene Karte (✕)');
  await sleep(500);
  await tapTile(gardenTile);
  await waitForVillage(page, (v) => v.card === String(garden.id), 'die wieder geöffnete Karte');
  const lastTap = (await readVillage(page)).lastTap;
  await input.tap({ x: size.width * 0.06, y: size.height * 0.5 });
  village = await waitForVillage(page, (v) => v.card === '', 'die geschlossene Karte (Tipp daneben)');
  check(village.lastTap === lastTap, 'Tipp daneben wurde auch als Tipp auf die Welt gewertet');
  // Ein Haus öffnet keine Karte.
  const house = village.buildings.find((b) => b.type.startsWith('house'));
  await sleep(500);
  await tapTile({ x: house.x, y: house.y + 1 });
  await sleep(500);
  check((await readVillage(page)).card === '', 'Ein Haus hat eine Infokarte geöffnet');

  // --- Der Markt macht Geld: Bäckerei → Kuchen → Taler ---
  step('Marktplatz macht Geld');
  const coinsNow = (await readVillage(page)).stock.coins;
  village = await waitStock((stock) => stock.coins > coinsNow, 'steigende Taler (der Markt verkauft Kuchen)', 90_000);
  check(village.producers.find((p) => p.id === market.id)?.delivered >= 1, 'Markt: delivered ist 0, obwohl die Taler stiegen');
  check(village.producers.find((p) => p.id === bakery.id)?.delivered >= 1, 'Bäckerei: delivered ist 0');

  // --- Dorf mit Produktion ---
  step('Dorf mit Produktion');
  await pickItem('lumberjack');
  village = await readVillage(page);
  await cameraAtRest();
  await sleep(500);
  await tapTile(wood.tap);
  await waitForVillage(page, (v) => v.preview === 'place:ok', 'grüne Vorschau (zweiter Holzfäller)');
  await confirm((v) => typeCount(v, 'lumberjack') === 1, 'der zweite Holzfäller');
  await exitTool();
  // Heranzoomen (die Kacheln werden größer), ein paar Sekunden arbeiten lassen, dann das Bild.
  const zoomButtons = (await readVillage(page)).ui;
  for (let i = 0; i < 2; i += 1) {
    await input.tap(zoomButtons['zoom-in']);
    await sleep(250);
  }
  await cameraAtRest();
  await sleep(6500);
  await shot(`${name}-dorf-produktion`);
  for (let i = 0; i < 2; i += 1) {
    await input.tap(zoomButtons['zoom-out']);
    await sleep(250);
  }
  await cameraAtRest();

  // --- Kleine Bildschirme: nichts überlappt (Lagerleiste, Werkzeugleiste, Zoom-Knöpfe, Infokarte, Auswahl) ---
  for (const [w, h] of [[320, 568], [568, 320], [640, 360]]) {
    step(`Kleiner Bildschirm ${w}×${h}: Lagerleiste, Auswahl, Karte`);
    await page.setViewportSize({ width: w, height: h });
    await sleep(1500);
    const small = { width: w, height: h };
    const zr = h < 400 ? 28 : 34;
    let v = await readVillage(page);
    const stock = v.ui.stock;
    const inside = (rect, what) => check(rect.x - rect.w / 2 >= -0.5 && rect.x + rect.w / 2 <= w + 0.5 && rect.y - rect.h / 2 >= -0.5 && rect.y + rect.h / 2 <= h + 0.5, `${w}×${h}: ${what} ragt über den Rand`);
    inside(stock, 'Lagerleiste');
    check(!rectHitsCircle(stock, v.ui['zoom-in'], zr) && !rectHitsCircle(stock, v.ui['zoom-out'], zr), `${w}×${h}: Lagerleiste überdeckt einen Zoom-Knopf`);
    const toolTops = ['path', 'shop', 'move', 'demolish'].map((tool) => v.ui[`tool-${tool}`].y);
    const toolbarTop = Math.min(...toolTops) - 28;
    check(stock.y + stock.h / 2 <= toolbarTop, `${w}×${h}: Lagerleiste reicht bis zur Werkzeugleiste`);
    for (const tool of ['path', 'shop', 'move', 'demolish']) {
      const spot = v.ui[`tool-${tool}`];
      check(spot.x - 28 >= 0 && spot.x + 28 <= w && spot.y + 28 <= h && !(Math.abs(spot.x - stock.x) < stock.w / 2 + 28 && Math.abs(spot.y - stock.y) < stock.h / 2 + 28), `${w}×${h}: Werkzeug ${tool} ragt hinaus oder liegt unter der Lagerleiste`);
    }

    // Der Shop (Reiter „Gebäude“): Karten im Bild, unter der Lagerleiste; Zoom-Knöpfe und Werkzeugleiste sind verdeckt.
    v = await openShop();
    v = await openTab('production');
    for (const [spot, p] of Object.entries(v.ui).filter(([spot]) => spot.startsWith('item-') || spot.startsWith('page-') || spot.startsWith('tab-') || spot === 'shop-close')) {
      check(p.x - 24 >= 0 && p.x + 24 <= w && p.y - 24 >= stock.y + stock.h / 2 && p.y + 24 <= h, `${w}×${h}: „${spot}“ liegt außerhalb der Fläche unter der Lagerleiste (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
    }
    check(!('zoom-in' in v.ui), `${w}×${h}: Zoom-Knöpfe liegen unter dem Shop`);
    if (w === 568) {
      await sleep(400);
      await shot(`${name}-handy-quer`);
    }
    await tapUi('shop-close');
    await waitForVillage(page, (state) => state.tool === 'view' && state.shop === 'closed', `der geschlossene Shop bei ${w}×${h}`);
    v = await readVillage(page);

    // Die Infokarte des Beerengartens.
    await sleep(400);
    const cam2 = await cameraAtRest();
    const gardenAt = screenOfTile(cam2, small, gardenTile);
    check(gardenAt.x > 20 && gardenAt.x < w - 20 && gardenAt.y > stock.y + stock.h / 2 && gardenAt.y < toolbarTop, `${w}×${h}: Beerengarten liegt nicht antippbar im Bild (${gardenAt.x.toFixed(0)}, ${gardenAt.y.toFixed(0)})`);
    await input.tap(gardenAt);
    v = await waitForVillage(page, (state) => state.card === String(garden.id) && 'card-close' in state.ui, `die Infokarte bei ${w}×${h}`, 6000);
    const c = v.ui.card;
    inside(c, 'Infokarte');
    check(!rectHitsCircle(c, v.ui['zoom-in'], zr) && !rectHitsCircle(c, v.ui['zoom-out'], zr), `${w}×${h}: Infokarte überdeckt einen Zoom-Knopf`);
    check(c.y - c.h / 2 >= stock.y + stock.h / 2 - 0.5, `${w}×${h}: Infokarte überdeckt die Lagerleiste`);
    check(c.y + c.h / 2 <= toolbarTop + 0.5, `${w}×${h}: Infokarte überdeckt die Werkzeugleiste`);
    check(v.ui['card-close'].w >= 64, `${w}×${h}: ✕ der Karte kleiner als 64 px`);
    if (w === 320) {
      await sleep(500);
      await shot(`${name}-handy-hochkant`);
    }
    await tapUi('card-close');
    await waitForVillage(page, (state) => state.card === '', `die geschlossene Karte bei ${w}×${h}`);
  }
  await page.setViewportSize(size);
  await sleep(1000);
}

// ---------------------------------------------------------------------------------------------
// M4 „Shop“: Reiter, Schlösser, Freischaltung, Artikel setzen, Insel gestalten
// ---------------------------------------------------------------------------------------------

/** Die Artikel jedes Reiters, in der Reihenfolge der Datei (siehe `buildings.json`). */
const SHOP_ITEMS = {
  houses: ['house-red', 'house-blue', 'house-yellow', 'house-big', 'house-garden'],
  deco: ['flower', 'bush', 'fence', 'bench', 'flowerbed', 'lantern', 'pond', 'fountain'],
  production: ['lumberjack', 'berry-garden', 'quarry', 'carpenter', 'bakery', 'market'],
  island: ['tree', 'rock', 'beach', 'meadow'],
};

/** Eine Kachel mit einem der Gelände-Buchstaben (`w s g f r`), gut antippbar und möglichst nah an `near`; `near` ist ein Bildschirmpunkt. */
function findTerrainTile(village, cam, size, { letters, near, neighbours, skip = [] }) {
  const toolbarTop = village.ui['tool-path'].y - 52;
  const usable = { left: 90, right: size.width - 140, top: 200, bottom: toolbarTop - 100 };
  const occupied = occupiedTiles(village);
  for (const tile of skip) occupied.add(tileKey(tile.x, tile.y));
  const at = (x, y) => (x < 0 || y < 0 || x >= MAP_TILES || y >= MAP_TILES ? 'w' : village.terrain[y * MAP_TILES + x]);
  let best;
  for (let y = 3; y < MAP_TILES - 3; y += 1) {
    for (let x = 3; x < MAP_TILES - 3; x += 1) {
      if (!letters.includes(at(x, y)) || occupied.has(tileKey(x, y))) continue;
      if (neighbours && ![at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some((n) => neighbours.includes(n))) continue;
      const p = screenOfTile(cam, size, { x, y });
      if (p.x < usable.left || p.x > usable.right || p.y < usable.top || p.y > usable.bottom) continue;
      const distance = Math.hypot(p.x - near.x, p.y - near.y);
      if (!best || distance < best.distance) best = { x, y, distance };
    }
  }
  return best;
}

/** Shop (M4): öffnen, Reiter, Schlösser, Freischaltung, Artikel setzen, Baum pflanzen, Land aufschütten, kleine Bildschirme. */
async function testShop({ page, check, shot, size, input, name, waitLong }) {
  const { step, cameraAtRest, tapUi, tapTile, selectTool, openShop, openTab, pickItem, exitTool, confirm } = buildHelpers({ page, check, size, input, name });
  const typeCount = (village, type) => village.buildings.filter((b) => b.type === type).length;
  const terrainAt = (village, tile) => village.terrain[tile.y * MAP_TILES + tile.x];
  const stateOf = (village, id) => village.ui[`item-${id}`]?.state;

  // --- Start: nichts neu, alles Nötige frei ---
  let village = await waitForVillage(page, (v) => v.buildings.length > 0 && Object.keys(v.stock).length > 0, 'das Startdorf');
  check(village.shop === 'closed', `Start: Shop ${village.shop}, erwartet „closed“`);
  check(village.ui['tool-shop']?.badge === false, 'Start: der Shop-Knopf zeigt schon einen Stern');
  check(village.unlocked.includes('bakery') && !village.unlocked.includes('carpenter'), `Start: freigeschaltet ${village.unlocked.join(',')} – die Bäckerei (Beerengarten steht) soll frei sein, die Schreinerei nicht`);
  // Der Markt hat vielleicht schon die ersten Beeren verkauft (1 Taler das Stück), aber noch nichts Nennenswertes verdient.
  check(village.earned < 10, `Start: ${village.earned} Taler verdient, erwartet fast 0`);
  for (const tool of ['path', 'shop', 'move', 'demolish']) check(`tool-${tool}` in village.ui, `Werkzeugleiste: Knopf ${tool} fehlt`);

  // --- Shop öffnen: vier Reiter, ✕, Lagerleiste bleibt, Zoom und Werkzeugleiste sind verdeckt ---
  step('Shop öffnen und Reiter wechseln');
  village = await openShop();
  // Der Shop öffnet auf dem Reiter, der zuletzt gezeigt wurde (hier: von den Prüfungen für kleine Bildschirme).
  village = await openTab('houses');
  check(village.shop === 'houses:1/1', `Shop: ${village.shop}, erwartet „houses:1/1“ (alles auf einer Seite)`);
  for (const tab of Object.keys(SHOP_ITEMS)) check(`tab-${tab}` in village.ui, `Shop: Reiter ${tab} fehlt`);
  check('shop-close' in village.ui && village.ui['shop-close'].w >= 48, 'Shop: kein großes ✕');
  check('stock' in village.ui, 'Shop: die Lagerleiste ist verschwunden');
  check(!('zoom-in' in village.ui) && !('tool-path' in village.ui), 'Shop: Zoom-Knöpfe oder Werkzeugleiste liegen unter dem Shop');
  await sleep(500);
  await shot(`${name}-shop-haeuser`);
  const locked = { houses: ['house-big', 'house-garden'], deco: ['bench', 'flowerbed', 'lantern', 'pond', 'fountain'], production: ['quarry', 'carpenter'], island: ['beach', 'meadow'] };
  for (const tab of Object.keys(SHOP_ITEMS)) {
    village = await openTab(tab);
    for (const id of SHOP_ITEMS[tab]) check(`item-${id}` in village.ui, `Reiter ${tab}: Karte ${id} fehlt`);
    check(Object.keys(village.ui).filter((spot) => spot.startsWith('item-')).length === SHOP_ITEMS[tab].length, `Reiter ${tab}: ${Object.keys(village.ui).filter((spot) => spot.startsWith('item-')).length} Karten, erwartet ${SHOP_ITEMS[tab].length}`);
    for (const id of SHOP_ITEMS[tab]) {
      const expected = locked[tab].includes(id) ? 'locked' : 'ok';
      check(stateOf(village, id) === expected, `Reiter ${tab}: ${id} ist „${stateOf(village, id)}“, erwartet „${expected}“`);
      // Gesperrte Karten sind grau, bezahlbare nicht.
      check(village.ui[`item-${id}`]?.dim === (expected !== 'ok'), `Reiter ${tab}: ${id} hat die falsche Graustufe`);
    }
    if (tab === 'island') {
      await sleep(400);
      await shot(`${name}-shop-insel`);
    }
  }

  // --- Eine gesperrte Karte wählt nichts, sagt aber, was zu tun ist ---
  step('Gesperrte Karte antippen');
  village = await openTab('deco');
  await tapUi('item-bench');
  village = await waitForVillage(page, (v) => v.tip !== '', 'der Satz auf der gesperrten Karte');
  check(/40 Taler/.test(village.tip), `Bank: Satz „${village.tip}“ nennt die 40 Taler nicht`);
  check(village.tool === 'shop' && village.variant === '' && village.shop.startsWith('deco:'), `Gesperrt: Werkzeug ${village.tool}, Artikel „${village.variant}“ – nichts darf gewählt sein`);
  await shot(`${name}-shop-deko-gesperrt`);
  await tapUi('item-fountain');
  village = await waitForVillage(page, (v) => /250 Taler/.test(v.tip), 'der Satz am Brunnen');
  village = await openTab('production');
  await tapUi('item-carpenter');
  village = await waitForVillage(page, (v) => /Holzfäller/.test(v.tip), 'der Satz an der Schreinerei');
  village = await openTab('houses');
  await tapUi('item-house-big');
  village = await waitForVillage(page, (v) => /2 Häuser/.test(v.tip), 'der Satz am großen Pilzhaus');
  await tapUi('shop-close');
  await waitForVillage(page, (v) => v.tool === 'view' && v.shop === 'closed', 'der geschlossene Shop');

  // --- Zoom heraus: Wald und Küste im Bild ---
  village = await readVillage(page);
  for (let i = 0; i < 2; i += 1) {
    await input.tap(village.ui['zoom-out']);
    await sleep(300);
  }
  await cameraAtRest();

  // --- Freischaltung: Holzfäller bauen → Schreinerei und Steinbruch werden frei ---
  step('Holzfäller bauen: Neues im Shop');
  village = await readVillage(page);
  let cam = await cameraAtRest();
  const wood = findWorkSpot(village, cam, size, { fp: 2, atPath: true, terrain: 'f', radius: 4, withNearby: true });
  check(wood !== undefined, 'Kein Platz für den Holzfäller am Weg mit Wald in der Nähe gefunden');
  if (!wood) return;
  await pickItem('lumberjack');
  await sleep(500);
  await tapTile(wood.tap);
  await waitForVillage(page, (v) => v.preview === 'place:ok', 'grüne Vorschau für den Holzfäller');
  village = await confirm((v) => typeCount(v, 'lumberjack') === 1 && v.unlocked.includes('carpenter'), 'der Holzfäller und die Freischaltung');
  check(village.unlocked.includes('quarry') && village.unlocked.includes('carpenter'), `Freigeschaltet: ${village.unlocked.join(',')} – Steinbruch und Schreinerei sollen frei sein`);
  village = await waitForVillage(page, (v) => /Neu im Shop/.test(v.hint), 'die Meldung „Neu im Shop“');
  check(/Schreinerei/.test(village.hint) && /Steinbruch/.test(village.hint), `Meldung „${village.hint}“ nennt nicht Schreinerei und Steinbruch`);
  check(village.ui['tool-shop']?.badge === true, 'Der Shop-Knopf zeigt keinen Stern für die Neuigkeit');
  await sleep(600);
  await shot(`${name}-neu-im-shop`);

  // --- Shop öffnen: Stern am Knopf weg, neue Karten mit Stern, nicht mehr grau ---
  step('Shop nach der Freischaltung');
  village = await openShop();
  village = await openTab('production');
  check(stateOf(village, 'carpenter') !== 'locked' && stateOf(village, 'quarry') !== 'locked', 'Schreinerei oder Steinbruch sind im Shop noch gesperrt');
  check(village.ui['item-carpenter'].fresh === true && village.ui['item-quarry'].fresh === true, 'Neue Karten tragen keinen Stern');
  check(village.ui['item-lumberjack'].fresh === false, 'Alte Karte trägt einen Stern');
  await tapUi('shop-close');
  village = await waitForVillage(page, (v) => v.shop === 'closed', 'der geschlossene Shop');
  // Nach dem Schließen geht der Stern am Knopf aus (er war schon beim Öffnen erledigt) und die Karten sind nicht mehr neu.
  village = await openShop();
  village = await openTab('production');
  check(village.ui['item-carpenter'].fresh === false, 'Die Schreinerei trägt nach dem zweiten Öffnen noch einen Stern');
  await tapUi('shop-close');
  await waitForVillage(page, (v) => v.shop === 'closed' && v.tool !== 'shop', 'der geschlossene Shop');
  village = await readVillage(page);
  check(village.ui['tool-shop']?.badge === false || village.tool === 'view', 'Der Stern am Shop-Knopf bleibt nach dem Öffnen');

  // --- Artikel aus dem Shop setzen: Blume ---
  step('Blume aus dem Shop setzen');
  await exitTool();
  await pickItem('flower');
  village = await readVillage(page);
  cam = await cameraAtRest();
  const flowerSpot = findFreeArea(village, cam, size, 1, 1, { near: { x: size.width * 0.35, y: size.height * 0.3 } });
  check(flowerSpot !== undefined, 'Kein Platz für die Blume');
  if (!flowerSpot) return;
  const coinsBefore = village.stock.coins;
  await tapTile(flowerSpot);
  await waitForVillage(page, (v) => v.preview === 'place:ok', 'grüne Vorschau für die Blume');
  village = await confirm((v) => typeCount(v, 'flower') === typeCount(village, 'flower') + 1, 'die Blume');
  check(village.tool === 'place' && village.variant === 'flower', `Blume: nach ✓ Werkzeug ${village.tool}, Artikel ${village.variant}`);
  village = await waitForVillage(page, (v) => v.stock.coins <= coinsBefore - 3 + 8, 'die abgebuchten 3 Taler');
  check(village.stock.coins >= coinsBefore - 3, `Blume: Taler ${village.stock.coins}, erwartet mindestens ${coinsBefore - 3}`);

  // --- Bäckerei für den Markt, damit Taler verdient werden (Land aufschütten braucht 60) ---
  step('Bäckerei bauen (Taler verdienen)');
  await pickItem('bakery');
  village = await readVillage(page);
  cam = await cameraAtRest();
  const bakerySpot = findWorkSpot(village, cam, size, { fp: 2, atPath: true });
  check(bakerySpot !== undefined, 'Kein Platz für die Bäckerei am Weg');
  if (!bakerySpot) return;
  await sleep(500);
  await tapTile(bakerySpot.tap);
  await waitForVillage(page, (v) => v.preview === 'place:ok', 'grüne Vorschau für die Bäckerei');
  await confirm((v) => typeCount(v, 'bakery') === 1, 'die Bäckerei');

  // --- Baum pflanzen ---
  step('Baum pflanzen');
  await pickItem('tree');
  village = await readVillage(page);
  cam = await cameraAtRest();
  const treeSpot = findTerrainTile(village, cam, size, { letters: 'g', near: { x: size.width * 0.5, y: size.height * 0.5 }, skip: [flowerSpot, ...village.buildings.map((b) => ({ x: b.x, y: b.y }))] });
  check(treeSpot !== undefined, 'Kein Platz für den Baum');
  if (!treeSpot) return;
  const forestCount = (v) => [...v.terrain].filter((c) => c === 'f').length;
  const forestBefore = forestCount(village);
  const treeCoins = village.stock.coins;
  await sleep(500);
  await tapTile(treeSpot);
  village = await waitForVillage(page, (v) => v.preview === 'place:ok', 'grüne Vorschau für den Baum');
  check(/Wiese/.test(village.hint), `Baum: Hinweis „${village.hint}“ sagt nichts von der Wiese`);
  village = await confirm((v) => terrainAt(v, treeSpot) === 'f' && v.planted === 1, 'der gepflanzte Baum');
  check(forestCount(village) === forestBefore + 1, `Baum: ${forestCount(village)} Waldkacheln, erwartet ${forestBefore + 1}`);
  check(village.repaint.count >= 1, 'Baum: der Boden wurde nicht neu gemalt');
  console.log(`  [${name}] Boden neu malen (Baum): ${village.repaint.last.toFixed(1)} ms für ${village.repaint.tiles} Kacheln (größtes: ${village.repaint.max.toFixed(1)} ms)`);
  check(village.repaint.last < 250, `Baum: Boden neu malen dauerte ${village.repaint.last.toFixed(0)} ms`);
  village = await waitForVillage(page, (v) => v.stock.coins <= treeCoins - 5 + 8, 'die abgebuchten 5 Taler');
  check(village.stock.coins >= treeCoins - 5, `Baum: Taler ${village.stock.coins}, erwartet mindestens ${treeCoins - 5}`);
  // Noch einmal auf die gleiche Kachel: „schon etwas da“, ✓ gesperrt.
  await sleep(500);
  await tapTile(treeSpot);
  village = await waitForVillage(page, (v) => /^place:/.test(v.preview) && v.preview !== 'place:ok', 'rote Vorschau auf dem Baum');
  check(village.ui.confirm?.enabled === false, 'Baum auf Baum: ✓ ist nicht gesperrt');
  await tapUi('cancel');
  await sleep(900); // Aufpoppen
  // Für das Bild herangezoomt (der Baum liegt nahe der Bildschirmmitte), danach wieder heraus.
  village = await readVillage(page);
  for (let i = 0; i < 2; i += 1) {
    await input.tap(village.ui['zoom-in']);
    await sleep(250);
  }
  await cameraAtRest();
  await sleep(500);
  await shot(`${name}-baum-gepflanzt`);
  for (let i = 0; i < 2; i += 1) {
    await input.tap(village.ui['zoom-out']);
    await sleep(250);
  }
  await cameraAtRest();

  // --- Gepflanzten Baum abreißen: Erstattung; natürlicher Baum bleibt ---
  step('Gepflanzten Baum abreißen');
  await exitTool();
  await selectTool('demolish');
  const coinsTree = (await readVillage(page)).stock.coins;
  await tapTile(treeSpot);
  village = await waitForVillage(page, (v) => v.preview === 'demolish:1', 'die rote Markierung am Baum');
  check(/zurück/.test(village.hint) && /5 Taler/.test(village.hint), `Abreißen: Hinweis „${village.hint}“ nennt die Erstattung nicht`);
  await tapUi('confirm');
  village = await waitForVillage(page, (v) => terrainAt(v, treeSpot) === 'g' && v.planted === 0, 'die Wiese anstelle des Baums');
  check(forestCount(village) === forestBefore, 'Abgerissener Baum: Waldkacheln stimmen nicht');
  village = await waitForVillage(page, (v) => v.stock.coins >= coinsTree + 5, 'die Erstattung (5 Taler)');
  await sleep(600);
  cam = await cameraAtRest();
  const natural = findTerrainTile(village, cam, size, { letters: 'f', near: { x: size.width * 0.5, y: size.height * 0.5 } });
  check(natural !== undefined, 'Kein natürlicher Baum im Bild');
  if (natural) {
    await tapTile(natural);
    village = await waitForVillage(page, (v) => /von allein/.test(v.hint), 'der Hinweis „von allein gewachsen“');
    check(village.preview === 'none', `Natürlicher Baum: Vorschau ${village.preview}, erwartet „none“`);
    check(terrainAt(village, natural) === 'f', 'Der natürliche Baum wurde abgerissen');
  }
  await exitTool();

  // --- Fels setzen ---
  step('Fels setzen');
  await pickItem('rock');
  village = await readVillage(page);
  cam = await cameraAtRest();
  const rockSpot = findTerrainTile(village, cam, size, { letters: 'g', near: { x: size.width * 0.45, y: size.height * 0.55 }, skip: [flowerSpot, treeSpot, ...village.buildings.map((b) => ({ x: b.x, y: b.y }))] });
  check(rockSpot !== undefined, 'Kein Platz für den Fels');
  if (rockSpot) {
    await sleep(500);
    await tapTile(rockSpot);
    await waitForVillage(page, (v) => v.preview === 'place:ok', 'grüne Vorschau für den Fels');
    village = await confirm((v) => terrainAt(v, rockSpot) === 'r', 'der gesetzte Fels');
  }
  await exitTool();

  // --- Land aufschütten: braucht 60 verdiente Taler ---
  step('Land aufschütten (gesperrt, bis der Markt Taler verdient hat)');
  village = await openShop();
  village = await openTab('island');
  check(stateOf(village, 'beach') === 'locked', 'Strand ist von Anfang an frei');
  await tapUi('item-beach');
  village = await waitForVillage(page, (v) => /60 Taler/.test(v.tip), 'der Satz am Strand');
  await tapUi('shop-close');
  await waitForVillage(page, (v) => v.shop === 'closed' && v.tool === 'view', 'der geschlossene Shop');
  if (!waitLong) {
    // Der Desktop wartet nicht auf die verdienten Taler (das Tablet tut es und prüft Strand und Wiese).
    return;
  }
  step('Warten, bis der Markt 60 Taler verdient hat …');
  village = await waitForVillage(page, (v) => v.earned >= 60 && v.unlocked.includes('beach'), 'verdiente Taler (Strand frei)', 240_000);
  village = await waitForVillage(page, (v) => /Neu im Shop/.test(v.hint) || v.tool === 'view', 'die Meldung nach der Freischaltung', 6000).catch(() => village);
  await pickItem('beach');
  village = await readVillage(page);
  cam = await cameraAtRest();
  const coast = findTerrainTile(village, cam, size, { letters: 'w', neighbours: 'sgfr', near: { x: size.width * 0.35, y: size.height * 0.45 } });
  check(coast !== undefined, 'Keine Küste im Bild für den Strand');
  if (!coast) return;
  const landTiles = (v) => [...v.terrain].filter((c) => c !== 'w').length;
  const landCount = landTiles(village);
  const repaintsBefore = village.repaint.count;
  await sleep(500);
  await tapTile(coast);
  village = await waitForVillage(page, (v) => v.preview === 'place:ok', 'grüne Vorschau für den Strand');
  check(/Wasser/.test(village.hint), `Strand: Hinweis „${village.hint}“ sagt nichts vom Wasser`);
  village = await confirm((v) => terrainAt(v, coast) === 's', 'der aufgeschüttete Strand');
  check(landTiles(village) === landCount + 1, `Strand: ${landTiles(village)} Landkacheln, erwartet ${landCount + 1}`);
  check(village.repaint.count > repaintsBefore, 'Strand: der Boden wurde nicht neu gemalt');
  console.log(`  [${name}] Boden neu malen (Strand): ${village.repaint.last.toFixed(1)} ms für ${village.repaint.tiles} Kacheln (größtes: ${village.repaint.max.toFixed(1)} ms)`);
  check(village.repaint.last < 250, `Strand: Boden neu malen dauerte ${village.repaint.last.toFixed(0)} ms`);
  // Wasser, das nicht ans Land grenzt: rot.
  const open = findTerrainTile(village, cam, size, { letters: 'w', near: { x: size.width * 0.1, y: size.height * 0.5 }, skip: [coast] });
  const isolated = open && [[-1, 0], [1, 0], [0, -1], [0, 1]].every(([dx, dy]) => village.terrain[(open.y + dy) * MAP_TILES + open.x + dx] === 'w');
  if (open && isolated) {
    await sleep(500);
    await tapTile(open);
    village = await waitForVillage(page, (v) => /^place:/.test(v.preview) && v.preview !== 'place:ok', 'rote Vorschau auf offenem Wasser');
    check(/Land/.test(village.hint), `Offenes Wasser: Hinweis „${village.hint}“ sagt nichts vom Land`);
    await tapUi('cancel');
  }
  await sleep(900);
  // Zwei weitere Kacheln machen aus dem Fleck eine kleine Landzunge (im Bild besser zu sehen).
  let spit = coast;
  for (let i = 0; i < 2; i += 1) {
    village = await readVillage(page);
    const next = [[-1, 0], [1, 0], [0, -1], [0, 1]]
      .map(([dx, dy]) => ({ x: spit.x + dx, y: spit.y + dy }))
      .find((tile) => tile.x >= 3 && tile.y >= 3 && tile.x < MAP_TILES - 3 && tile.y < MAP_TILES - 3 && terrainAt(village, tile) === 'w');
    if (!next) break;
    await sleep(500);
    await tapTile(next);
    await waitForVillage(page, (v) => v.preview === 'place:ok', 'grüne Vorschau für den nächsten Strand');
    await confirm((v) => terrainAt(v, next) === 's', 'der nächste aufgeschüttete Strand');
    spit = next;
  }
  // Für das Bild mit dem Mausrad an der neuen Küste herangezoomt (der Zoom bleibt dort, wo der Zeiger steht), danach wieder heraus
  // (die Wiese kommt gleich auf dieselbe Kachel).
  const coastAt = screenOfTile(await cameraAtRest(), size, spit);
  await page.mouse.move(coastAt.x, coastAt.y);
  for (let i = 0; i < 3; i += 1) {
    await page.mouse.wheel(0, -240);
    await sleep(250);
  }
  await cameraAtRest();
  await sleep(500);
  await shot(`${name}-land-aufgeschuettet`);
  for (let i = 0; i < 3; i += 1) {
    await page.mouse.wheel(0, 240);
    await sleep(250);
  }
  await cameraAtRest();
  await exitTool();

  // --- Wiese anlegen: braucht 120 verdiente Taler ---
  step('Wiese anlegen (120 verdiente Taler)');
  village = await waitForVillage(page, (v) => v.earned >= 120 && v.unlocked.includes('meadow'), 'verdiente Taler (Wiese frei)', 300_000);
  await pickItem('meadow');
  await cameraAtRest();
  await sleep(500);
  await tapTile(coast);
  await waitForVillage(page, (v) => v.preview === 'place:ok', 'grüne Vorschau für die Wiese');
  village = await confirm((v) => terrainAt(v, coast) === 'g', 'die angelegte Wiese');
  await exitTool();
}

/** Shop (M4) auf kleinen Bildschirmen: jeder Reiter passt, keine Überlappung, Karten groß genug, mehr als 1 Karte pro Seite. */
async function testShopSmall({ page, check, shot, size, input, name }) {
  const { step, openShop, openTab, tapUi } = buildHelpers({ page, check, size, input, name });
  for (const [w, h] of [[320, 568], [568, 320], [640, 360]]) {
    step(`Shop auf ${w}×${h}`);
    await page.setViewportSize({ width: w, height: h });
    await sleep(1500);
    await waitForCameraRest(page);
    await openShop();
    let v;
    for (const tab of ['houses', 'deco', 'production', 'island']) {
      v = await openTab(tab);
      checkShopFits({ village: v, w, h, tab, check });
      if (tab === 'deco' && w === 320) await shot(`${name}-shop-handy-hochkant`);
      if (tab === 'deco' && w === 568) await shot(`${name}-shop-handy-quer`);
    }
    // Die Deko hat mehr Karten, als auf eine Seite passen könnten: eine Seite zeigt mehr als eine, und durchblättern geht.
    v = await openTab('deco');
    const onPage = Object.keys(v.ui).filter((spot) => spot.startsWith('item-')).length;
    check(onPage >= 2, `${w}×${h}: Deko zeigt nur ${onPage} Karte(n) pro Seite`);
    const pages = Number(v.shop.split('/')[1]);
    if (pages > 1) {
      let seen = new Set(Object.keys(v.ui).filter((spot) => spot.startsWith('item-')));
      for (let page2 = 1; page2 < pages; page2 += 1) {
        await tapUi('page-next');
        v = await waitForVillage(page, (state) => state.shop === `deco:${page2 + 1}/${pages}`, `Seite ${page2 + 1} der Deko`);
        for (const spot of Object.keys(v.ui).filter((name2) => name2.startsWith('item-'))) seen.add(spot);
      }
      check(seen.size === 8, `${w}×${h}: beim Blättern sieht man ${seen.size} von 8 Deko-Karten`);
    }
    await tapUi('shop-close');
    await waitForVillage(page, (state) => state.shop === 'closed', `der geschlossene Shop bei ${w}×${h}`);
  }
  await page.setViewportSize(size);
  await sleep(1000);
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

  const shot = (name) => page.screenshot({ path: path.join(KEEP_SCREENSHOTS.has(name) ? SCREENSHOT_DIR : TEMP_SCREENSHOT_DIR, `${name}.png`), scale: 'css' });
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

  if (!M2_ONLY && !M3_ONLY && !M4_ONLY) {
    if (profile.context.hasTouch) {
      await testTouchCamera({ page, context, problems, check, shot, size: { width, height } });
    } else {
      await testMouseCamera({ page, problems, check, shot, size: { width, height } });
    }
    // Frische Insel für die Bau-Prüfungen (die Kamera-Prüfungen haben Zoom und Ausschnitt verstellt).
    await enterIsland(page, profile, waitForScene);
  }

  const size = { width, height };
  const cdp = profile.context.hasTouch ? await context.newCDPSession(page) : undefined;
  const input = cdp ? { tap: (p) => page.touchscreen.tap(p.x, p.y) } : { tap: (p) => page.mouse.click(p.x, p.y) };
  const drag = cdp ? (from, to) => touchDevice(cdp).drag(from, to, { steps: 8, pauseMs: 30, holdMs: 200 }) : undefined;
  if (!M3_ONLY && !M4_ONLY) {
    try {
      await testBuilding({ page, check, shot, size, input, drag, name: profile.name });
    } catch (error) {
      problems.push(`Bauen: ${error.message}`);
      await shot(`${profile.name}-bauen-fehler`).catch(() => {});
    }
  }
  if (!M2_ONLY && !M4_ONLY) {
    try {
      // Frische Insel mit frischem Startlager für die Wirtschafts-Prüfungen (das Bauen oben hat Geld ausgegeben).
      if (!M3_ONLY) await enterIsland(page, profile, waitForScene);
      await testEconomy({ page, check, shot, size, input, name: profile.name });
    } catch (error) {
      problems.push(`Wirtschaft: ${error.message}`);
      await shot(`${profile.name}-wirtschaft-fehler`).catch(() => {});
    }
  }
  if (!M2_ONLY && !M3_ONLY) {
    try {
      // Frische Insel für den Shop (das Bauen und Wirtschaften oben hat Geld ausgegeben und Freischaltungen erreicht).
      if (!M4_ONLY) await enterIsland(page, profile, waitForScene);
      await testShopSmall({ page, check, shot, size, input, name: profile.name });
      await testShop({ page, check, shot, size, input, name: profile.name, waitLong: profile.name === 'tablet' });
    } catch (error) {
      problems.push(`Shop: ${error.message}`);
      await shot(`${profile.name}-shop-fehler`).catch(() => {});
    }
  }
  await cdp?.detach();

  await context.close();
  return { info, problems };
}

async function main() {
  const skipBuild = process.argv.includes('--no-build');
  if (!skipBuild) run('npm', ['run', 'build']);

  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await mkdir(TEMP_SCREENSHOT_DIR, { recursive: true });
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
