#!/usr/bin/env node
/**
 * Lokaler Smoke-Test (läuft NICHT in CI – dort gibt es kein Playwright).
 *
 *   npm run smoke                                # baut, startet `vite preview`, testet, räumt auf
 *   npm run smoke -- --no-build                  # vorhandenes dist/ verwenden
 *   npm run smoke -- --out docs/screenshots/m9   # anderer Screenshot-Ordner (Standard: m8)
 *   npm run smoke -- --m2-only                   # nur die Bau-Prüfungen (M2), ohne Kamera, Wirtschaft und Shop (schnell)
 *   npm run smoke -- --m3-only                   # nur die Wirtschafts-Prüfungen (M3), ohne Kamera, Bauen und Shop
 *   npm run smoke -- --m4-only                   # nur die Shop-Prüfungen (M4): Reiter, Schlösser, Freischaltung, Insel (etwa 5 Minuten)
 *   npm run smoke -- --m5-only                   # nur die Prüfungen zu Speichern und Web-App (M5)
 *   npm run smoke -- --m6-only                   # nur die Bewohner (M6): Karte, Tragen, Einladen, Boot, volles Dorf, Bildzeit
 *   npm run smoke -- --m7-only                   # nur Wohnen und Stimmung (M7): Stimmung, Deko, Ziehen, Umziehen, Arbeitstempo, Bildzeit
 *   npm run smoke -- --m8-only                   # nur Kinderfreundlich (M8): geführter Start, Eltern-Menü, Tageslimit, Gute Nacht
 *   npm run smoke -- --profile tablet            # nur Tablet bzw. nur Desktop
 *
 * Öffnet das Spiel (feste Insel `?seed=1&nosave=1`) als Tablet (1024×768, Touch,
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
 * Seit M5 (Speichern): Das Spiel wird mit `?seed=1&nosave=1` geöffnet, das weder lädt noch speichert; die Speicher-Prüfungen nutzen
 * `?seed=1` (speichert normal) und die echte IndexedDB: Autosave nach dem Bauen (Haus, Blume, Baum, Weg), Neuladen (Gebäude, Wege,
 * Gelände, Lager, Zeit, Freischaltungen wie vorher, keine „Neu im Shop“-Meldung), das Zahnrad-Menü (`menu`, `menu-save`,
 * `menu-load`, `menu-close`, `menu-confirm`, `menu-cancel` in `data-ui`, `data-menu` = `closed|menu|menu:<Satz>|confirm`),
 * Export als Download, Import über den Dateiwähler mit ✓/✕ (Szene startet neu, keine Texturwarnungen), unbrauchbare
 * Dateien, kleine Bildschirme, kaputter und neuerer Spielstand beim Start, Browser ohne IndexedDB. `data-save` ist ein
 * JSON mit `store`, `autosave`, `start` (`new|loaded|unreadable|tooNew|storageFailed`), `startTick`, `startStock`, `saves`,
 * `failures`, `savedTick`. Web-App: Manifest (Name, `standalone`, Adressen relativ zu `/Schlumpfwelt/`, Symbole mit der
 * richtigen Größe), Service Worker aktiv mit Cache, nach dem Neuladen gesteuert, und das Spiel startet offline
 * (`context.setOffline`).
 * Seit M6 (Bewohner, `<html data-residents|boats|resident-card|perf>`): die zwei Bewohner des Startdorfs (Namen, Mützen,
 * Gärtner und Händler im roten Haus), Antippen eines stehenden Bewohners öffnet seine Karte (✕ ≥ 48 px, im Bild), der
 * Gärtner trägt Beeren sichtbar zum Markt, die Karte „einladen“ ist ohne freies Haus gesperrt (Satz statt Platzieren),
 * nach einem zweiten Haus und 30 Talern bringt ein Boot den Gast an die Küste, er geht nach Hause und das Boot fährt
 * weg; ein volles Dorf (40 Bewohner, in die echte IndexedDB geschrieben) lädt mit denselben Namen und Mützen, jedes
 * Produktionsgebäude hat genau einen Arbeiter, die Bildzeit bei 4-facher CPU-Drosselung (CDP
 * `Emulation.setCPUThrottlingRate`) bleibt unter `PERF_LIMIT` und wird ausgegeben, nach dem Neuladen sind Bewohner,
 * Zuhause und Arbeit gleich, und die Karte passt auf 320×568 und 568×320.
 * Seit M7 (Wohnen und Stimmung, `<html data-drag|home-label|tick>`, `mood`/`reason`/`homeId`/`sign` in `data-residents`,
 * das Arbeitstempo als vierter Wert in `data-producers`, `mood` und `rows` am Knopf `card`, `card-move` in `data-ui`):
 * die Stimmung auf der Karte, ein Bewohner ohne Zuhause zieht ins neue Haus (normal), eine Blume daneben macht ihn sofort
 * fröhlich und zeigt ein Herz; Ziehen per Finger (CDP-Touch) bzw. Maus ins Haus mit Platz („1/2“, grün, die Kamera steht
 * still), auf ein volles Haus („2/2“) und auf die Wiese (nichts passiert); Ziehen neben den Bewohnern bewegt die Kamera;
 * „Umziehen“ auf der Karte, Haus antippen, ✓ – weit weg von der Arbeit traurig, die Runde des Beerengartens dauert dann
 * messbar länger (Ticks aus `data-tick`), eine Blume macht wieder normal; Neuladen behält Zuhause und Stimmung; ein
 * volles Dorf mit Blumen (Herzen nur über fröhlichen Köpfen), die Bildzeit bei 4-facher CPU-Drosselung, die Karte auf
 * 320×568 und 568×320.
 * Seit M8 (Kinderfreundlich, `<html data-tutorial|parent|parent-text|limit|night|bedtime>`, `tutorial-skip`, `menu-parent`,
 * `pin-<Ziffer>`, `pin-back`, `pin-forgot`, `limit-<Minuten>`, `parent-extra|pin|tutorial|close`, `night-parent` in `data-ui`):
 * Die älteren Prüfungen laufen ohne geführten Start (er steht vorher in den Einstellungen als übersprungen). Die M8-Prüfungen
 * haben einen eigenen, frischen Kontext: neues Dorf → geführter Start, die Hand zeigt auf das Ziel, der Test folgt ihr durch
 * alle Schritte (Neuladen mittendrin behält den Fortschritt); ein geladenes Dorf hat keinen; „Für Eltern“ hinter dem Zahnrad:
 * PIN zweimal (erst falsch wiederholt), gespeichert nur als Hash, „Tutorial noch einmal“ und Überspringen (für immer),
 * falsche PIN (freundlich, keine Sperre), „PIN vergessen“ mit Rechenfrage, richtige PIN; Tageslimit: das Tageskonto wird von
 * außen auf 14:40 gesetzt (kein geheimer Adress-Parameter), Limit 15 → der sanfte Satz ohne Countdown, das Eltern-Menü zählt
 * nicht mit, Abend (warm und dunkler, niemand arbeitet, Tipps tun nichts), Nacht (alle schlafen, kein Takt, kein Ertrag,
 * gespeichert, Tipps verschluckt), Neuladen in der Nacht (sofort Nacht), Eltern-Knopf, Ziffernfeld und Einstellungen auf
 * 320×568 und 568×320, „Heute noch 10 Minuten mehr“ (es wird hell), der nächste Tag (die Playwright-Uhr stellt nur das
 * Datum vor: Mitternacht im laufenden Spiel) und Export/Import ohne PIN und Limit.
 * Exitcode ≠ 0 bei Konsolenfehlern, Seitenfehlern, fehlgeschlagenen Requests,
 * fehlgeschlagenen Kamera-Prüfungen oder wenn das Spiel nicht in die
 * Insel-Szene wechselt.
 *
 * Playwright wird NICHT als Abhängigkeit installiert: das Skript nutzt das
 * global vorinstallierte Paket (NODE_PATH oder `npm root -g`).
 */
import { execSync, spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4173;
const URL = `http://localhost:${PORT}/Schlumpfwelt/`;
/** Feste Insel, damit Screenshots und Prüfungen reproduzierbar sind. */
const GAME_URL = `${URL}?seed=1&nosave=1`;
const M2_ONLY = process.argv.includes('--m2-only');
const M3_ONLY = process.argv.includes('--m3-only');
const M4_ONLY = process.argv.includes('--m4-only');
const M5_ONLY = process.argv.includes('--m5-only');
const M6_ONLY = process.argv.includes('--m6-only');
const M7_ONLY = process.argv.includes('--m7-only');
const M8_ONLY = process.argv.includes('--m8-only');
/** Mit einer der `--mN-only`-Optionen laufen nur die Prüfungen dieses Meilensteins (ohne die Kamera-Prüfungen am Anfang). */
const ONLY = M2_ONLY || M3_ONLY || M4_ONLY || M5_ONLY || M6_ONLY || M7_ONLY || M8_ONLY;
/** Laufen die Prüfungen des Meilensteins mit dieser Option? (Ohne Option alle.) */
const runs = (flag) => !ONLY || flag;
/** `--profile tablet|desktop`: nur dieses Gerät testen (zum Entwickeln). */
const ONLY_PROFILE = argValue('--profile');
const SCREENSHOT_DIR = path.resolve(ROOT, argValue('--out') ?? path.join('docs', 'screenshots', 'm8'));
/** Alle übrigen Screenshots (Kamera-Prüfungen früherer Meilensteine, Zwischenschritte) landen hier, nicht im Repo. */
const TEMP_SCREENSHOT_DIR = path.join(os.tmpdir(), 'schlumpfwelt-smoke');
/** Nur diese Bilder gehören in `docs/screenshots/mN/` – die Screenshots dieses Meilensteins (M8: Kinderfreundlich). */
const KEEP_SCREENSHOTS = new Set([
  'tablet-tutorial-hand',
  'tablet-eltern-pin',
  'tablet-eltern-einstellungen',
  'tablet-bald-abend',
  'tablet-abend',
  'tablet-gute-nacht',
  'tablet-m8-handy-hochkant',
  'tablet-m8-handy-quer',
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
  // Eine Stelle ohne Bewohner (ein Tipp auf einen Bewohner öffnet seine Karte und meldet keine Kachel).
  const tapPoint = await pointClearOfResidents(page, [0.4, 0.3, 0.5].map((f) => ({ x: size.width * f, y: size.height * 0.4 })));
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
  const clickPoint = await pointClearOfResidents(page, [0.3, 0.4, 0.2].map((f) => ({ x: size.width * f, y: size.height * 0.4 })));
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
  invite: 'houses',
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

/** Bau-Zustand aus `<html data-tool|variant|preview|hint|markers|buildings|paths|terrain|ui|stock|producers|card|shop|tip|unlocked|earned|planted|repaint|menu|menu-spots|save|drag|home-label|tick>`. */
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
      // Die Knöpfe der Leisten und – solange das Menü offen ist – die des Menüs (`menu-save`, `menu-load`, …).
      ui: { ...JSON.parse(d.ui ?? '{}'), ...JSON.parse(d.menuSpots ?? '{}') },
      menu: d.menu ?? 'closed',
      save: JSON.parse(d.save ?? '{}'),
      lastTap: d.lastTap,
      stock: JSON.parse(d.stock ?? '{}'),
      // Seit M7 mit dem Arbeitstempo in Prozent (Stimmung des Arbeiters: fröhlich 120, normal 100, traurig 80).
      producers: JSON.parse(d.producers ?? '[]').map(([id, status, delivered, pace]) => ({ id, status, delivered, pace })),
      card: d.card ?? '',
      shop: d.shop ?? 'closed',
      tip: d.tip ?? '',
      unlocked: (d.unlocked ?? '').split(',').filter(Boolean),
      earned: Number(d.earned ?? 0),
      planted: Number(d.planted ?? 0),
      repaint: JSON.parse(d.repaint ?? '{}'),
      // M7: wer gerade getragen wird (JSON oder leer), das „2/2“ über dem Haus und der Takt der Simulation.
      drag: d.drag ? JSON.parse(d.drag) : undefined,
      homeLabel: d.homeLabel ?? '',
      tick: Number(d.tick ?? 0),
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

/**
 * Seit M6 trifft ein Tipp im Anschauen einen Bewohner, wenn er höchstens 24 CSS-px neben dessen Körper liegt – auch auf
 * einem Gebäude (`residentHit.ts`). Ein Tipp, der ein Gebäude oder die Welt meint, sucht sich deshalb aus `candidates`
 * den, dessen Bildschirmpunkt (`toScreen(cam, candidate)`) von jedem Bewohner weit genug weg ist; ist keiner frei,
 * wartet er, bis die Bewohner weitergehen.
 */
async function clearOfResidents(page, candidates, toScreen, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const cam = await readCamera(page);
    const residents = JSON.parse(await page.evaluate(() => document.documentElement.dataset.residents ?? '[]')).filter((r) => r.sx !== undefined);
    // Reichweite eines Bewohners um seine Körpermitte (CSS-px): Radius des Treffers plus halbe Körperhöhe, und etwas Luft.
    const reach = Math.max(16 * cam.zoom, 24) + 16 * cam.zoom + 8;
    let best;
    for (const candidate of candidates) {
      const p = toScreen(cam, candidate);
      const distance = Math.min(Number.POSITIVE_INFINITY, ...residents.map((r) => Math.hypot(r.sx - p.x, r.sy - p.y)));
      if (!best || distance > best.distance) best = { candidate, distance };
    }
    if (!best || best.distance > reach || Date.now() > deadline) return best?.candidate ?? candidates[0];
    await sleep(250);
  }
}

/** Die Kachel aus `tiles`, an deren Mitte gerade kein Bewohner steht (siehe `clearOfResidents`). */
const tileClearOfResidents = (page, size, tiles) => clearOfResidents(page, tiles, (cam, tile) => screenOfTile(cam, size, tile));
/** Der Bildschirmpunkt (CSS-px) aus `points`, an dem gerade kein Bewohner steht. */
const pointClearOfResidents = (page, points) => clearOfResidents(page, points, (_cam, point) => point);

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
 * (oder `near`, Bildschirmpunkt) am nächsten liegt. `skip` sind Kacheln, die zusätzlich als belegt gelten; `accept(x, y)`
 * kann eine Fläche (linke obere Kachel) zusätzlich ablehnen; mit `anywhere` darf sie auch außerhalb des Bilds liegen.
 */
function findFreeArea(village, cam, size, w, h, { margin = 1, near, skip = [], accept, anywhere = false } = {}) {
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
      if (!free || (accept && !accept(x, y))) continue;
      const first = screenOfTile(cam, size, { x, y });
      const last = screenOfTile(cam, size, { x: x + w - 1, y: y + h - 1 });
      if (!anywhere && (first.x < usable.left || last.x > usable.right || first.y < usable.top || last.y > usable.bottom)) continue;
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
  // Die feste Zeile für den Satz einer gesperrten Karte liegt im Feld und überdeckt keine Karte (T1).
  const line = v.ui['shop-line'];
  check(line !== undefined && line.x - line.w / 2 >= panel.x - panel.w / 2 - 0.5 && line.x + line.w / 2 <= panel.x + panel.w / 2 + 0.5 && line.y + line.h / 2 <= panel.y + panel.h / 2 + 0.5, `${where}: Zeile fehlt oder liegt nicht im Feld`);
  if (line) {
    for (const [spot, c] of cards) {
      check(Math.abs(line.x - c.x) >= (line.w + c.w) / 2 - 0.5 || Math.abs(line.y - c.y) >= (line.h + c.h) / 2 - 0.5, `${where}: Zeile überdeckt „${spot}“`);
    }
  }
  // Schrift unter den Reitern: mindestens 12 px oder nur das Symbol (T5).
  for (const spot of Object.keys(v.ui).filter((name) => name.startsWith('tab-'))) {
    const font = v.ui[spot].font;
    check(font === 0 || font >= 12, `${where}: Schrift unter „${spot}“ nur ${font} px`);
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
  // Das aktive Werkzeug erneut antippen schaltet es nicht ab (R9).
  await tapUi('tool-path');
  await sleep(500);
  check((await readVillage(page)).tool === 'path', 'Das Werkzeug Weg erneut antippen hat es abgeschaltet');
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
  // Die Kachel hinter dem Haus, aber auf seinem Dach (eine, an der gerade kein Bewohner steht).
  await tapTile(await tileClearOfResidents(page, size, [{ x: target.x, y: target.y - 1 }, { x: target.x + 1, y: target.y - 1 }]));
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
  village = await waitStock((stock) => stock.coins <= before.coins - 25 + 15 && stock.wood <= before.wood - 6, 'abgebuchte Kosten der Bäckerei', 8000);
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
  village = await waitStock((stock) => stock.coins <= woodBefore.coins - 15 + 18 && stock.coins >= woodBefore.coins - 15, 'abgebuchte Kosten des Holzfällers (nur Taler)', 8000);
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
  // Reicht das Geld und das Holz noch für ein Haus (40 Taler, 8 Holz), wird eins gebaut; fehlt nur knapp etwas (ab 31 Taler oder
  // 5 Holz), ein paar Zäune (3 Taler, 1 Holz): der Markt verdient und der Holzfäller liefert weiter, das Haus soll aber auch ein paar
  // Sekunden später noch zu teuer sein.
  const used = [{ x: lonely?.x ?? -9, y: lonely?.y ?? -9 }];
  for (let guard = 0; guard < 12; guard += 1) {
    const state = village.ui['item-house-red']?.state;
    const safe = village.stock.coins <= 30 || village.stock.wood <= 4;
    if (state !== 'ok' && safe) break;
    const item = state === 'ok' ? 'house-red' : 'fence';
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
  // Das letzte Haus oben kann die Taler unter den Preis einer Blume (3 Taler) gedrückt haben; der Markt verdient weiter,
  // nach ein paar Sekunden reicht es wieder (für ein Haus noch lange nicht).
  village = await waitForVillage(page, (v) => v.shop.startsWith('deco:') && 'item-flower' in v.ui && v.stock.coins >= 3, 'der Deko-Reiter und 3 Taler für eine Blume', 30_000);
  await sleep(300);
  village = await readVillage(page);
  check(village.ui['item-flower'].dim === false, `Blume ist ausgegraut, obwohl sie bezahlbar ist (${village.stock.coins} Taler)`);
  await tapUi('tab-houses');
  await waitForVillage(page, (v) => v.shop.startsWith('houses:') && 'item-house-red' in v.ui, 'der Häuser-Reiter');
  await tapUi('item-house-red');
  // Eine Freischaltung kann gerade „Neu im Shop“ melden (geht vor, höchstens 7 s) – danach steht der Hinweis da.
  village = await waitForVillage(page, (v) => v.variant === 'house-red' && /fehl/.test(v.hint), 'den Hinweis „Dir fehlen …“ schon beim Wählen', 12_000);
  check(/Taler|Holz/.test(village.hint), `Haus: Hinweis „${village.hint}“ nennt nicht, was fehlt`);
  village = await readVillage(page);
  cam = await cameraAtRest();
  const houseSpot = findFreeArea(village, cam, size, 2, 2, { near: { x: size.width * 0.3, y: size.height * 0.4 } });
  check(houseSpot !== undefined, `Kein Platz für das Haus (Kamera ${JSON.stringify(cam)}, Schirm ${size.width}×${size.height}, ${village.buildings.length} Gebäude, ${village.paths.length} Wegkacheln, Werkzeug ${village.tool})`);
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
  // Jede Kachel des Gartens öffnet seine Karte; getippt wird eine, an der gerade kein Bewohner steht (sonst gewinnt er).
  const gardenTiles = [gardenTile, { x: garden.x, y: garden.y + 1 }, { x: garden.x + 1, y: garden.y }, { x: garden.x, y: garden.y }];
  await tapTile(await tileClearOfResidents(page, size, gardenTiles));
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
  await tapTile(await tileClearOfResidents(page, size, gardenTiles));
  await waitForVillage(page, (v) => v.card === String(garden.id), 'die wieder geöffnete Karte');
  const lastTap = (await readVillage(page)).lastTap;
  await input.tap(await pointClearOfResidents(page, [0.5, 0.42, 0.58].map((f) => ({ x: size.width * 0.06, y: size.height * f }))));
  village = await waitForVillage(page, (v) => v.card === '', 'die geschlossene Karte (Tipp daneben)');
  check(village.lastTap === lastTap, 'Tipp daneben wurde auch als Tipp auf die Welt gewertet');
  // Ein Haus öffnet keine Karte.
  const house = village.buildings.find((b) => b.type.startsWith('house'));
  await sleep(500);
  await tapTile(await tileClearOfResidents(page, size, [{ x: house.x, y: house.y + 1 }, { x: house.x + 1, y: house.y + 1 }, { x: house.x, y: house.y }, { x: house.x + 1, y: house.y }]));
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
    // Das Zahnrad (seit M5) und die Zoom-Knöpfe liegen über der Welt: der Tipp geht auf eine Kachel des Gartens, die frei davon ist.
    // Headless rendert nur mit etwa 8 fps und die Kamera kann nach dem Umschalten der Größe noch nachrücken: bis zu drei Versuche,
    // jedes Mal mit frisch gemessener Kamera (ein Tipp, der danebengeht, zählt nicht als Fehler der Karte).
    let opened = false;
    let lastFailure = '';
    for (let attempt = 0; attempt < 3 && !opened; attempt += 1) {
      const camNow = attempt === 0 ? cam2 : await cameraAtRest();
      // Im Anschauen steht die Hinweisleiste über der Werkzeugleiste und auf kleinen Schirmen über dem Garten: „Neu im
      // Shop: …“ (seit M7 schaltet das fröhliche Startdorf genau hier Strand und Wiese frei) schluckt den Tipp. Sie
      // verschwindet nach 7 s von selbst.
      v = await waitForVillage(page, (state) => !/Neu im Shop/.test(state.hint), `das Ende von „Neu im Shop“ bei ${w}×${h}`, 10_000);
      // Seit M6 auch kein Bewohner: ein Tipp nahe an seinem Körper öffnet seine Karte statt der des Gartens.
      const residentsNow = (await readResidents(page)).residents.filter((r) => r.sx !== undefined);
      const reach = Math.max(16 * camNow.zoom, 24) + 16 * camNow.zoom + 8;
      const covered = (p) =>
        ['menu', 'zoom-in', 'zoom-out'].some((spotName) => v.ui[spotName] && Math.hypot(p.x - v.ui[spotName].x, p.y - v.ui[spotName].y) < zr + 6) ||
        residentsNow.some((r) => Math.hypot(r.sx - p.x, r.sy - p.y) <= reach);
      const gardenSpots = [gardenTile, { x: garden.x, y: garden.y + 1 }, { x: garden.x + 1, y: garden.y }, { x: garden.x, y: garden.y }].map((tile) => screenOfTile(camNow, small, tile));
      const gardenAt = gardenSpots.find((p) => !covered(p)) ?? gardenSpots[0];
      if (attempt === 0) {
        check(gardenAt.x > 20 && gardenAt.x < w - 20 && gardenAt.y > stock.y + stock.h / 2 && gardenAt.y < toolbarTop, `${w}×${h}: Beerengarten liegt nicht antippbar im Bild (${gardenAt.x.toFixed(0)}, ${gardenAt.y.toFixed(0)})`);
      }
      await input.tap(gardenAt);
      try {
        v = await waitForVillage(page, (state) => state.card === String(garden.id) && 'card-close' in state.ui, `die Infokarte bei ${w}×${h}`, 3500);
        opened = true;
      } catch (error) {
        const now = await readVillage(page);
        await shot(`${name}-karte-fehler-${w}x${h}-${attempt}`).catch(() => {});
        lastFailure = `${error.message} | Versuch ${attempt + 1}: Tipp bei ${gardenAt.x.toFixed(0)},${gardenAt.y.toFixed(0)}, Kandidaten ${JSON.stringify(gardenSpots.map((p) => [Math.round(p.x), Math.round(p.y)]))}, Garten ${JSON.stringify(garden)}, Kamera ${JSON.stringify(camNow)}, Schirm ${JSON.stringify(small)}, Menü ${now.menu}, Karte „${now.card}“, Hinweis „${now.hint}“, Knöpfe ${JSON.stringify({ menu: now.ui.menu, zoomIn: now.ui['zoom-in'], zoomOut: now.ui['zoom-out'], stock: now.ui.stock })}`;
        console.log(`  [${name}] (Versuch ${attempt + 1} ohne Karte) ${lastFailure}`);
        await sleep(700);
      }
    }
    if (!opened) throw new Error(lastFailure);
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
  houses: ['invite', 'house-red', 'house-blue', 'house-yellow', 'house-big', 'house-garden'],
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
  // Der Shop öffnet auf dem Reiter, der zuletzt gezeigt wurde.
  village = await openTab('houses');
  check(village.shop === 'houses:1/1', `Shop: ${village.shop}, erwartet „houses:1/1“ (alles auf einer Seite)`);
  for (const tab of Object.keys(SHOP_ITEMS)) check(`tab-${tab}` in village.ui, `Shop: Reiter ${tab} fehlt`);
  check('shop-close' in village.ui && village.ui['shop-close'].w >= 48, 'Shop: kein großes ✕');
  for (const tab of Object.keys(SHOP_ITEMS)) check(village.ui[`tab-${tab}`]?.font >= 12, `Shop: Schrift unter dem Reiter ${tab} nur ${village.ui[`tab-${tab}`]?.font} px`);
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
      // Einladen (M6) braucht ein freies Haus: im Startdorf sind beide Plätze des roten Hauses belegt.
      const expected = id === 'invite' ? 'noRoom' : locked[tab].includes(id) ? 'locked' : 'ok';
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
  village = await waitForVillage(page, (v) => /300 Taler/.test(v.tip), 'der Satz am Brunnen');
  village = await openTab('production');
  await tapUi('item-carpenter');
  village = await waitForVillage(page, (v) => /Holzfäller/.test(v.tip), 'der Satz an der Schreinerei');
  village = await openTab('houses');
  await tapUi('item-house-big');
  village = await waitForVillage(page, (v) => /2 Häuser/.test(v.tip), 'der Satz am großen Pilzhaus');
  await tapUi('shop-close');
  await waitForVillage(page, (v) => v.tool === 'view' && v.shop === 'closed', 'der geschlossene Shop');

  // --- Der Satz bleibt in der festen Zeile, bis etwas anderes angetippt wird (T1) ---
  step('Satz in der festen Zeile bleibt');
  village = await openShop();
  village = await openTab('deco');
  await tapUi('item-bench');
  village = await waitForVillage(page, (v) => /40 Taler/.test(v.tip), 'der Satz an der Bank');
  check('shop-line' in village.ui, 'Shop: keine feste Zeile');
  await sleep(7000);
  village = await readVillage(page);
  check(/40 Taler/.test(village.tip), `Der Satz ist nach 7 Sekunden weg („${village.tip}“)`);
  await tapUi('tab-production');
  village = await waitForVillage(page, (v) => v.shop.startsWith('production:'), 'der Reiter Gebäude');
  check(village.tip === '', `Nach dem Reiterwechsel steht noch „${village.tip}“`);
  // Ein Tipp neben das Feld schließt den Shop, ohne etwas anderes zu tun (T3).
  const tapBefore = village.lastTap;
  const buildingsBefore = village.buildings.length;
  await sleep(500); // kurz nach dem Tipp auf den Reiter ignoriert die Welt Tipps (Doppeltipp-Schutz)
  await input.tap({ x: size.width * 0.5, y: size.height - 24 });
  village = await waitForVillage(page, (v) => v.shop === 'closed' && v.tool === 'view', 'der Shop nach dem Tipp daneben');
  check(village.lastTap === tapBefore && village.buildings.length === buildingsBefore && village.preview === 'none', 'Der Tipp neben den Shop hat auch etwas anderes ausgelöst');

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
  village = await waitForVillage(page, (v) => v.stock.coins <= coinsBefore - 3 + 15, 'die abgebuchten 3 Taler');
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
  console.log(`  [${name}] Boden neu malen (Baum): ${village.repaint.last.toFixed(1)} ms für ${village.repaint.blocks} von ${village.repaint.blocksTotal} Blöcken à 512 px (größtes: ${village.repaint.max.toFixed(1)} ms, insgesamt hochgeladen: ${village.repaint.uploaded} Blöcke)`);
  check(village.repaint.blocks >= 1 && village.repaint.blocks <= 4, `Baum: ${village.repaint.blocks} Blöcke neu gemalt, erwartet 1 bis 4`);
  check(village.repaint.last < 120, `Baum: Boden neu malen dauerte ${village.repaint.last.toFixed(0)} ms`);
  village = await waitForVillage(page, (v) => v.stock.coins <= treeCoins - 5 + 15, 'die abgebuchten 5 Taler');
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
    // Der Hinweis bleibt, bis der nächste Tipp kommt (nicht zeitgesteuert, T1).
    await sleep(6000);
    let hintAfter = (await readVillage(page)).hint;
    // Wird in diesen Sekunden etwas freigeschaltet, liegt „Neu im Shop“ 7 Sekunden über der Erklärung – danach ist sie wieder da (N3).
    if (/Neu im Shop/.test(hintAfter)) hintAfter = (await waitForVillage(page, (v) => /von allein/.test(v.hint), 'die Erklärung nach „Neu im Shop“', 9000)).hint;
    check(/von allein/.test(hintAfter), `Der Hinweis „von allein gewachsen“ ist nach 6 Sekunden weg (jetzt: „${hintAfter}“)`);
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
  // Der Strand war am Anfang gesperrt (oben geprüft); jetzt kann er schon frei sein, wenn der Markt inzwischen 60 Taler verdient hat.
  if (stateOf(village, 'beach') === 'locked') {
    await tapUi('item-beach');
    village = await waitForVillage(page, (v) => /60 Taler/.test(v.tip), 'der Satz am Strand');
  }
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
  console.log(`  [${name}] Boden neu malen (Strand): ${village.repaint.last.toFixed(1)} ms für ${village.repaint.blocks} von ${village.repaint.blocksTotal} Blöcken à 512 px (größtes: ${village.repaint.max.toFixed(1)} ms, insgesamt hochgeladen: ${village.repaint.uploaded} Blöcke)`);
  check(village.repaint.blocks >= 1 && village.repaint.blocks <= 4, `Strand: ${village.repaint.blocks} Blöcke neu gemalt, erwartet 1 bis 4`);
  check(village.repaint.last < 120, `Strand: Boden neu malen dauerte ${village.repaint.last.toFixed(0)} ms`);
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
  for (const [w, h] of [[320, 568], [568, 320], [640, 360], [480, 320], [360, 640]]) {
    step(`Shop auf ${w}×${h}`);
    await page.setViewportSize({ width: w, height: h });
    await sleep(1500);
    await waitForCameraRest(page);
    // Die Werkzeugleiste: Schrift mindestens 12 px oder nur das Symbol (T5).
    const bar = await readVillage(page);
    for (const tool of ['path', 'shop', 'move', 'demolish']) {
      const font = bar.ui[`tool-${tool}`]?.font;
      check(font === 0 || font >= 12, `${w}×${h}: Schrift unter „${tool}“ nur ${font} px`);
    }
    await openShop();
    let v;
    for (const tab of ['houses', 'deco', 'production', 'island']) {
      v = await openTab(tab);
      checkShopFits({ village: v, w, h, tab, check });
      if (tab === 'deco' && w === 320) await shot(`${name}-shop-handy-hochkant`);
      if (tab === 'deco' && w === 568) await shot(`${name}-shop-handy-quer`);
    }
    // Jede Seite zeigt mehr als eine Karte (mindestens 3), und wenn geblättert wird, sieht man beim Durchblättern alle 8 Deko-Karten.
    v = await openTab('deco');
    const onPage = Object.keys(v.ui).filter((spot) => spot.startsWith('item-')).length;
    check(onPage >= 3, `${w}×${h}: Deko zeigt nur ${onPage} Karte(n) pro Seite`);
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
    // Jeder Sperr-Satz passt in die Zeile: die gemessene Höhe des Textes ist höchstens so hoch wie die Zeile (B1).
    let tallest = 0;
    let lineHeight = 0;
    for (const tab of ['houses', 'deco', 'production', 'island']) {
      v = await openTab(tab);
      const tabPages = Number(v.shop.split('/')[1]);
      for (let pageIndex = 0; pageIndex < tabPages; pageIndex += 1) {
        for (const spot of Object.keys(v.ui).filter((name2) => name2.startsWith('item-') && v.ui[name2].state === 'locked')) {
          await tapUi(spot);
          await sleep(500); // Zwei Karten können denselben Satz haben: kurz warten statt auf eine Änderung
          v = await waitForVillage(page, (state) => state.tip !== '' && state.ui['shop-line']?.textH > 0, `der Satz auf ${spot}`);
          const line = v.ui['shop-line'];
          tallest = Math.max(tallest, line.textH);
          lineHeight = line.h;
          check(line.textH <= line.h + 0.5, `${w}×${h}: Satz „${v.tip}“ ist ${line.textH.toFixed(0)} px hoch, die Zeile nur ${line.h} px`);
        }
        if (pageIndex + 1 < tabPages) {
          await tapUi('page-next');
          v = await waitForVillage(page, (state) => state.shop === `${tab}:${pageIndex + 2}/${tabPages}`, `die nächste Seite in ${tab}`);
        }
      }
    }
    console.log(`  [${name}] ${w}×${h}: höchster Sperr-Satz ${tallest.toFixed(0)} px in einer Zeile von ${lineHeight} px`);
    await tapUi('shop-close');
    await waitForVillage(page, (state) => state.shop === 'closed', `der geschlossene Shop bei ${w}×${h}`);
  }
  await page.setViewportSize(size);
  await sleep(1000);
}


// ---------------------------------------------------------------------------------------------------------------------
// M5 – Speichern und Web-App
// ---------------------------------------------------------------------------------------------------------------------

/** Ohne `&nosave=1` lädt und speichert das Spiel auch bei fester Insel (siehe `src/save/startup.ts`). */
const SAVE_URL = `${URL}?seed=1`;
/** Die Version des Spielstands (`SAVE_VERSION` in `src/sim/saveData.ts`; M7: 4, mit Essen und Hunger der Bewohner). */
const SAVE_VERSION = 4;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Der Spielstand (`main`: das Dorf des neuesten Fensters, siehe `indexedDbStore.ts`) oder eine Kopie (`backup`, `backup-latest`)
 * in der echten IndexedDB der Seite (`null`, wenn nichts da ist).
 */
async function readRecord(page, key = 'main') {
  return page.evaluate(
    (name) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('village-game/Schlumpfwelt/');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('saves')) {
            db.close();
            resolve(null);
            return;
          }
          const objects = db.transaction('saves').objectStore('saves');
          const get = (k) =>
            new Promise((res, rej) => {
              const request = objects.get(k);
              request.onsuccess = () => res(request.result);
              request.onerror = () => rej(request.error);
            });
          (async () => {
            let value;
            if (name === 'main') {
              const owner = await get('owner');
              if (typeof owner === 'string') value = await get(`data:${owner}`);
              value ??= await get('main');
            } else {
              value = await get(name);
            }
            db.close();
            resolve(value ?? null);
          })().catch(reject);
        };
      }),
    key,
  );
}

/** Schreibt einen Spielstand (oder einen kaputten) so in die IndexedDB der Seite, wie es ein Spiel vor der Fensterregel getan hätte (Schlüssel `main`, kein Besitzer). */
async function writeRecord(page, value) {
  await page.evaluate(
    (data) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('village-game/Schlumpfwelt/', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('saves');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction('saves', 'readwrite');
          const objects = transaction.objectStore('saves');
          const keys = objects.getAllKeys();
          keys.onsuccess = () => {
            for (const key of keys.result) {
              if (key === 'owner' || (typeof key === 'string' && key.startsWith('data:'))) objects.delete(key);
            }
            objects.put(data, 'main');
          };
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    value,
  );
}

/**
 * Ändert den Spielstand von außen: erst auf eine Seite derselben Adresse wechseln, die nicht das Spiel ist (das Spiel
 * würde beim Verlassen noch einmal speichern und die Änderung überschreiben), dann in die IndexedDB schreiben.
 */
async function setRecordFromOutside(page, value) {
  await page.goto(`${URL}manifest.webmanifest`, { waitUntil: 'load' });
  await writeRecord(page, value);
}

/** Wartet, bis der Spielstand in der IndexedDB `predicate` erfüllt (der Autosave läuft kurz nach dem Bauen). */
async function waitForRecord(page, predicate, what, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let record = null;
  while (Date.now() < deadline) {
    record = await readRecord(page);
    if (record && predicate(record)) return record;
    await sleep(250);
  }
  throw new Error(`Zeitüberschreitung beim Warten auf ${what} in der IndexedDB (Stand: ${record ? `Version ${record.version}, ${record.buildings?.length} Gebäude, ${record.paths?.length} Wege` : 'leer'})`);
}

/** Die Teile eines Dorfs, die sich von allein nicht ändern, zum Vergleichen vor und nach dem Laden. */
const staticPartsOfVillage = (v) => ({
  buildings: v.buildings.map((b) => [b.id, b.type, b.x, b.y]),
  paths: [...v.paths].sort((a, b) => a[1] * MAP_TILES + a[0] - (b[1] * MAP_TILES + b[0])),
  terrain: v.terrain,
  planted: v.planted,
});
const staticPartsOfRecord = (r) => ({
  buildings: r.buildings.map((b) => [b.id, b.type, b.x, b.y]),
  paths: r.paths.map((index) => [index % MAP_TILES, Math.floor(index / MAP_TILES)]),
  terrain: r.world.terrain,
  planted: r.planted.length,
});

/** Alle Schlüssel der IndexedDB mit der Zahl der Blumen im jeweiligen Dorf (für Fehlermeldungen: wer hat zuletzt was geschrieben). */
async function describeStore(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('village-game/Schlumpfwelt/');
        open.onerror = () => resolve('nicht lesbar');
        open.onsuccess = () => {
          const db = open.result;
          const objects = db.transaction('saves').objectStore('saves');
          const keys = objects.getAllKeys();
          keys.onsuccess = () => {
            const result = [];
            let pending = keys.result.length;
            if (pending === 0) resolve('leer');
            for (const key of keys.result) {
              const get = objects.get(key);
              get.onsuccess = () => {
                const value = get.result;
                result.push(`${String(key).slice(0, 14)}=${typeof value === 'string' ? value.slice(0, 8) : `tick ${value?.tick} Blumen ${value?.buildings?.filter?.((b) => b.type === 'flower').length}`}`);
                pending -= 1;
                if (pending === 0) {
                  db.close();
                  resolve(result.join(', '));
                }
              };
            }
          };
        };
      }),
  );
}

/** Beim Neustart der Szene (Datei geladen) dürfen keine Phaser-Warnungen über fehlende Texturen kommen. */
function collectTextureWarnings(page) {
  const warnings = [];
  const handler = (message) => {
    if (message.type() === 'warning' || message.type() === 'error') warnings.push(message.text());
  };
  page.on('console', handler);
  return { warnings, stop: () => page.off('console', handler) };
}

/**
 * Speichern (M5): Autosave in die echte IndexedDB, Laden beim Start, Export und Import als Datei, kaputter und
 * neuerer Spielstand, die Adressregel für `?seed=N`, Browser ohne IndexedDB.
 */
async function testSaving({ browser, page, check, shot, size, input, name, profile, waitForScene, problems }) {
  const { step, cameraAtRest, tapUi, tapTile, selectTool, openShop, pickItem, exitTool, confirm } = buildHelpers({ page, check, size, input, name });
  const count = (village, type) => village.buildings.filter((b) => b.type === type).length;
  const waitForSave = (predicate, what, timeoutMs = 10_000) => waitForVillage(page, (v) => v.save.store !== undefined && predicate(v), what, timeoutMs);
  /** Zwei Mal herauszoomen: Überblick wie in den Bau-Prüfungen (die Kacheln sind sonst mindestens 32 px groß). */
  const overview = async () => {
    const v = await readVillage(page);
    for (let i = 0; i < 2; i += 1) {
      await input.tap(v.ui['zoom-out']);
      await sleep(300);
    }
    await cameraAtRest();
  };
  /** Setzt einen 1×1-Artikel auf eine freie Wiese nahe `near` (Anteile des Bildschirms) und wartet auf ✓. */
  const placeSmall = async (typeId, near, what, ready) => {
    await pickItem(typeId);
    const v0 = await readVillage(page);
    const spot = findFreeArea(v0, await cameraAtRest(), size, 1, 1, { near: { x: size.width * near[0], y: size.height * near[1] } });
    check(spot !== undefined, `Kein freier Platz für ${what}`);
    if (!spot) throw new Error(`kein Platz für ${what}`);
    await tapTile(spot);
    await waitForVillage(page, (v) => v.preview === 'place:ok', `grüne Vorschau für ${what}`);
    const done = await confirm((v) => ready(v, v0), what);
    return { spot, village: done };
  };

  // --- Neues Dorf: der Speicher ist die echte IndexedDB ---
  step('Speichern: neues Dorf mit ?seed=1 (speichert normal)');
  await enterIsland(page, profile, waitForScene, SAVE_URL);
  let village = await waitForSave((v) => v.buildings.length > 0, 'das neue Dorf mit Speicher-Marker');
  check(village.save.store === 'indexedDb' && village.save.autosave === true && village.save.start === 'new', `Start: Speicher ${JSON.stringify(village.save)}, erwartet IndexedDB, Autosave an, neu`);
  check(village.hint === '', `Start: unerwarteter Hinweis „${village.hint}“`);
  check('menu' in village.ui && village.ui.menu.w >= 48 && village.ui.menu.h >= 48, `Zahnrad fehlt oder ist kleiner als 48 px (${JSON.stringify(village.ui.menu)})`);
  await overview();
  village = await readVillage(page);
  check(!village.hint.includes('Neu im Shop'), 'Start: „Neu im Shop“ ohne Grund');
  await shot(`${name}-zahnrad`);

  // --- Bauen: Haus (schaltet Neues frei), Blume, Baum (verändert das Gelände), Weg ---
  step('Speichern: Haus, Blume, Baum und Weg bauen');
  await pickItem('house-red');
  let cam = await cameraAtRest();
  const houseArea = findFreeArea(village, cam, size, 2, 2, { near: { x: size.width * 0.3, y: size.height * 0.35 } });
  check(houseArea !== undefined, 'Kein freier Platz für das Haus');
  if (!houseArea) return;
  await tapTile({ x: houseArea.x, y: houseArea.y + 1 });
  await waitForVillage(page, (v) => v.preview === 'place:ok', 'grüne Vorschau fürs Haus');
  const housesBefore = village.buildings.length;
  village = await confirm((v) => v.buildings.length === housesBefore + 1, 'das neue Haus');
  check(village.unlocked.length > 0, 'Das zweite Haus hat nichts freigeschaltet (erwartet: Beet und großes Haus)');

  await placeSmall('flower', [0.5, 0.3], 'die Blume', (v, v0) => count(v, 'flower') === count(v0, 'flower') + 1);
  const planted = await placeSmall('tree', [0.62, 0.36], 'den Baum', (v) => v.planted === 1);
  check(planted.village.terrain[planted.spot.y * MAP_TILES + planted.spot.x] === 'f', 'Baum: die Kachel ist kein Wald');
  await exitTool();
  village = await readVillage(page);
  cam = await cameraAtRest();
  const pathArea = findFreeArea(village, cam, size, 3, 1, { near: { x: size.width * 0.4, y: size.height * 0.5 } });
  check(pathArea !== undefined, 'Kein freier Platz für den Weg');
  if (!pathArea) return;
  await selectTool('path');
  await tapTile({ x: pathArea.x, y: pathArea.y });
  await tapTile({ x: pathArea.x + 2, y: pathArea.y });
  const pathsBefore = village.paths.length;
  await confirm((v) => v.paths.length === pathsBefore + 3, 'drei neue Wegkacheln');
  await exitTool();
  const before = await readVillage(page);
  check(before.planted === 1 && before.unlocked.length > 0, 'Vor dem Speichern fehlen Baum oder Freischaltung');

  // --- Autosave: kurz nach dem Bauen steht alles in der echten IndexedDB ---
  step('Speichern: Autosave schreibt in die IndexedDB');
  const record = await waitForRecord(
    page,
    (r) => r.paths?.length === before.paths.length && r.planted?.length === 1 && r.buildings?.length === before.buildings.length,
    'den gespeicherten Stand',
  );
  check(record.format === 'village-save' && record.version === SAVE_VERSION, `Spielstand: Format ${record.format}, Version ${record.version}`);
  check(same(staticPartsOfRecord(record), { ...staticPartsOfVillage(before), planted: 1 }), 'Spielstand in der IndexedDB stimmt nicht mit dem Dorf überein (Gebäude, Wege, Gelände, Bäume)');
  check(same(record.unlocked, before.unlocked), `Spielstand: Freischaltungen ${JSON.stringify(record.unlocked)} statt ${JSON.stringify(before.unlocked)}`);
  check(record.world.terrain.length === MAP_TILES * MAP_TILES && /^[wsgfr]+$/.test(record.world.terrain), 'Spielstand: Gelände ist kein Text aus w, s, g, f, r');
  check(record.world.terrain[planted.spot.y * MAP_TILES + planted.spot.x] === 'f', 'Spielstand: der gepflanzte Baum steht nicht im Gelände');
  check((await readVillage(page)).save.saves >= 1, 'Spiel meldet keinen Autosave');

  // --- Neu laden: dasselbe Dorf, dieselbe Zeit, keine falsche Meldung ---
  step('Speichern: Seite neu laden, Dorf ist wieder da');
  await enterIsland(page, profile, waitForScene, SAVE_URL);
  village = await waitForSave((v) => v.buildings.length > 0, 'das geladene Dorf');
  check(village.save.start === 'loaded' && village.save.autosave === true, `Neustart: ${JSON.stringify(village.save)}, erwartet „loaded“`);
  const afterReload = await readRecord(page);
  check(same(staticPartsOfVillage(village), staticPartsOfVillage(before)), 'Nach dem Laden stimmen Gebäude, Wege, Gelände oder Bäume nicht mit dem Stand vorher überein');
  check(same(village.unlocked, before.unlocked), `Nach dem Laden: Freischaltungen ${JSON.stringify(village.unlocked)} statt ${JSON.stringify(before.unlocked)}`);
  check(afterReload && village.save.startTick === afterReload.tick && same(village.save.startStock, afterReload.inventory), `Nach dem Laden: Zeit und Lager (${village.save.startTick}, ${JSON.stringify(village.save.startStock)}) sind nicht die des Spielstands`);
  check(village.save.startTick > 0, 'Nach dem Laden beginnt die Zeit wieder bei 0');
  check(village.save.startTick - record.tick < 600, `Nach dem Laden: ${village.save.startTick - record.tick} Ticks (über 60 s) mehr als im ersten Spielstand – Zeit wurde nachgeholt?`);
  await sleep(1500);
  village = await readVillage(page);
  check(!village.hint.includes('Neu im Shop') && village.hint === '', `Nach dem Laden: Meldung „${village.hint}“ (erwartet keine)`);
  check(village.ui['tool-shop'].badge === false, 'Nach dem Laden trägt der Shop-Knopf einen Stern');
  await shot(`${name}-geladen`);
  await openShop();
  village = await readVillage(page);
  check(!Object.values(village.ui).some((spot) => spot.fresh === true), 'Nach dem Laden tragen Shop-Karten einen Stern („neu“)');
  await tapUi('shop-close');
  await waitForVillage(page, (v) => v.shop === 'closed' && v.tool === 'view', 'der geschlossene Shop');

  // --- Das Zahnrad: Menü, Export als Datei ---
  step('Menü: Zahnrad öffnet das Menü, Datei sichern');
  await tapUi('menu');
  village = await waitForVillage(page, (v) => v.menu === 'menu' && 'menu-save' in v.ui && 'menu-load' in v.ui, 'das offene Menü');
  for (const spot of ['menu-save', 'menu-load', 'menu-close']) {
    check(village.ui[spot].w >= 48 && village.ui[spot].h >= 48, `Menü: ${spot} ist nur ${village.ui[spot].w}×${village.ui[spot].h} px groß`);
  }
  const panel = village.ui['menu-panel'];
  check(panel.x - panel.w / 2 >= 0 && panel.x + panel.w / 2 <= size.width && panel.y - panel.h / 2 >= 0 && panel.y + panel.h / 2 <= size.height, 'Menü: das Feld ragt aus dem Bild');
  await sleep(500);
  await shot(`${name}-menu`);
  // Das Menü deckt die Insel und die Leiste zu: ein Tipp auf die Stelle des Weg-Knopfs schaltet nichts.
  await input.tap({ x: village.ui['tool-path'].x, y: village.ui['tool-path'].y });
  await sleep(500);
  village = await readVillage(page);
  check(village.tool === 'view' && village.menu === 'menu', `Menü offen: ein Tipp auf die Werkzeugleiste hat Werkzeug „${village.tool}“ gewählt oder das Menü geschlossen`);
  if (!profile.context.hasTouch) {
    // R10: das Mausrad zoomt die Insel hinter dem Menü nicht.
    const zoomBefore = (await readCamera(page)).zoom;
    await page.mouse.move(size.width / 2, size.height / 2);
    await page.mouse.wheel(0, -400);
    await sleep(1000);
    check((await readCamera(page)).zoom === zoomBefore, 'Menü offen: das Mausrad hat die Insel dahinter gezoomt');
  }
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10_000 }), tapUi('menu-save')]);
  check(/^[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()), `Dateiname „${download.suggestedFilename()}“`);
  const exported = await readFile(await download.path(), 'utf8');
  const exportedData = JSON.parse(exported);
  check(exportedData.format === 'village-save' && exportedData.version === SAVE_VERSION, 'Export: Format oder Version stimmt nicht');
  await waitForVillage(page, (v) => v.menu === 'menu:menu.fileSaved', 'der Satz „Datei fertig“');
  check(same(staticPartsOfRecord(exportedData), staticPartsOfVillage(await readVillage(page))), 'Export: Datei stimmt nicht mit dem Dorf überein');
  await tapUi('menu-close');
  await waitForVillage(page, (v) => v.menu === 'closed', 'das geschlossene Menü');

  // --- Import: erst nach ✓, ✕ bricht ab ---
  step('Menü: Datei laden – ✕ bricht ab, ✓ ersetzt das Dorf');
  await placeSmall('bush', [0.35, 0.62], 'den Busch', (v, v0) => count(v, 'bush') === count(v0, 'bush') + 1);
  await exitTool();
  const changed = await readVillage(page);
  check(changed.buildings.length === before.buildings.length + 1, 'Der Busch fehlt');

  // R3: ein Dateiwähler, der nie antwortet, hält den Knopf nicht fest – der nächste Tipp öffnet einen neuen.
  await tapUi('menu');
  await waitForVillage(page, (v) => v.menu === 'menu' && 'menu-load' in v.ui, 'das offene Menü');
  await tapUi('menu-load');
  await sleep(400);
  await tapUi('menu-close');
  await waitForVillage(page, (v) => v.menu === 'closed', 'das geschlossene Menü');

  const chooseFile = async (content, mimeType = 'application/json') => {
    await tapUi('menu');
    await waitForVillage(page, (v) => v.menu === 'menu' && 'menu-load' in v.ui, 'das offene Menü');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10_000 }), tapUi('menu-load')]);
    await chooser.setFiles({ name: 'dorf.json', mimeType, buffer: Buffer.isBuffer(content) ? content : Buffer.from(content) });
  };
  await chooseFile(exported);
  village = await waitForVillage(page, (v) => v.menu === 'confirm' && 'menu-confirm' in v.ui && 'menu-cancel' in v.ui, 'die Frage „Dorf ersetzen?“');
  check(village.ui['menu-confirm'].w >= 64 && village.ui['menu-cancel'].w >= 64, 'Frage: ✓ oder ✕ kleiner als 64 px');
  check(count(village, 'bush') === count(changed, 'bush'), 'Frage: das Dorf wurde schon ersetzt, bevor ✓ gedrückt wurde');
  await sleep(400);
  await shot(`${name}-menu-frage`);
  await tapUi('menu-cancel');
  village = await waitForVillage(page, (v) => v.menu === 'menu', 'das Menü nach ✕');
  check(same(staticPartsOfVillage(village), staticPartsOfVillage(changed)), '✕ hat das Dorf verändert');

  const textures = collectTextureWarnings(page);
  await tapUi('menu-close');
  await chooseFile(exported);
  await waitForVillage(page, (v) => v.menu === 'confirm', 'die Frage noch einmal');
  await tapUi('menu-confirm');
  await waitForVillage(page, (v) => v.menu === 'closed' && same(staticPartsOfVillage(v), staticPartsOfVillage(before)), 'das ersetzte Dorf (ohne den Busch)', 15_000);
  await sleep(1500);
  textures.stop();
  check(textures.warnings.length === 0, `Neustart der Szene: Warnungen oder Fehler in der Konsole: ${textures.warnings.join(' | ')}`);
  village = await readVillage(page);
  check(village.hint === 'Dein Dorf aus der Datei ist da!', `Nach dem Import: Hinweis „${village.hint}“`);
  check(!('menu-save' in village.ui) && village.menu === 'closed', 'Nach dem Import ist das Menü noch zu sehen');
  check('tool-shop' in village.ui && 'menu' in village.ui, 'Nach dem Import fehlen Werkzeugleiste oder Zahnrad');
  await shot(`${name}-importiert`);
  // Die Insel lebt: der Shop lässt sich öffnen und schließen.
  await openShop();
  await tapUi('shop-close');
  await waitForVillage(page, (v) => v.shop === 'closed', 'der Shop nach dem Import');
  await waitForRecord(page, (r) => same(staticPartsOfRecord(r), { ...staticPartsOfVillage(before), planted: 1 }), 'der importierte Stand in der IndexedDB');

  // --- Dateien, die nicht passen: freundlicher Satz, nichts ändert sich ---
  step('Menü: unbrauchbare Dateien');
  const without = (key) => {
    const copy = JSON.parse(exported);
    delete copy[key];
    return JSON.stringify(copy);
  };
  const bad = [
    ['Text statt JSON', 'das ist kein Spielstand', 'menu.errorNotSave'],
    ['fremdes JSON', '{"name":"Max","punkte":3}', 'menu.errorNotSave'],
    ['leere Datei', '', 'menu.errorNotSave'],
    ['neuere Version', JSON.stringify({ ...JSON.parse(exported), version: 99 }), 'menu.errorTooNew'],
    ['ohne Gelände', without('world'), 'menu.errorBroken'],
    ['zu groß', Buffer.alloc(2_100_000, 32), 'menu.errorTooBig'],
  ];
  const kept = staticPartsOfVillage(await readVillage(page));
  let first = true;
  for (const [label, content, key] of bad) {
    await chooseFile(content);
    village = await waitForVillage(page, (v) => v.menu === `menu:${key}`, `der Satz zu „${label}“ (${key})`);
    check(same(staticPartsOfVillage(village), kept), `${label}: das Dorf hat sich verändert`);
    if (first) {
      first = false;
      await sleep(400);
      await shot(`${name}-menu-fehler`);
    }
    await tapUi('menu-close');
    await waitForVillage(page, (v) => v.menu === 'closed', 'das geschlossene Menü');
  }

  // --- Kleine Bildschirme: das Menü passt ---
  step('Menü: kleine Bildschirme');
  for (const [w, h] of [[568, 320], [320, 568], [640, 360], [360, 640], [480, 320]]) {
    await page.setViewportSize({ width: w, height: h });
    await sleep(1200);
    await waitForCameraRest(page);
    let v = await readVillage(page);
    const gear = v.ui.menu;
    check(gear !== undefined && gear.w >= 48 && gear.h >= 48 && gear.x + gear.w / 2 <= w && gear.y + gear.h / 2 <= h, `${w}×${h}: Zahnrad fehlt, ist zu klein oder ragt aus dem Bild (${JSON.stringify(gear)})`);
    if (!gear) continue;
    await input.tap(gear);
    v = await waitForVillage(page, (state) => state.menu === 'menu' && 'menu-load' in state.ui, `das Menü bei ${w}×${h}`);
    for (const spot of ['menu-save', 'menu-load', 'menu-close']) {
      const s = v.ui[spot];
      check(s.w >= 48 && s.h >= 48 && s.x - s.w / 2 >= 0 && s.x + s.w / 2 <= w && s.y - s.h / 2 >= 0 && s.y + s.h / 2 <= h, `${w}×${h}: ${spot} ist zu klein oder ragt aus dem Bild (${JSON.stringify(s)})`);
    }
    const [saveSpot, loadSpot] = [v.ui['menu-save'], v.ui['menu-load']];
    const overlap = Math.abs(saveSpot.x - loadSpot.x) < (saveSpot.w + loadSpot.w) / 2 && Math.abs(saveSpot.y - loadSpot.y) < (saveSpot.h + loadSpot.h) / 2;
    check(!overlap, `${w}×${h}: die beiden Menü-Knöpfe überlappen`);
    if ((w === 568 && h === 320) || (w === 320 && h === 568)) {
      await sleep(400);
      await shot(w > h ? `${name}-menu-handy-quer` : `${name}-menu-handy-hochkant`);
    }
    await tapUi('menu-close');
    await waitForVillage(page, (state) => state.menu === 'closed', `das geschlossene Menü bei ${w}×${h}`);
  }
  await page.setViewportSize(size);
  await sleep(1000);

  // --- Hartes Schließen: der letzte Bau geht nicht verloren (W1) ---
  step('Hartes Schließen: bauen, kurz warten, Seite weg – der Bau ist da');
  await overview();
  const beforeClose = await readVillage(page);
  await placeSmall('flower', [0.5, 0.3], 'die letzte Blume', (v, v0) => count(v, 'flower') === count(v0, 'flower') + 1);
  await sleep(250);
  const leaving = `${JSON.stringify((await readVillage(page)).save)} ${await describeStore(page)}`;
  await page.goto('about:blank');
  await enterIsland(page, profile, waitForScene, SAVE_URL);
  village = await waitForSave((v) => v.buildings.length > 0, 'das Dorf nach dem harten Schließen');
  check(count(village, 'flower') === count(beforeClose, 'flower') + 1, `Hartes Schließen: ${count(village, 'flower')} statt ${count(beforeClose, 'flower') + 1} Blumen – der letzte Bau ging verloren (Speicher jetzt: ${await describeStore(page)}; Spiel: ${JSON.stringify(village.save)}; vor dem Schließen: ${leaving})`);

  // --- Zwei Fenster: das neueste speichert, das alte sagt es und schreibt nichts mehr (N1) ---
  step('Zwei Fenster: das neue übernimmt, das alte zeigt „Hier weiterspielen“');
  await overview();
  await placeSmall('flower', [0.5, 0.3], 'die Blume im ersten Fenster', (v, v0) => count(v, 'flower') === count(v0, 'flower') + 1);
  await exitTool();
  const flowersA = count(await readVillage(page), 'flower');
  await waitForRecord(page, (r) => r.buildings.filter((b) => b.type === 'flower').length === flowersA, 'die Blume des ersten Fensters in der IndexedDB');
  const second = await page.context().newPage();
  const secondProblems = [];
  second.on('console', (message) => {
    if (message.type() === 'error') secondProblems.push(`Konsolenfehler: ${message.text()}`);
  });
  second.on('pageerror', (error) => secondProblems.push(`Seitenfehler: ${error.message}`));
  await second.goto(SAVE_URL, { waitUntil: 'load' });
  await second.waitForSelector('html[data-scene="boot"]', { state: 'attached', timeout: 20_000 });
  await second.waitForTimeout(500);
  if (profile.context.hasTouch) await second.touchscreen.tap(size.width / 2, size.height * 0.54);
  else await second.mouse.click(size.width / 2, size.height * 0.54);
  await second.waitForSelector('html[data-scene="island"]', { state: 'attached', timeout: 40_000 });
  const other = await waitForVillage(second, (v) => v.buildings.length > 0 && v.save.store !== undefined, 'das Dorf im zweiten Fenster', 30_000);
  check(other.save.start === 'loaded' && other.save.autosave === true && other.save.lost === false, `Zweites (neues) Fenster: ${JSON.stringify(other.save)}`);
  check(count(other, 'flower') === flowersA, `Zweites Fenster: ${count(other, 'flower')} statt ${flowersA} Blumen – der letzte Stand des ersten ging verloren`);
  const alt = await waitForVillage(page, (v) => v.save.lost === true && v.menu === 'lost' && 'lost-play' in v.ui, 'die Ebene „Hier weiterspielen“ im ersten Fenster', 15_000);
  check(alt.save.autosave === false, `Erstes (altes) Fenster: ${JSON.stringify(alt.save)}`);
  check(alt.ui['lost-play'].w >= 80 && alt.ui['lost-play'].h >= 80, `Ebene: der Knopf ist ${alt.ui['lost-play'].w}×${alt.ui['lost-play'].h} px groß, erwartet mindestens 80 px`);
  const lostPanel = alt.ui['lost-panel'];
  check(lostPanel.x - lostPanel.w / 2 >= 0 && lostPanel.x + lostPanel.w / 2 <= size.width && lostPanel.y - lostPanel.h / 2 >= 0 && lostPanel.y + lostPanel.h / 2 <= size.height, 'Ebene: das Feld ragt aus dem Bild');
  await shot(`${name}-weiterspielen`);
  // Die Ebene schluckt alle Tipps: weder die Werkzeugleiste noch die Welt reagieren, es kann nichts gebaut werden.
  await input.tap(alt.ui['tool-shop']);
  // Die Mitte des Bilds ist das Feld mit dem Knopf: ein Tipp auf die Welt daneben, am Rand.
  await input.tap({ x: 30, y: size.height / 2 });
  await sleep(700);
  const covered = await readVillage(page);
  check(covered.shop === 'closed' && covered.tool === 'view' && covered.lastTap === alt.lastTap && covered.menu === 'lost', `Ebene: ein Tipp darunter hat etwas bewirkt (Shop ${covered.shop}, Werkzeug ${covered.tool}, Tipp ${covered.lastTap}, Menü ${covered.menu})`);
  // Das neue Fenster baut und speichert …
  const second2 = buildHelpers({ page: second, check, size, input: profile.context.hasTouch ? { tap: (p2) => second.touchscreen.tap(p2.x, p2.y) } : { tap: (p2) => second.mouse.click(p2.x, p2.y) }, name });
  await second2.pickItem('flower');
  const vSecond = await readVillage(second);
  const spotSecond = findFreeArea(vSecond, await waitForCameraRest(second).then(() => readCamera(second)), size, 1, 1, { near: { x: size.width * 0.4, y: size.height * 0.35 } });
  check(spotSecond !== undefined, 'Zweites Fenster: kein freier Platz für die Blume');
  if (spotSecond) {
    await second2.tapTile(spotSecond);
    await waitForVillage(second, (v) => v.preview === 'place:ok', 'grüne Vorschau im zweiten Fenster');
    await second2.confirm((v) => count(v, 'flower') === flowersA + 1, 'die Blume im zweiten Fenster');
  }
  await waitForRecord(page, (r) => r.buildings.filter((b) => b.type === 'flower').length === flowersA + 1, 'die Blume des zweiten Fensters in der IndexedDB');
  await sleep(1500);
  check((await readVillage(page)).save.saves === alt.save.saves, 'Altes Fenster: meldet weitere Schreibvorgänge');
  // Das zweite Fenster geht zu: das erste bleibt „verloren“, bis das Kind „Hier weiterspielen“ tippt – dann lädt es neu, übernimmt
  // und liest den Stand des zweiten Fensters.
  await second.close();
  for (const entry of secondProblems) problems.push(entry);
  await sleep(500);
  check((await readVillage(page)).menu === 'lost', 'Ebene: sie ist nach dem Schließen des zweiten Fensters verschwunden (das erste Fenster speichert nicht)');
  await input.tap(alt.ui['lost-play']);
  await page.waitForSelector('html[data-scene="boot"]', { state: 'attached', timeout: 40_000 });
  await page.waitForTimeout(500);
  if (profile.context.hasTouch) await page.touchscreen.tap(size.width / 2, size.height * 0.54);
  else await page.mouse.click(size.width / 2, size.height * 0.54);
  await page.waitForSelector('html[data-scene="island"]', { state: 'attached', timeout: 40_000 });
  village = await waitForSave((v) => v.buildings.length > 0, 'das Dorf nach „Hier weiterspielen“', 30_000);
  check(village.save.start === 'loaded' && village.save.autosave === true && village.save.lost === false && village.menu === 'closed', `Nach „Hier weiterspielen“: ${JSON.stringify(village.save)}, Menü ${village.menu}`);
  check(count(village, 'flower') === flowersA + 1, `Nach „Hier weiterspielen“: ${count(village, 'flower')} statt ${flowersA + 1} Blumen (der Stand des zweiten Fensters)`);
  // … und es speichert wieder: der nächste Bau geht auch bei hartem Schließen nicht verloren.
  step('Hartes Schließen gleich nach der Übernahme');
  await overview();
  const beforeTake = await readVillage(page);
  await placeSmall('flower', [0.45, 0.32], 'die Blume nach der Übernahme', (v, v0) => count(v, 'flower') === count(v0, 'flower') + 1);
  await sleep(250);
  await page.goto('about:blank');
  await enterIsland(page, profile, waitForScene, SAVE_URL);
  village = await waitForSave((v) => v.buildings.length > 0, 'das Dorf nach Übernahme und hartem Schließen');
  check(count(village, 'flower') === count(beforeTake, 'flower') + 1, `Hartes Schließen nach der Übernahme: ${count(village, 'flower')} statt ${count(beforeTake, 'flower') + 1} Blumen – der Bau ging verloren (Speicher jetzt: ${await describeStore(page)}; Spiel: ${JSON.stringify(village.save)})`);

  // --- Kaputter Spielstand beim Start ---
  step('Start mit kaputtem Spielstand');
  await setRecordFromOutside(page, { format: 'village-save', version: 2, world: null, buildings: 'viele' });
  await enterIsland(page, profile, waitForScene, SAVE_URL);
  village = await waitForSave((v) => v.buildings.length > 0, 'das neue Dorf nach dem kaputten Spielstand');
  check(village.save.start === 'unreadable' && village.save.autosave === true, `Kaputter Spielstand: ${JSON.stringify(village.save)}`);
  check(/Dein altes Dorf ging nicht auf/.test(village.hint), `Kaputter Spielstand: Hinweis „${village.hint}“`);
  check(village.buildings.length === 6, `Kaputter Spielstand: ${village.buildings.length} Gebäude statt dem Startdorf`);
  // R1: der kaputte Stand ist als Kopie gesichert, bevor er ersetzt wird.
  check(same(await readRecord(page, 'backup'), { format: 'village-save', version: 2, world: null, buildings: 'viele' }), 'Kaputter Spielstand: keine Kopie in „backup“');
  // Eine Änderung stößt das Speichern an: der kaputte Spielstand wird durch einen heilen ersetzt.
  await overview();
  await placeSmall('flower', [0.5, 0.3], 'die Blume im neuen Dorf', (v, v0) => count(v, 'flower') === count(v0, 'flower') + 1);
  await exitTool();
  await waitForRecord(page, (r) => r.format === 'village-save' && r.version === SAVE_VERSION && Array.isArray(r.buildings) && r.buildings.length === 7, 'ein heiler Spielstand nach dem kaputten');

  // --- Neuerer Spielstand: nicht überschreiben ---
  step('Start mit Spielstand aus einer neueren Version');
  const future = { ...exportedData, version: 99, note: 'neuer' };
  await setRecordFromOutside(page, future);
  await enterIsland(page, profile, waitForScene, SAVE_URL);
  village = await waitForSave((v) => v.buildings.length > 0, 'das neue Dorf neben dem neueren Spielstand');
  check(village.save.start === 'tooNew' && village.save.autosave === false, `Neuerer Spielstand: ${JSON.stringify(village.save)}`);
  check(/neueren Version/.test(village.hint), `Neuerer Spielstand: Hinweis „${village.hint}“`);
  await overview();
  await placeSmall('flower', [0.4, 0.3], 'die Blume neben dem neueren Spielstand', (v, v0) => count(v, 'flower') === count(v0, 'flower') + 1);
  await exitTool();
  await sleep(4000);
  const still = await readRecord(page);
  check(still && still.version === 99 && still.note === 'neuer', 'Der Spielstand aus der neueren Version wurde überschrieben');

  // --- ?seed=1&nosave=1: weder laden noch speichern ---
  step('Adressregel: &nosave=1 lädt und speichert nicht');
  await page.goto(GAME_URL, { waitUntil: 'load' });
  await waitForScene('boot');
  await page.waitForTimeout(500);
  if (profile.context.hasTouch) await page.touchscreen.tap(size.width / 2, size.height * 0.54);
  else await page.mouse.click(size.width / 2, size.height * 0.54);
  await waitForScene('island');
  village = await waitForSave((v) => v.buildings.length > 0, 'das frische Dorf bei &nosave=1');
  check(village.save.start === 'new' && village.save.autosave === false && village.save.startTick === 0, `&nosave=1: ${JSON.stringify(village.save)}, erwartet neu ohne Autosave`);
  check(village.buildings.length === 6, `&nosave=1: ${village.buildings.length} Gebäude statt dem Startdorf`);
  await sleep(1500);
  check((await readRecord(page))?.version === 99, '&nosave=1 hat den Spielstand überschrieben');

  // --- Browser ohne IndexedDB: das Spiel läuft, ohne Fehler ---
  step('Browser ohne IndexedDB');
  const plain = await browser.newContext(profile.context);
  await plain.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new DOMException('Speicher gesperrt', 'SecurityError');
      },
    });
  });
  const lone = await plain.newPage();
  const loneProblems = [];
  lone.on('console', (message) => {
    if (message.type() === 'error') loneProblems.push(`Konsolenfehler: ${message.text()}`);
  });
  lone.on('pageerror', (error) => loneProblems.push(`Seitenfehler: ${error.message}`));
  await lone.goto(URL, { waitUntil: 'load' });
  await lone.waitForSelector('html[data-scene="boot"]', { state: 'attached', timeout: 10_000 });
  await lone.waitForTimeout(500);
  if (profile.context.hasTouch) await lone.touchscreen.tap(size.width / 2, size.height * 0.54);
  else await lone.mouse.click(size.width / 2, size.height * 0.54);
  // Die erste Insel eines frischen Browsers erzeugt alle Bilder und braucht im Headless-Modus einige Sekunden.
  await lone.waitForSelector('html[data-scene="island"]', { state: 'attached', timeout: 40_000 });
  const loneVillage = await waitForVillage(lone, (v) => v.buildings.length > 0 && v.save.store !== undefined, 'das Dorf ohne IndexedDB', 30_000);
  check(loneVillage.save.store === 'memory' && loneVillage.save.autosave === false, `Ohne IndexedDB: ${JSON.stringify(loneVillage.save)}`);
  check(/Hier kann nichts gespeichert werden/.test(loneVillage.hint), `Ohne IndexedDB: Hinweis „${loneVillage.hint}“`);
  await sleep(2500);
  check(loneProblems.length === 0, `Ohne IndexedDB: ${loneProblems.join(' | ')}`);
  await plain.close();
  for (const entry of loneProblems) problems.push(entry);

  // --- iPad: die Datei geht übers Teilen-Blatt (R4) ---
  step('iPad: Datei übers Teilen-Blatt, Abbruch ist kein Fehler');
  const ipad = await browser.newContext({
    ...profile.context,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  });
  await ipad.addInitScript(() => {
    window.__shared = [];
    window.__abort = false;
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', {
      value: async (data) => {
        window.__shared.push({ name: data.files[0].name, type: data.files[0].type, size: data.files[0].size });
        if (window.__abort) throw new DOMException('abgebrochen', 'AbortError');
      },
      configurable: true,
    });
  });
  const pad = await ipad.newPage();
  const padProblems = [];
  let padDownloads = 0;
  pad.on('console', (message) => {
    if (message.type() === 'error') padProblems.push(`Konsolenfehler: ${message.text()}`);
  });
  pad.on('pageerror', (error) => padProblems.push(`Seitenfehler: ${error.message}`));
  pad.on('download', () => (padDownloads += 1));
  await pad.goto(GAME_URL, { waitUntil: 'load' });
  await pad.waitForSelector('html[data-scene="boot"]', { state: 'attached', timeout: 20_000 });
  await pad.waitForTimeout(500);
  if (profile.context.hasTouch) await pad.touchscreen.tap(size.width / 2, size.height * 0.54);
  else await pad.mouse.click(size.width / 2, size.height * 0.54);
  await pad.waitForSelector('html[data-scene="island"]', { state: 'attached', timeout: 40_000 });
  const padInput = profile.context.hasTouch ? (p) => pad.touchscreen.tap(p.x, p.y) : (p) => pad.mouse.click(p.x, p.y);
  const padTap = async (spot) => {
    const v = await waitForVillage(pad, (state) => spot in state.ui, `den Knopf „${spot}“ auf dem iPad`, 30_000);
    await padInput(v.ui[spot]);
  };
  await padTap('menu');
  await waitForVillage(pad, (v) => v.menu === 'menu', 'das Menü auf dem iPad');
  await padTap('menu-save');
  await waitForVillage(pad, (v) => v.menu === 'menu:menu.fileSaved', 'der Satz nach dem Teilen');
  let shared = await pad.evaluate(() => window.__shared);
  check(shared.length === 1 && /^[a-z0-9-]+-\d{4}-\d{2}-\d{2}\.json$/.test(shared[0].name) && shared[0].type === 'application/json' && shared[0].size > 1000, `iPad: geteilt wurde ${JSON.stringify(shared)}`);
  check(padDownloads === 0, 'iPad: die Datei wurde zusätzlich heruntergeladen');
  await padTap('menu-close');
  await waitForVillage(pad, (v) => v.menu === 'closed', 'das geschlossene Menü auf dem iPad');
  await padTap('menu');
  await waitForVillage(pad, (v) => v.menu === 'menu', 'das Menü auf dem iPad (zweites Mal)');
  await pad.evaluate(() => (window.__abort = true));
  await padTap('menu-save');
  await sleep(1500);
  shared = await pad.evaluate(() => window.__shared);
  const afterAbort = await readVillage(pad);
  check(shared.length === 2 && afterAbort.menu === 'menu' && padDownloads === 0, `iPad: nach dem Abbrechen des Teilen-Blatts: Menü „${afterAbort.menu}“, ${shared.length} Mal geteilt, ${padDownloads} Downloads (erwartet: Menü ohne Satz, kein Download)`);
  await ipad.close();
  for (const entry of padProblems) problems.push(entry);
}

/** Web-App (M5): Manifest, Symbole, Service Worker, offline spielbar. */
async function testPwa({ context, page, check, shot, size, profile, waitForScene, problems }) {
  console.log(`  [${profile.name}] Web-App: Manifest, Service Worker, offline`);
  await page.goto(GAME_URL, { waitUntil: 'load' });
  await waitForScene('boot');
  const info = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const href = link?.href ?? '';
    const response = await fetch(href);
    const manifest = await response.json();
    const base = new URL(href);
    const icons = [];
    for (const icon of manifest.icons ?? []) {
      const url = new URL(icon.src, base).href;
      const image = new Image();
      await new Promise((resolve) => {
        image.onload = resolve;
        image.onerror = resolve;
        image.src = url;
      });
      icons.push({ src: icon.src, sizes: icon.sizes, purpose: icon.purpose, width: image.naturalWidth, height: image.naturalHeight });
    }
    const apple = document.querySelector('link[rel="apple-touch-icon"]');
    const appleImage = new Image();
    if (apple) {
      await new Promise((resolve) => {
        appleImage.onload = resolve;
        appleImage.onerror = resolve;
        appleImage.src = apple.href;
      });
    }
    return {
      href,
      ok: response.ok,
      manifest,
      start: new URL(manifest.start_url, base).href,
      scope: new URL(manifest.scope, base).href,
      icons,
      appleWidth: appleImage.naturalWidth,
      appleCapable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content,
      title: document.title,
    };
  });
  check(info.href === `${URL}manifest.webmanifest` && info.ok, `Manifest: Adresse ${info.href}`);
  check(info.manifest.name === info.title && info.manifest.short_name === info.title, `Manifest: Name „${info.manifest.name}“ ist nicht der Titel „${info.title}“`);
  check(info.manifest.display === 'standalone', `Manifest: display ${info.manifest.display}`);
  check(info.start === URL && info.scope === URL, `Manifest: start_url ${info.start}, scope ${info.scope} – erwartet ${URL}`);
  check(info.manifest.lang === 'de' && typeof info.manifest.description === 'string' && info.manifest.description !== '', 'Manifest: Sprache oder Beschreibung fehlt');
  const sizes = info.icons.map((icon) => icon.sizes);
  check(sizes.includes('192x192') && sizes.includes('512x512') && info.icons.some((icon) => icon.purpose === 'maskable'), `Manifest: Symbole ${JSON.stringify(sizes)}`);
  for (const icon of info.icons) check(`${icon.width}x${icon.height}` === icon.sizes, `Symbol ${icon.src}: ${icon.width}×${icon.height} statt ${icon.sizes}`);
  check(info.appleWidth === 180 && info.appleCapable === 'yes', `iPad: Symbol ${info.appleWidth} px, Web-App-Tag ${info.appleCapable}`);

  // Service Worker: aktiv, mit Cache, nach dem Neuladen steuert er die Seite.
  const worker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const names = await caches.keys();
    const urls = names.length > 0 ? (await (await caches.open(names[0])).keys()).map((request) => new URL(request.url).pathname) : [];
    return { state: registration.active?.state, scope: registration.scope, script: registration.active?.scriptURL, names, urls };
  });
  check(worker.state === 'activated' && worker.scope === URL && worker.script === `${URL}sw.js`, `Service Worker: ${JSON.stringify({ state: worker.state, scope: worker.scope, script: worker.script })}`);
  check(worker.names.length === 1 && /^village:\/Schlumpfwelt\/:[0-9a-f]{12}$/.test(worker.names[0]), `Cache: ${JSON.stringify(worker.names)}`);
  check(['/Schlumpfwelt/', '/Schlumpfwelt/index.html', '/Schlumpfwelt/manifest.webmanifest', '/Schlumpfwelt/icons/icon-192.png'].every((url) => worker.urls.includes(url)) && worker.urls.some((url) => /\/assets\/index-.*\.js$/.test(url)), `Cache enthält nicht alle Dateien: ${worker.urls.join(', ')}`);
  await page.reload({ waitUntil: 'load' });
  await waitForScene('boot');
  const controlled = await page.evaluate(() => navigator.serviceWorker.controller !== null);
  check(controlled, 'Nach dem Neuladen steuert der Service Worker die Seite nicht');

  // Offline: das Spiel startet aus dem Cache.
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'load' });
    await waitForScene('boot');
    await page.waitForTimeout(500);
    if (profile.context.hasTouch) await page.touchscreen.tap(size.width / 2, size.height * 0.54);
    else await page.mouse.click(size.width / 2, size.height * 0.54);
    await waitForScene('island');
    await waitForCameraRest(page);
    await page.waitForTimeout(2500);
    const offline = await readVillage(page);
    check(offline.buildings.length > 0 && 'tool-shop' in offline.ui, 'Offline: die Insel ist nicht da');
    // Beweis, dass das Netz wirklich aus ist (`navigator.onLine` sagt mit einer CDP-Sitzung nichts): eine Datei, die nicht im Cache liegt (der
    // Service Worker lädt sich selbst nie aus dem Cache), lässt sich nicht holen. Der erwartete Konsolenfehler dazu zählt nicht als Problem.
    const problemsBefore = problems.length;
    const reachable = await page.evaluate((url) => fetch(url, { cache: 'no-store' }).then(() => true, () => false), `${URL}sw.js`);
    await sleep(400);
    problems.splice(problemsBefore);
    check(reachable === false, 'Offline-Test: das Netz ist nicht wirklich aus (sw.js ist erreichbar)');
    await shot(`${profile.name}-offline`);
  } finally {
    await context.setOffline(false);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// M6 – Bewohner
// ---------------------------------------------------------------------------------------------------------------------

/** Was ein Bewohner gerade tut (`activityOf` in `src/sim/residents.ts`). */
const ACTIVITIES = ['boat', 'toWork', 'work', 'carry', 'toHome', 'rest', 'stroll', 'visit', 'wait'];
/** Im Stehen (nicht unterwegs): so ein Bewohner lässt sich sicher antippen. */
const STANDING = ['work', 'rest', 'visit', 'wait'];
const NO_OFFSET = { dx: 0, dy: 0 };
/** Von der Körpermitte bis oben an die Mütze (Welt-px, `RESIDENT_HIT_TOP − RESIDENT_BODY_Y` in `src/ui/residentHit.ts`). */
const HAT_ABOVE_BODY = 16;
/** Von der Körpermitte bis unten an den Bauch (Welt-px, `RESIDENT_BODY_Y − RESIDENT_HIT_BOTTOM`). */
const BELLY_BELOW_BODY = 14;
/** So weit reicht ein Bewohner auf einem Gebäude, das auf den Tipp antwortet (Welt-px, `RESIDENT_REACH_ON_BUILDING`). */
const REACH_ON_BUILDING = 24;
/** So weit neben dem Körper (Welt-px, mindestens) gehört ein Tipp auf einem Produktionsgebäude dem Gebäude. */
const BEYOND_HAT = 30;
/** Abstand (Welt-px) eines Tipps `offset` CSS-px neben der Körpermitte zum Körper (der Strecke vom Bauch bis zur Mütze). */
const bodyDistance = (offset, zoom) => {
  const ox = offset.dx / zoom;
  const oy = offset.dy / zoom;
  return Math.hypot(ox, Math.max(0, -HAT_ABOVE_BODY - oy, oy - BELLY_BELOW_BODY));
};
/** Tipps so weit neben die Körpermitte eines Bewohners (CSS-px) müssen ihn noch treffen (Regel 8: 48 px, also 24 px Radius). */
const TAP_OFFSETS = [
  { dx: 20, dy: 0 },
  { dx: 22, dy: 0 },
  { dx: -22, dy: 0 },
  { dx: 0, dy: 22 },
  { dx: 0, dy: -22 },
];
/**
 * Die Grenze für die Bildzeit mit mindestens 30 Bewohnern bei 4-facher CPU-Drosselung: das JavaScript-Budget des
 * Hauptthreads pro Bild (ms), nicht die Bildrate – Headless-Chromium zeichnet ohnehin nur etwa 8 Bilder pro Sekunde.
 * Bewertet wird der Median aus `windows` Messfenstern zu je 300 Bildern.
 */
const PERF_LIMIT = { residents: 30, rate: 4, mean: 16, p95: 25, windows: 2 };

/** Bewohner und Boote aus `<html data-residents|data-boats|data-resident-card>` (siehe `publishResidents` in IslandScene.ts). */
async function readResidents(page) {
  return page.evaluate(() => {
    const d = document.documentElement.dataset;
    return { residents: JSON.parse(d.residents ?? '[]'), boats: JSON.parse(d.boats ?? '[]'), card: d.residentCard ?? '' };
  });
}

/** Wartet, bis `predicate({ residents, boats, card })` stimmt; wirft mit dem Stand, wenn nicht. */
async function waitForResidents(page, predicate, what, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let state;
  while (Date.now() < deadline) {
    state = await readResidents(page);
    const found = predicate(state);
    if (found) return { ...state, found };
    await sleep(120);
  }
  throw new Error(`Zeitüberschreitung beim Warten auf ${what} (Stand: ${state?.residents.length} Bewohner, ${state?.boats.length} Boote, Karte „${state?.card}“)`);
}

/** Die Bildzeit aus `<html data-perf>` (Mittel, p95 und Maximum der letzten 300 Bilder in ms, `total` = Bilder seit dem Start). */
async function readPerf(page) {
  return JSON.parse(await page.evaluate(() => document.documentElement.dataset.perf ?? '{}'));
}

/** Löscht alle Spielstände der Seite (von außen, wie `setRecordFromOutside`): danach beginnt `?seed=1` ein neues Dorf. */
async function clearRecords(page) {
  await page.goto(`${URL}manifest.webmanifest`, { waitUntil: 'load' });
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open('village-game/Schlumpfwelt/', 1);
        open.onupgradeneeded = () => open.result.createObjectStore('saves');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction('saves', 'readwrite');
          transaction.objectStore('saves').clear();
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
  );
}

/**
 * Ein volles Dorf aus einem Spielstand: große Häuser mit einem Weg davor und Produktionsgebäude nahe der Mitte (mit
 * freiem Rand), dazu Bewohner ohne Haus und Arbeit, bis es `residents` sind – mit Namen, die noch niemand trägt. Haus
 * und Arbeit verteilt das Spiel beim Laden (`settleResidents`).
 */
function crowdedRecord(record, names, { residents: count, houses: maxHouses, producers: maxProducers }) {
  const { width, height, terrain } = record.world;
  const taken = new Set(record.paths);
  for (const b of record.buildings) {
    const size = footprintOf(b.type);
    for (let dy = 0; dy < size; dy += 1) for (let dx = 0; dx < size; dx += 1) taken.add((b.y + dy) * width + b.x + dx);
  }
  const free = (x, y) => x >= 1 && y >= 1 && x < width - 1 && y < height - 1 && terrain[y * width + x] === 'g' && !taken.has(y * width + x);
  const spots = [];
  for (let y = 2; y < height - 2; y += 1) for (let x = 2; x < width - 2; x += 1) spots.push({ x, y, d: Math.hypot(x - width / 2, y - height / 2) });
  spots.sort((a, b) => a.d - b.d);
  const buildings = [...record.buildings];
  const paths = [...record.paths];
  let nextBuildingId = record.nextBuildingId;
  const place = (type, limit) => {
    const size = footprintOf(type);
    let placed = 0;
    for (const { x, y } of spots) {
      if (placed >= limit) break;
      let ok = true;
      // Der Grundriss, eine Wegreihe darunter und eine freie Kachel um alles.
      for (let dy = -1; dy <= size + 1 && ok; dy += 1) for (let dx = -1; dx <= size && ok; dx += 1) ok = free(x + dx, y + dy);
      if (!ok) continue;
      buildings.push({ id: nextBuildingId, type, x, y });
      nextBuildingId += 1;
      for (let dy = 0; dy < size; dy += 1) for (let dx = 0; dx < size; dx += 1) taken.add((y + dy) * width + x + dx);
      for (let dx = 0; dx < size; dx += 1) {
        taken.add((y + size) * width + x + dx);
        paths.push((y + size) * width + x + dx);
      }
      placed += 1;
    }
    return placed;
  };
  const houses = place('house-big', maxHouses);
  const producers = place('berry-garden', Math.ceil(maxProducers / 2)) + place('bakery', Math.floor(maxProducers / 2));
  const used = new Set(record.residents.map((r) => r.name));
  const unused = names.filter((n) => !used.has(n));
  let nextResidentId = record.nextResidentId;
  const extra = [];
  for (let i = record.residents.length; i < count; i += 1) {
    const name = unused[extra.length] ?? `${names[i % names.length]} ${i}`;
    extra.push({ id: nextResidentId, name, hat: nextResidentId % 8, home: null, job: null, at: record.paths[i % record.paths.length], route: [], step: 0, doing: 'wait', goal: 'visit', place: null, timer: 1 + (i % 20), carrying: null, seen: 0, trips: 0 });
    nextResidentId += 1;
  }
  return { record: { ...record, buildings, paths, nextBuildingId, residents: [...record.residents, ...extra], nextResidentId }, houses, producers };
}

/** Was von einem Bewohner beim Speichern bleiben muss (Arbeit und Zuhause als Typ des Gebäudes). */
const residentIdentity = (r) => [r.id, r.name, r.hat, r.home, r.job];

/**
 * Die Bildzeit bei `PERF_LIMIT.rate`-facher CPU-Drosselung (CDP `Emulation.setCPUThrottlingRate`) mit dem Dorf, das
 * gerade läuft: zwei Messfenster zu je 300 Bildern, bewertet wird der Median; Mittel und p95 müssen unter der Grenze
 * bleiben. Gibt die Messung zurück.
 */
async function measureFrameTime({ context, page, check, name }) {
  const session = await context.newCDPSession(page);
  const free = await readPerf(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: PERF_LIMIT.rate });
  // Zwei Messfenster zu je 300 Bildern hintereinander (das erste beginnt 30 Bilder nach dem Einschalten der Drosselung);
  // bewertet wird der Median (bei zwei Messungen ihr Mittel) – ein einzelnes Fenster streut in p95 um mehrere ms.
  const windows = [];
  const started = Date.now();
  try {
    let from = (await readPerf(page)).total ?? 0;
    for (let i = 0; i < PERF_LIMIT.windows; i += 1) {
      const need = from + (i === 0 ? 330 : 300);
      let perf = await readPerf(page);
      while ((perf.total ?? 0) < need && Date.now() - started < 600_000) {
        await sleep(1000);
        perf = await readPerf(page);
      }
      windows.push(perf);
      from = perf.total ?? 0;
    }
  } finally {
    await session.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await session.detach();
  }
  const median = (key) => {
    const values = windows.map((w) => w[key]).sort((a, b) => a - b);
    const half = Math.floor(values.length / 2);
    return values.length % 2 === 1 ? values[half] : Math.round(((values[half - 1] + values[half]) / 2) * 100) / 100;
  };
  const perf = { mean: median('mean'), p95: median('p95') };
  console.log(`  [${name}] Bildzeit ohne Drosselung: Mittel ${free.mean} ms, p95 ${free.p95} ms (${free.frames} Bilder)`);
  windows.forEach((w, i) =>
    console.log(
      `  [${name}] Bildzeit bei ${PERF_LIMIT.rate}× Drosselung, Fenster ${i + 1}, ${w.residents} Bewohner: Mittel ${w.mean} ms, p95 ${w.p95} ms, max ${w.max} ms (Simulation ${w.simMean}/${w.simP95}, Zeichnen ${w.renderMean}/${w.renderP95}; ${w.frames} Bilder)`,
    ),
  );
  console.log(`  [${name}] Bildzeit, Median aus ${windows.length} Fenstern: Mittel ${perf.mean} ms, p95 ${perf.p95} ms in ${((Date.now() - started) / 1000).toFixed(0)} s; Grenze Mittel ${PERF_LIMIT.mean}, p95 ${PERF_LIMIT.p95}`);
  check(windows.length === PERF_LIMIT.windows && windows.every((w) => w.frames >= 300 && w.residents >= PERF_LIMIT.residents), `Bildzeit: Fenster ${JSON.stringify(windows.map((w) => [w.frames, w.residents]))}, erwartet ${PERF_LIMIT.windows} × 300 Bilder mit mindestens ${PERF_LIMIT.residents} Bewohnern`);
  check(perf.mean <= PERF_LIMIT.mean && perf.p95 <= PERF_LIMIT.p95, `Bildzeit bei ${PERF_LIMIT.rate}× Drosselung (Median aus ${windows.length} Fenstern): Mittel ${perf.mean} ms, p95 ${perf.p95} ms – Grenze ${PERF_LIMIT.mean} / ${PERF_LIMIT.p95} ms`);
  return { perf, windows, free };
}

/**
 * Helfer für die Bewohner (M6, M7): die Zoom-Knöpfe, einen stehenden Bewohner im Bild finden und antippen (seine Karte
 * geht auf), die Karte prüfen und wieder schließen.
 */
function residentHelpers({ page, check, size, input, name }) {
  const { cameraAtRest, tapUi } = buildHelpers({ page, check, size, input, name });
  const zoom = async (button, times) => {
    for (let i = 0; i < times; i += 1) {
      await tapUi(button);
      await sleep(350);
    }
    await cameraAtRest();
    await sleep(300); // ein Tick, damit `data-residents` die neue Kamera kennt
  };
  /**
   * Ein stehender Bewohner (noch mindestens 3 s), dessen Körpermitte um `offset` (CSS-px) verschoben an einer gut
   * antippbaren Stelle des Bildschirms liegt; jeder andere Bewohner steht mindestens 30 px weiter vom Tipp weg. Die
   * Bewohner in `skip` nicht, und nur einer, für den `want(r)` stimmt.
   */
  const standingOnScreen = (state, ui, view, offset = NO_OFFSET, skip = new Set(), want = () => true) => {
    const top = (ui.stock ? ui.stock.y + ui.stock.h / 2 : 0) + 40;
    const bottom = (ui['tool-path'] ? ui['tool-path'].y - 52 : view.height) - 40;
    const reach = Math.hypot(offset.dx, offset.dy) + 30;
    return state.residents.find((r) => {
      if (!STANDING.includes(r.activity) || r.timer <= 30 || r.sx === undefined || skip.has(r.id) || !want(r)) return false;
      const x = r.sx + offset.dx;
      const y = r.sy + offset.dy;
      if (!(x > 40 && x < view.width - 90 && y > top && y < bottom)) return false;
      return state.residents.every((o) => o.id === r.id || o.sx === undefined || Math.hypot(o.sx - x, o.sy - y) > reach);
    });
  };
  /**
   * Tippt einen stehenden Bewohner an (um `offset` CSS-px neben seine Körpermitte) und wartet auf seine Karte. Ein
   * Arbeiter geht los, sobald sein Gebäude liefert (Tragen), auch mitten in seiner Arbeitszeit: Ist der Bewohner beim
   * Tipp schon losgegangen, gilt der Versuch nicht und ein neuer folgt; stand er still, ist ein Fehlschlag ein Fehler.
   * Weit herausgezoomt behält ein Produktionsgebäude Tipps, die mehr als 24 Welt-px vom Körper entfernt sind
   * (Korrekturrunde 2): Geht dann seine Infokarte auf, folgt der Regel gemäß ein anderer Bewohner.
   */
  const tapResident = async (view, what, offset = NO_OFFSET, want = () => true) => {
    const ui = (await readVillage(page)).ui;
    const skip = new Set();
    for (let attempt = 1; ; attempt += 1) {
      const { found: target } = await waitForResidents(page, (state) => standingOnScreen(state, ui, view, offset, skip, want), `einen stehenden Bewohner im Bild (${what})`, 60_000);
      const point = { x: target.sx + offset.dx, y: target.sy + offset.dy };
      await input.tap(point);
      const hit = await waitForResidents(page, (state) => state.card === String(target.id), `die Karte von ${target.name} nach dem Tipp ${offset.dx}/${offset.dy} px neben die Körpermitte (${what})`, attempt < 3 ? 2500 : 5000).catch((error) => error);
      if (hit instanceof Error) {
        const after = await readResidents(page);
        const now = after.residents.find((r) => r.id === target.id);
        const walkedOff = !now || !STANDING.includes(now.activity) || Math.hypot(now.sx - target.sx, now.sy - target.sy) > 3;
        if (attempt < 3 && walkedOff && after.card === '') {
          console.log(`  [${name}] (${what}: ${target.name} ging gerade los – ${now?.activity}, noch einmal)`);
          if ((await readVillage(page)).card !== '') {
            // Der Tipp traf das Gebäude, an dem er eben noch stand.
            await tapUi('card-close');
            await waitForVillage(page, (v) => v.card === '', `die geschlossene Infokarte (${what})`, 4000);
          }
          await sleep(400);
          continue;
        }
        // Beim Aussuchen stand jeder andere mindestens 30 px weiter vom Tipp weg als der Bewohner: Geht dessen Karte
        // auf, ist er seitdem herangelaufen (etwa der Gärtner, der Beeren zum Markt bringt) – der nächste gewinnt.
        const other = after.card !== '' && after.card !== String(target.id) ? after.residents.find((r) => String(r.id) === after.card) : undefined;
        if (attempt < 3 && other) {
          console.log(`  [${name}] (${what}: ${other.name} lief gerade an ${target.name} vorbei – ${other.activity}, noch einmal)`);
          await closeCard(`${what}, ${other.name}`);
          await sleep(400);
          continue;
        }
        const zoomNow = (await readCamera(page)).zoom;
        const kept = after.card === '' ? (await readVillage(page)).card : '';
        if (attempt < 6 && kept !== '' && bodyDistance(offset, zoomNow) > REACH_ON_BUILDING) {
          const building = (await readVillage(page)).buildings.find((b) => String(b.id) === kept);
          console.log(`  [${name}] (${what}: bei Zoom ${zoomNow.toFixed(2)} behielt ${building?.type ?? kept} den Tipp ${Math.round(bodyDistance(offset, zoomNow))} Welt-px neben ${target.name} – ein anderer)`);
          await tapUi('card-close');
          await waitForVillage(page, (v) => v.card === '', `die geschlossene Infokarte (${what})`, 4000);
          skip.add(target.id);
          await sleep(400);
          continue;
        }
        throw new Error(`${hit.message}; ${target.name} jetzt ${JSON.stringify(now)}, vorher ${JSON.stringify(target)}`);
      }
      const village = await waitForVillage(page, (v) => 'card' in v.ui && 'card-close' in v.ui, `Karte und ✕ in data-ui (${what})`, 4000);
      return { target, village, point };
    }
  };
  /** Die Karte liegt im Bild, ihr ✕ ist mindestens 48 px groß, und sie überdeckt weder Lagerleiste noch Werkzeugleiste. */
  const checkCard = (village, view, what) => {
    const { card } = village.ui;
    const close = village.ui['card-close'];
    check(card.x - card.w / 2 >= -0.5 && card.x + card.w / 2 <= view.width + 0.5 && card.y - card.h / 2 >= -0.5 && card.y + card.h / 2 <= view.height + 0.5, `${what}: die Karte ragt über den Bildrand (${JSON.stringify(card)})`);
    check(close.w >= 48 && close.h >= 48 && close.x - close.w / 2 >= 0 && close.x + close.w / 2 <= view.width && close.y - close.h / 2 >= 0 && close.y + close.h / 2 <= view.height, `${what}: ✕ der Karte zu klein oder außerhalb (${JSON.stringify(close)})`);
    check(card.font >= 12, `${what}: die Zeilen der Karte sind ${card.font} px groß, mindestens 12`);
    for (const [spot, p] of Object.entries(village.ui)) {
      if (spot === 'stock' || spot.startsWith('tool-')) {
        const w = p.w ?? 48;
        const h = p.h ?? 48;
        check(Math.abs(card.x - p.x) >= (card.w + w) / 2 - 0.5 || Math.abs(card.y - p.y) >= (card.h + h) / 2 - 0.5, `${what}: die Karte überdeckt „${spot}“`);
      }
    }
  };
  const closeCard = async (what) => {
    await tapUi('card-close');
    await waitForResidents(page, (state) => state.card === '', `die geschlossene Karte (${what})`, 4000);
  };
  return { zoom, standingOnScreen, tapResident, checkCard, closeCard };
}

/**
 * Bewohner (M6): das Startdorf mit seinen zwei Bewohnern, Antippen zeigt die Karte (auch 20 und 22 px neben der
 * Körpermitte), Tragen ist sichtbar, Einladen ist ohne freies Haus gesperrt, mit Haus und Talern kostet es genau 30
 * Taler und ein neuer Bewohner kommt mit dem Boot – mindestens 5 s im Bild, die Kamera fährt hin – und geht nach
 * Hause; ein volles Dorf (40 Bewohner) bleibt beim Speichern und Neuladen gleich, die Bildzeit bei 4-facher
 * CPU-Drosselung bleibt unter der Grenze (Median aus zwei Fenstern), und die Karte passt auf kleine Handys (320×568
 * mit Tipps daneben, 568×320 kompakt).
 */
async function testResidents({ context, page, check, shot, size, input, name, profile, waitForScene }) {
  const { step, cameraAtRest, tapUi, tapTile, selectTool, openShop, openTab, pickItem, exitTool, confirm } = buildHelpers({ page, check, size, input, name });
  const { zoom, tapResident, checkCard, closeCard } = residentHelpers({ page, check, size, input, name });
  /** Liegt der Bildschirmpunkt (CSS-px) auf dem Grundriss eines Gebäudes? Dann gewinnt dort trotzdem der Bewohner. */
  const onBuilding = (village, cam, view, point) => {
    const tx = Math.floor((cam.x + (point.x - view.width / 2) / cam.zoom) / TILE);
    const ty = Math.floor((cam.y + (point.y - view.height / 2) / cam.zoom) / TILE);
    return village.buildings.find((b) => tx >= b.x && tx < b.x + footprintOf(b.type) && ty >= b.y && ty < b.y + footprintOf(b.type))?.type;
  };
  /**
   * Regel 8: Tipps 20 und 22 CSS-px neben die Körpermitte treffen den Bewohner noch (ein Kreis von 24 CSS-px Radius,
   * ab Zoom 1 auch auf jedem Gebäude, weiter draußen auf einem Produktionsgebäude höchstens 24 Welt-px – siehe
   * `tapResident`); jede Karte hat Zeilen von mindestens 12 px.
   */
  const tapBesideResidents = async (view, what) => {
    const buildingsHit = [];
    for (const offset of TAP_OFFSETS) {
      const label = `${what}, ${offset.dx}/${offset.dy} px neben der Mitte`;
      const cam = await readCamera(page);
      const { target, village, point } = await tapResident(view, label, offset);
      check(village.ui.card.font >= 12, `${label}: Zeilen der Karte ${village.ui.card.font} px, mindestens 12`);
      const building = onBuilding(village, cam, view, point);
      if (building) buildingsHit.push(`${offset.dx}/${offset.dy}: ${target.name} auf ${building}`);
      await closeCard(label);
      await sleep(400); // gleich nach dem ✕ ignoriert die Welt Tipps (Doppeltipp-Schutz)
    }
    console.log(`  [${name}] ${what}: ${TAP_OFFSETS.length} Tipps neben die Körpermitte getroffen${buildingsHit.length > 0 ? `, davon auf einem Gebäude: ${buildingsHit.join(', ')}` : ''}`);
  };
  /**
   * Korrekturrunde 2: Weit herausgezoomt (Zoom ≤ 0,5) behält der Markt seine Tipps, auch wenn sein Händler davor
   * steht – ein Tipp auf den Markt 30–44 Welt-px neben dem Körper des Händlers (über der Mütze, links, rechts oder unter
   * dem Bauch, je nachdem, wo der Markt liegt) öffnet die Infokarte des Markts; mit 24 CSS-px Radius auf jedem
   * Gebäude (Korrekturrunde 1) hätte er den Händler getroffen. Danach zoomt die Kamera wieder so nah wie vorher.
   */
  const farTapOnMarket = async (view, what) => {
    let outs = 0;
    while ((await readCamera(page)).zoom > 0.5 + 1e-6 && outs < 6) {
      await zoom('zoom-out', 1);
      outs += 1;
    }
    const cam = await readCamera(page);
    const market = (await readVillage(page)).buildings.find((b) => b.type === 'market');
    check(market !== undefined && 24 / cam.zoom > BEYOND_HAT && BEYOND_HAT > REACH_ON_BUILDING, `${what}: Markt ${JSON.stringify(market)}, Zoom ${cam.zoom}`);
    const size = market ? footprintOf(market.type) : 0;
    const onMarket = (w) => market && Math.floor(w.x / TILE) >= market.x && Math.floor(w.x / TILE) < market.x + size && Math.floor(w.y / TILE) >= market.y && Math.floor(w.y / TILE) < market.y + size;
    const toScreen = (w) => ({ x: (w.x - cam.x) * cam.zoom + view.width / 2, y: (w.y - cam.y) * cam.zoom + view.height / 2 });
    /**
     * Punkte 30–44 Welt-px neben dem Körper (Füße bei `r.x`/`r.y`, Körper von 42 bis 12 px darüber), die auf dem Markt
     * liegen – mehr als die 24 Welt-px auf einem Gebäude, weniger als die 24 CSS-px von vorher (48 Welt-px bei Zoom 0,5).
     */
    const spotFor = (r) =>
      [BEYOND_HAT, BEYOND_HAT + 4, BEYOND_HAT + 8, BEYOND_HAT + 14]
        .filter((d) => d < 24 / cam.zoom)
        .flatMap((d) => [
          { d, side: 'über der Mütze', x: r.x, y: r.y - 42 - d },
          { d, side: 'links', x: r.x - d, y: r.y - 27 },
          { d, side: 'rechts', x: r.x + d, y: r.y - 27 },
          { d, side: 'unter dem Bauch', x: r.x, y: r.y - 12 + d },
        ])
        .filter(onMarket)
        .map((w) => ({ ...w, screen: toScreen(w) }))
        .find(({ screen }) => screen.x > 40 && screen.x < view.width - 90 && screen.y > 100 && screen.y < view.height - 140);
    let last;
    for (let attempt = 1; market; attempt += 1) {
      const { found } = await waitForResidents(
        page,
        (s) => {
          last = s.residents.find((r) => r.job === 'market');
          const r = last;
          if (!r || r.activity !== 'work' || r.timer <= 30 || r.x === undefined) return undefined;
          const spot = spotFor(r);
          if (!spot || !s.residents.every((o) => o.id === r.id || o.sx === undefined || Math.hypot(o.sx - spot.screen.x, o.sy - spot.screen.y) > 60)) return undefined;
          return { trader: r, spot };
        },
        `den Händler bei der Arbeit mit dem Markt neben sich (${what}; Markt ${JSON.stringify(market)}, Zoom ${cam.zoom})`,
        60_000,
      ).catch((error) => {
        throw new Error(`${error.message}; Händler zuletzt ${JSON.stringify(last)}`);
      });
      const { trader, spot } = found;
      await input.tap(spot.screen);
      const opened = await waitForVillage(page, (v) => v.card !== '', `eine Infokarte nach dem Tipp ${spot.side} ${trader.name} (${what})`, attempt < 3 ? 2500 : 5000).catch((error) => error);
      const after = await readResidents(page);
      const now = after.residents.find((r) => r.id === trader.id);
      const stayed = now && now.activity === 'work' && Math.hypot(now.sx - trader.sx, now.sy - trader.sy) <= 3;
      // Ein anderer, der gerade vorbeiläuft (der Gärtner bringt Beeren zum Markt), darf den Tipp nehmen: noch einmal.
      const passer = after.card !== '' && after.card !== String(trader.id) ? after.residents.find((r) => String(r.id) === after.card) : undefined;
      if (attempt < 3 && (!stayed || passer)) {
        console.log(`  [${name}] (${what}: ${passer ? `${passer.name} lief gerade vorbei` : `${trader.name} ging gerade los – ${now?.activity}`}, noch einmal)`);
        if (after.card !== '') {
          await closeCard(`${what}, noch einmal`);
        } else if (!(opened instanceof Error)) {
          await tapUi('card-close');
          await waitForVillage(page, (v) => v.card === '', `die geschlossene Infokarte (${what}, noch einmal)`, 4000);
        }
        await sleep(600);
        continue;
      }
      const ok = !(opened instanceof Error) && opened.card === String(market.id) && after.card === '';
      check(ok, `${what}: Tipp ${spot.d} Welt-px ${spot.side} ${trader.name} (Füße ${trader.x},${trader.y}, Markt ${JSON.stringify(market)}) bei Zoom ${cam.zoom}: Infokarte „${opened instanceof Error ? '' : opened.card}“ statt „${market.id}“, Bewohner-Karte „${after.card}“`);
      if (ok) console.log(`  [${name}] ${what}: bei Zoom ${cam.zoom.toFixed(2)} öffnet ein Tipp auf den Markt ${spot.d} Welt-px ${spot.side} ${trader.name} die Infokarte des Markts, nicht seine`);
      if (!(opened instanceof Error)) {
        await tapUi('card-close');
        await waitForVillage(page, (v) => v.card === '', `die geschlossene Infokarte (${what})`, 4000);
      }
      if (after.card !== '') await closeCard(`${what}, Händler`);
      break;
    }
    await zoom('zoom-in', outs);
  };

  // --- Das Startdorf: zwei Bewohner (Gärtner und Händler) im roten Haus ---
  step('Bewohner: das Startdorf');
  await enterIsland(page, profile, waitForScene);
  let state = await waitForResidents(page, (s) => s.residents.length === 2 && s.residents.every((r) => r.x !== undefined), 'die zwei Bewohner des Startdorfs');
  const starters = state.residents;
  check(starters.every((r) => typeof r.name === 'string' && r.name.length > 0) && new Set(starters.map((r) => r.name)).size === 2, `Startdorf: Namen ${JSON.stringify(starters.map((r) => r.name))}`);
  check(starters.every((r) => Number.isInteger(r.hat) && r.hat >= 0 && r.hat < 8), `Startdorf: Mützen ${JSON.stringify(starters.map((r) => r.hat))}`);
  check(same(starters.map((r) => r.job).sort(), ['berry-garden', 'market']) && starters.every((r) => r.home === 'house-red'), `Startdorf: Arbeit ${JSON.stringify(starters.map((r) => r.job))}, Zuhause ${JSON.stringify(starters.map((r) => r.home))}`);
  check(starters.every((r) => ACTIVITIES.includes(r.activity)), `Startdorf: unbekannte Tätigkeit ${JSON.stringify(starters.map((r) => r.activity))}`);

  // --- Antippen zeigt die Karte (Name, Beruf, Mütze, Zuhause, Tätigkeit) ---
  step('Bewohner: antippen zeigt die Karte');
  await zoom('zoom-in', 2);
  let { target, village } = await tapResident(size, 'Tablet/Desktop');
  check(village.tool === 'view' && village.card === '' && village.shop === 'closed', `Karte: Werkzeug ${village.tool}, Gebäudekarte „${village.card}“, Shop ${village.shop}`);
  checkCard(village, size, 'Bewohner-Karte');
  await sleep(400);
  await shot(`${name}-bewohner-karte`);
  await closeCard('✕');
  console.log(`  [${name}] Karte von ${target.name} (${target.job}, Mütze ${target.hat}, Zeilen ${village.ui.card.font} px) geöffnet und geschlossen`);
  await sleep(400);
  await tapBesideResidents(size, profile.name === 'tablet' ? 'Tablet' : 'Desktop');
  await farTapOnMarket(size, profile.name === 'tablet' ? 'Tablet weit draußen' : 'Desktop weit draußen');

  // --- Tragen: der Gärtner bringt Beeren zum Markt, über dem Kopf sichtbar ---
  step('Bewohner: Tragen ist sichtbar');
  const carrierFound = await page
    .waitForFunction(
      ({ width, height }) => {
        const residents = JSON.parse(document.documentElement.dataset.residents ?? '[]');
        const carrier = residents.find((r) => r.carrying !== '' && r.icon === 1 && r.sx > 0 && r.sx < width && r.sy > 0 && r.sy < height);
        // Das Bild anhalten, solange das Tragen zu sehen ist (für den Screenshot).
        if (carrier) window.__holdFrames = true;
        return carrier ? JSON.stringify(carrier) : false;
      },
      size,
      { timeout: 90_000, polling: 60 },
    )
    .then((handle) => handle.jsonValue())
    .catch(() => undefined);
  check(carrierFound !== undefined, 'Tragen: in 90 s trug niemand sichtbar etwas zum Markt');
  if (carrierFound) {
    const carrier = JSON.parse(carrierFound);
    check(carrier.job === 'berry-garden' && carrier.carrying === 'berries' && carrier.activity === 'carry', `Tragen: ${JSON.stringify(carrier)}`);
    await shot(`${name}-tragen`);
  }
  await page.evaluate(() => window.__releaseFrames());

  // --- Einladen ohne freies Haus: die Karte ist gesperrt und sagt warum ---
  step('Einladen: ohne freies Haus gesperrt');
  await zoom('zoom-out', 2);
  await openShop();
  village = await openTab('houses');
  const blocked = village.ui['item-invite'];
  check(blocked?.state === 'noRoom' && blocked.dim === true, `Einladen ohne Platz: Karte ${JSON.stringify(blocked)}, erwartet noRoom und grau`);
  await tapUi('item-invite');
  village = await waitForVillage(page, (v) => v.tip !== '', 'den Satz zur gesperrten Einladung', 4000);
  check(village.tool === 'shop' && village.shop.startsWith('houses:') && /Haus/.test(village.tip), `Einladen ohne Platz: Werkzeug ${village.tool}, Shop ${village.shop}, Satz „${village.tip}“`);
  await shot(`${name}-einladen-voll`);

  // --- Ein Haus bauen: jetzt ist Platz, aber die Taler reichen erst später ---
  step('Einladen: Haus bauen, auf Taler warten, einladen');
  await pickItem('house-red');
  let cam = await cameraAtRest();
  village = await readVillage(page);
  const houseArea = findFreeArea(village, cam, size, 2, 2, { near: { x: size.width * 0.35, y: size.height * 0.4 } });
  check(houseArea !== undefined, 'Einladen: kein Platz für das Haus');
  if (!houseArea) return;
  await tapTile({ x: houseArea.x, y: houseArea.y + 1 });
  await waitForVillage(page, (v) => v.preview === 'place:ok', 'grüne Vorschau fürs Haus');
  const buildingsBefore = village.buildings.length;
  await confirm((v) => v.buildings.length === buildingsBefore + 1, 'das zweite Haus');
  // Die Kamera bleibt, wo sie ist: nach dem Einladen fährt sie selbst zur Anlegestelle, wenn die Fahrt nicht im Bild ist.
  await exitTool();
  await pickItem('invite');
  village = await readVillage(page);
  if (village.stock.coins < 30) {
    check(village.preview === 'invite:cost' && village.ui.confirm?.enabled === false, `Einladen zu teuer: Vorschau ${village.preview}, ✓ ${JSON.stringify(village.ui.confirm)}`);
  }
  village = await waitForVillage(page, (v) => v.preview === 'invite:ok' && v.ui.confirm?.enabled === true, 'genug Taler für die Einladung', 240_000);
  await sleep(300);
  await shot(`${name}-einladen`);
  // Taler und verdiente Taler aus derselben Ablesung: was der Markt in der Zwischenzeit einbringt, zählt `earned` mit.
  const purse = await readVillage(page);
  const camAtInvite = await readCamera(page);
  village = await confirm((v) => v.tool === 'view', 'zurück auf „Anschauen“ nach dem Einladen');
  state = await waitForResidents(page, (s) => s.residents.length === 3 && s.boats.length === 1, 'den neuen Bewohner im Boot', 5000);
  const guest = state.residents.find((r) => !starters.some((s) => s.id === r.id));
  const boat = state.boats[0];
  check(guest && guest.activity === 'boat' && guest.home === 'house-red' && guest.job === '' && boat.passenger === guest.id, `Einladen: ${JSON.stringify(guest)}, Boot ${JSON.stringify(boat)}`);
  if (!guest) return;
  check(!starters.some((s) => s.name === guest.name), `Einladen: der Name „${guest.name}“ ist schon vergeben`);
  const paid = await readVillage(page);
  const charged = purse.stock.coins - paid.stock.coins + (paid.earned - purse.earned);
  check(charged === 30, `Einladen: ${purse.stock.coins} → ${paid.stock.coins} Taler, dazwischen ${paid.earned - purse.earned} verdient – abgebucht ${charged}, erwartet 30`);

  // --- Das Boot fährt an die Küste beim Dorf (die Kamera fährt hin), der Bewohner steigt aus und geht nach Hause ---
  step('Einladen: das Boot kommt an, die Kamera fährt hin, der Bewohner geht nach Hause');
  const shore = { x: boat.shore % MAP_TILES, y: Math.floor(boat.shore / MAP_TILES) };
  const rules = JSON.parse(await readFile(path.join(ROOT, 'src', 'data', 'residents.json'), 'utf8'));
  const tileSeconds = rules.walk.stepsPerTile / rules.boat.speed / 10;
  // Im Bild: zwischen Lagerleiste und Werkzeugleiste, mit Platz für die Hinweisleiste darüber (beim Anschauen unten).
  const band = { top: village.ui.stock.y + village.ui.stock.h / 2 + 10, bottom: village.ui['tool-path'].y - 40 - 80 };
  const inPicture = (p) => p.x > 20 && p.x < size.width - 20 && p.y > band.top && p.y < band.bottom;
  const shoreAtInvite = screenOfTile(camAtInvite, size, shore);
  const seen = new Set();
  let sailed = 0;
  let boatShot = false;
  const sailStart = Date.now();
  while (Date.now() - sailStart < 60_000) {
    const now = await readResidents(page);
    const seat = now.residents.find((r) => r.id === guest.id);
    const ride = now.boats.find((b) => b.passenger === guest.id);
    if (!ride || seat?.activity !== 'boat') break;
    sailed = Math.max(sailed, ride.left);
    if (seat.sx !== undefined && inPicture({ x: seat.sx, y: seat.sy })) {
      seen.add(ride.left);
      if (!boatShot && ride.left <= Math.ceil(sailed / 2)) {
        // Das Bild anhalten, solange das Boot mit dem Gast gut im Bild ist (für den Screenshot).
        await page.evaluate(() => (window.__holdFrames = true));
        await shot(`${name}-boot`);
        await page.evaluate(() => window.__releaseFrames());
        boatShot = true;
      }
    }
    await sleep(100);
  }
  const camLanded = await readCamera(page);
  const shoreLanded = screenOfTile(camLanded, size, shore);
  const glided = Math.hypot(camLanded.x - camAtInvite.x, camLanded.y - camAtInvite.y);
  console.log(
    `  [${name}] Boot: ${sailed} Kacheln Fahrt (${(sailed * tileSeconds).toFixed(1)} s), davon ${seen.size} Kacheln im Bild (${(seen.size * tileSeconds).toFixed(1)} s); Küste vorher bei ${shoreAtInvite.x.toFixed(0)},${shoreAtInvite.y.toFixed(0)}, nachher ${shoreLanded.x.toFixed(0)},${shoreLanded.y.toFixed(0)}; Kamera ${glided.toFixed(0)} Welt-px gefahren`,
  );
  check(seen.size * tileSeconds >= 5, `Einladen: das Boot war nur ${seen.size} Kacheln (${(seen.size * tileSeconds).toFixed(1)} s) im Bild, erwartet mindestens 5 s`);
  check(boatShot, 'Einladen: kein Screenshot vom Boot (nie gut im Bild)');
  check(inPicture(shoreLanded), `Einladen: die Anlegestelle liegt nach der Fahrt nicht im Bild (${shoreLanded.x.toFixed(0)}, ${shoreLanded.y.toFixed(0)})`);
  if (!inPicture(shoreAtInvite)) check(glided > TILE, `Einladen: die Anlegestelle lag nicht im Bild, aber die Kamera ist nicht hingefahren (${glided.toFixed(0)} Welt-px)`);
  const ashore = await waitForResidents(page, (s) => s.residents.find((r) => r.id === guest.id && r.activity !== 'boat'), 'den Bewohner an Land', 60_000);
  check(['toHome', 'rest'].includes(ashore.found.activity) && Math.abs(ashore.found.x / TILE - (shore.x + 0.5)) < 1.5 && Math.abs(ashore.found.y / TILE - (shore.y + 0.6)) < 1.5, `Einladen: an Land ${JSON.stringify(ashore.found)}, Küste ${JSON.stringify(shore)}`);
  // Die Meldung „Neu im Shop“ (das zweite Haus schaltet etwas frei) steht 7 s darüber, danach kommt der Satz zum Gast.
  village = await waitForVillage(page, (v) => v.hint.includes(guest.name), `den Hinweis, dass ${guest.name} mit dem Boot kommt`, 12_000).catch(() => readVillage(page));
  check(village.hint.includes(guest.name), `Einladen: Hinweis „${village.hint}“ nennt nicht ${guest.name}`);
  await waitForResidents(page, (s) => s.residents.find((r) => r.id === guest.id && r.activity === 'rest'), 'den Bewohner zu Hause', 90_000);
  await waitForResidents(page, (s) => s.boats.length === 0, 'das Boot, das wieder wegfährt', 60_000);

  // --- Ein volles Dorf (40 Bewohner) im echten Speicher ---
  step('Bewohner: volles Dorf laden (40 Bewohner)');
  const names = JSON.parse(await readFile(path.join(ROOT, 'src', 'data', 'names.json'), 'utf8')).names;
  await clearRecords(page);
  await enterIsland(page, profile, waitForScene, SAVE_URL);
  // Ein neues Dorf speichert erst nach einer Minute oder nach einer Änderung: zwei Wegkacheln (kosten nichts) speichern sofort.
  village = await waitForVillage(page, (v) => v.save.start === 'new' && v.buildings.length > 0, 'das neue Dorf mit Speicher');
  cam = await cameraAtRest();
  const pathSpot = findFreeArea(village, cam, size, 2, 1, { near: { x: size.width * 0.6, y: size.height * 0.45 } });
  check(pathSpot !== undefined, 'Volles Dorf: kein Platz für zwei Wegkacheln');
  if (!pathSpot) return;
  await selectTool('path');
  await tapTile(pathSpot);
  await tapTile({ x: pathSpot.x + 1, y: pathSpot.y });
  await confirm((v) => v.paths.length === village.paths.length + 2, 'zwei neue Wegkacheln');
  await exitTool();
  const fresh = await waitForRecord(page, (r) => r.version === SAVE_VERSION && r.residents?.length === 2 && r.paths?.length === village.paths.length + 2, 'den Spielstand des neuen Dorfs');
  const crowded = crowdedRecord(fresh, names, { residents: 40, houses: 10, producers: 6 });
  console.log(`  [${name}] volles Dorf: ${crowded.houses} große Häuser, ${crowded.producers} Produktionsgebäude, ${crowded.record.residents.length} Bewohner`);
  await setRecordFromOutside(page, crowded.record);
  await enterIsland(page, profile, waitForScene, SAVE_URL);
  village = await waitForVillage(page, (v) => v.save.start !== undefined && v.buildings.length > 0, 'das volle Dorf', 20_000);
  check(village.save.start === 'loaded', `Volles Dorf: ${JSON.stringify(village.save)}, erwartet „loaded“`);
  state = await waitForResidents(page, (s) => s.residents.length === 40 && s.residents.every((r) => r.x !== undefined), 'die 40 Bewohner', 10_000);
  const byId = new Map(state.residents.map((r) => [r.id, r]));
  check(crowded.record.residents.every((r) => byId.get(r.id)?.name === r.name && byId.get(r.id)?.hat === r.hat), 'Volles Dorf: Namen oder Mützen stimmen nicht mit dem Spielstand überein');
  check(new Set(state.residents.map((r) => r.name)).size === 40, 'Volles Dorf: Namen kommen doppelt vor');
  // Jedes Produktionsgebäude hat genau einen Arbeiter.
  const producerTypes = ['berry-garden', 'bakery', 'market', 'lumberjack', 'quarry', 'carpenter'];
  for (const type of producerTypes) {
    const buildings = village.buildings.filter((b) => b.type === type).length;
    const workers = state.residents.filter((r) => r.job === type).length;
    check(buildings === workers, `Volles Dorf: ${buildings} × ${type}, aber ${workers} Arbeiter`);
  }
  await sleep(1500);
  await shot(`${name}-gewimmel`);

  // --- Bildzeit mit 40 Bewohnern bei 4-facher CPU-Drosselung ---
  step(`Bewohner: Bildzeit bei ${PERF_LIMIT.rate}× CPU-Drosselung`);
  await measureFrameTime({ context, page, check, name });

  // --- Speichern und Neuladen: dieselben Bewohner mit demselben Zuhause und derselben Arbeit ---
  step('Bewohner: Neuladen behält die Bewohner');
  await waitForVillage(page, (v) => v.save.saves >= 1, 'einen Autosave des vollen Dorfs', 70_000);
  const before = (await readResidents(page)).residents.map(residentIdentity);
  await enterIsland(page, profile, waitForScene, SAVE_URL);
  village = await waitForVillage(page, (v) => v.save.start !== undefined && v.buildings.length > 0, 'das neu geladene Dorf', 20_000);
  check(village.save.start === 'loaded', `Neuladen: ${JSON.stringify(village.save)}`);
  state = await waitForResidents(page, (s) => s.residents.length === 40, 'die 40 Bewohner nach dem Neuladen');
  check(same(state.residents.map(residentIdentity), before), 'Neuladen: Bewohner, Namen, Mützen, Zuhause oder Arbeit haben sich geändert');
  const record = await readRecord(page);
  check(record?.version === SAVE_VERSION && record.residents?.length === 40, `Neuladen: Spielstand Version ${record?.version} mit ${record?.residents?.length} Bewohnern`);

  // --- Kleine Handys: die Karte passt, ✕ ist groß genug ---
  if (profile.name === 'tablet') {
    for (const [w, h, label] of [
      [320, 568, 'hochkant'],
      [568, 320, 'quer'],
    ]) {
      step(`Bewohner: Karte auf dem Handy ${label} (${w}×${h})`);
      await page.setViewportSize({ width: w, height: h });
      await sleep(800);
      await cameraAtRest();
      await sleep(300);
      const phone = { width: w, height: h };
      ({ village } = await tapResident(phone, `${w}×${h}`));
      checkCard(village, phone, `Bewohner-Karte ${w}×${h}`);
      const { card } = village.ui;
      console.log(`  [${name}] Karte ${w}×${h}: ${card.w}×${card.h} px, Zeilen ${card.font} px`);
      // Quer ist die Karte kompakt: nur so hoch wie nötig, die Insel bleibt zum größten Teil sichtbar (seit M7 bis 460 px
      // breit, damit Stimmung und Tipp in je eine Zeile passen).
      if (w > h) check(card.w <= 460.5 && card.w * card.h <= 0.42 * w * h, `Bewohner-Karte ${w}×${h}: ${card.w}×${card.h} px deckt zu viel ab (kompakt höchstens 460 px breit und 42 % des Schirms)`);
      await sleep(400);
      await shot(`${name}-bewohner-handy-${label}`);
      await closeCard(`${w}×${h}`);
      await sleep(400);
      if (w < h) await tapBesideResidents(phone, `${w}×${h}`);
    }
    await page.setViewportSize(size);
    await sleep(800);
  }
}

// --- M7: Wohnen und Stimmung ---

/** Die Stimmungen von fröhlich bis traurig (`mood.pace` in `src/data/residents.json` sagt das Arbeitstempo dazu). */
const MOODS = ['happy', 'normal', 'sad'];

/**
 * Ein Finger (Tablet: echte Touch-Ereignisse über CDP `Input.dispatchTouchEvent`) oder die Maus (Desktop, linke Taste),
 * der drückt, sich bewegt und loslässt – in einzelnen Schritten, damit der Test mitten im Ziehen nachsehen kann.
 */
function pointerFor(page, cdp) {
  if (cdp) {
    const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })) });
    return { kind: 'Finger', down: (p) => send('touchStart', [p]), move: (p) => send('touchMove', [p]), up: () => send('touchEnd', []) };
  }
  return {
    kind: 'Maus',
    down: async (p) => {
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
    },
    move: (p) => page.mouse.move(p.x, p.y),
    up: () => page.mouse.up(),
  };
}

/** Drückt bei `from` und zieht in `steps` Schritten nach `to` – und hält dort (losgelassen wird danach). */
async function pressAndMove(pointer, from, to, { steps = 12, pauseMs = 45 } = {}) {
  await pointer.down(from);
  await sleep(150);
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    await pointer.move({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    await sleep(pauseMs);
  }
  await sleep(250);
}

/** Die Mitte des Grundrisses eines Gebäudes auf dem Bildschirm (CSS-px). */
function screenOfBuilding(cam, size, building) {
  const s = footprintOf(building.type);
  return { x: size.width / 2 + ((building.x + s / 2) * TILE - cam.x) * cam.zoom, y: size.height / 2 + ((building.y + s / 2) * TILE - cam.y) * cam.zoom };
}

/** Schritte (quer über die Kacheln, ohne Umweg) zwischen den Mitten zweier Grundrisse der Größe `sizeA` und `sizeB`. */
const centerSteps = (a, sizeA, b, sizeB) => Math.abs(a.x + sizeA / 2 - (b.x + sizeB / 2)) + Math.abs(a.y + sizeA / 2 - (b.y + sizeB / 2));

/** Wie weit (Kacheln, die größere Achse) die nächste Deko von der Fläche `w × h` bei `(x, y)` entfernt ist. */
function decoDistance(village, x, y, w, h) {
  let best = Number.POSITIVE_INFINITY;
  for (const b of village.buildings) {
    if (SHOP_TAB[b.type] !== 'deco') continue;
    const s = footprintOf(b.type);
    const dx = Math.max(0, b.x - (x + w - 1), x - (b.x + s - 1));
    const dy = Math.max(0, b.y - (y + h - 1), y - (b.y + s - 1));
    best = Math.min(best, Math.max(dx, dy));
  }
  return best;
}

/** Runden (`delivered`) und Arbeitstempo eines Produktionsgebäudes und der Takt der Simulation, aus einer Ablesung. */
async function readRounds(page, buildingId) {
  return page.evaluate((id) => {
    const d = document.documentElement.dataset;
    const row = JSON.parse(d.producers ?? '[]').find((p) => p[0] === id);
    return { tick: Number(d.tick ?? 0), delivered: row ? row[2] : -1, pace: row ? row[3] : 0 };
  }, buildingId);
}

/**
 * Wie viele Ticks eine Runde des Gebäudes dauert: von einer Lieferung bis `rounds` Lieferungen später, abgelesen alle
 * 40 ms (ein Bild im Headless-Chromium dauert etwa 125 ms: an jedem Ende bis zu zwei Ticks ungenau). Gibt auch alle
 * Arbeitstempi zurück, die es dabei gab.
 */
async function measureRound(page, buildingId, rounds, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last = await readRounds(page, buildingId);
  const paces = new Set();
  let start;
  let count = 0;
  while (Date.now() < deadline) {
    await sleep(40);
    const now = await readRounds(page, buildingId);
    if (start !== undefined) paces.add(now.pace);
    if (now.delivered !== last.delivered) {
      if (start === undefined) start = now;
      else count = now.delivered - start.delivered;
      if (count >= rounds) return { ticks: (now.tick - start.tick) / count, rounds: count, paces: [...paces] };
    }
    last = now;
  }
  throw new Error(`Zeitüberschreitung beim Messen der Runden von Gebäude ${buildingId} (${count} von ${rounds} Runden)`);
}

/**
 * Blumen an jedes `every`-te große Haus eines Spielstands (links, rechts oder über dem Haus, wo Wiese frei ist): Seine
 * Bewohner sind dann fröhlich und zeigen ab und zu ein Herz.
 */
function decorateHouses(record, every) {
  const { width, terrain } = record.world;
  const taken = new Set(record.paths);
  for (const b of record.buildings) {
    const s = footprintOf(b.type);
    for (let dy = 0; dy < s; dy += 1) for (let dx = 0; dx < s; dx += 1) taken.add((b.y + dy) * width + b.x + dx);
  }
  const buildings = [...record.buildings];
  let nextBuildingId = record.nextBuildingId;
  let flowers = 0;
  record.buildings
    .filter((b) => b.type === 'house-big')
    .forEach((house, i) => {
      if (i % every !== 0) return;
      for (const [x, y] of [
        [house.x - 1, house.y + 1],
        [house.x + 3, house.y + 1],
        [house.x + 1, house.y - 1],
      ]) {
        const index = y * width + x;
        if (x < 1 || y < 1 || terrain[index] !== 'g' || taken.has(index)) continue;
        buildings.push({ id: nextBuildingId, type: 'flower', x, y });
        nextBuildingId += 1;
        taken.add(index);
        flowers += 1;
        break;
      }
    });
  return { record: { ...record, buildings, nextBuildingId }, flowers };
}

/** Ist die Kachel freie Wiese (kein Gebäude, kein Weg)? */
const freeGrass = (village, x, y) => village.terrain[y * MAP_TILES + x] === 'g' && !occupiedTiles(village).has(tileKey(x, y));

/** Liegt das Rechteck `inner` (Mitte und Größe, CSS-px) ganz in `outer`? */
const spotInside = (inner, outer) =>
  inner.x - inner.w / 2 >= outer.x - outer.w / 2 - 0.5 && inner.x + inner.w / 2 <= outer.x + outer.w / 2 + 0.5 && inner.y - inner.h / 2 >= outer.y - outer.h / 2 - 0.5 && inner.y + inner.h / 2 <= outer.y + outer.h / 2 + 0.5;

/**
 * Wohnen und Stimmung (M7) mit echtem Speicher (`?seed=1`): ein Dorf mit drei Bewohnern (zwei im roten Haus, einer noch
 * ohne Zuhause, genug Taler). Die Stimmung steht auf der Karte und in `data-residents`; ein neues Haus nimmt den
 * Bewohner ohne Zuhause auf (normal), eine Blume daneben macht ihn sofort fröhlich, über ihm erscheint ein Herz. Mit dem
 * Finger (Tablet, CDP-Touch) bzw. der Maus (Desktop) wird ein Bewohner ins Haus mit Platz gezogen (grün, „1/2“, die
 * Kamera steht still) und zieht ein; auf ein volles Haus („2/2“, rot) oder auf die Wiese gezogen passiert nichts; Ziehen
 * neben den Bewohnern bewegt weiter die Kamera. Über „Umziehen“ auf der Karte zieht der Gärtner in ein Haus weit weg von
 * der Arbeit (✓): traurig, und der Beerengarten braucht messbar länger für eine Runde als mit dem fröhlichen Gärtner
 * vorher; eine Blume dort macht ihn wieder normal. Nach dem Neuladen sind Zuhause und Stimmung gleich. Zuletzt ein volles
 * Dorf (40 Bewohner, Blumen an jedem zweiten Haus): Herzen nur über fröhlichen, Wolken nur über traurigen Köpfen, die
 * Bildzeit bei 4-facher CPU-Drosselung, und auf dem Tablet die Karte auf 320×568 und 568×320.
 */
async function testHomes({ context, page, check, shot, size, input, cdp, name, profile, waitForScene }) {
  const { step, cameraAtRest, tapUi, tapTile, selectTool, pickItem, exitTool, confirm } = buildHelpers({ page, check, size, input, name });
  const { zoom, standingOnScreen, tapResident, checkCard, closeCard } = residentHelpers({ page, check, size, input, name });
  const pointer = pointerFor(page, cdp);
  const rules = JSON.parse(await readFile(path.join(ROOT, 'src', 'data', 'residents.json'), 'utf8'));
  const types = JSON.parse(await readFile(path.join(ROOT, 'src', 'data', 'buildings.json'), 'utf8')).types;
  const names = JSON.parse(await readFile(path.join(ROOT, 'src', 'data', 'names.json'), 'utf8')).names;
  const pace = rules.mood.pace;
  const gardenInterval = types.find((type) => type.id === 'berry-garden').production.intervalTicks;
  /** So viele Ticks dauert eine Runde des Beerengartens bei `percent` (wie `roundTicks` in `src/sim/production.ts`). */
  const roundOf = (percent) => Math.max(1, Math.round((gardenInterval * 100) / percent));
  const residentById = async (id) => (await readResidents(page)).residents.find((r) => r.id === id);
  const paceOf = (village, buildingId) => village.producers.find((p) => p.id === buildingId)?.pace;
  /**
   * Zieht die Kamera (neben den Bewohnern, höchstens ein Fünftel des Schirms pro Zug), bis die Fläche `w × h` bei `spot`
   * mitten im gut antippbaren Bereich liegt.
   */
  const bringIntoView = async (spot, w, h) => {
    for (let i = 0; i < 8; i += 1) {
      const view = await cameraAtRest();
      const ui = (await readVillage(page)).ui;
      const toolbarTop = ui['tool-path'] ? ui['tool-path'].y - 52 : size.height - 120;
      const goal = { x: size.width * 0.45, y: (170 + toolbarTop - 160) / 2 };
      const now = screenOfTile(view, size, { x: spot.x + (w - 1) / 2, y: spot.y + (h - 1) / 2 });
      const shift = { x: goal.x - now.x, y: goal.y - now.y };
      if (Math.abs(shift.x) < 60 && Math.abs(shift.y) < 40) return view;
      const by = { x: Math.max(-0.22 * size.width, Math.min(0.22 * size.width, shift.x)), y: Math.max(-0.2 * size.height, Math.min(0.2 * size.height, shift.y)) };
      const starts = [];
      for (let fy = 0.4; fy <= 0.6; fy += 0.05) for (let fx = 0.3; fx <= 0.7; fx += 0.05) starts.push({ x: size.width * fx, y: size.height * fy });
      const from = await pointClearOfResidents(page, starts);
      try {
        await pressAndMove(pointer, from, { x: from.x + by.x, y: from.y + by.y }, { steps: 10, pauseMs: 40 });
        await sleep(300);
      } finally {
        await pointer.up();
      }
      const after = await cameraAtRest();
      // An der Grenze der Kamera geht es nicht weiter.
      if (Math.abs(after.x - view.x) < 1 && Math.abs(after.y - view.y) < 1) return after;
    }
    return cameraAtRest();
  };
  /** Eine Fläche für ein Haus (2×2), für die `accept` stimmt: erst im Bild, sonst irgendwo – dann zieht die Kamera hin. */
  const houseSpot = async (accept) => {
    let view = await cameraAtRest();
    let village = await readVillage(page);
    let spot = findFreeArea(village, view, size, 2, 2, { margin: 0, accept: (x, y) => accept(village, x, y) });
    if (spot) return spot;
    const elsewhere = findFreeArea(village, view, size, 2, 2, { margin: 0, anywhere: true, accept: (x, y) => accept(village, x, y) });
    if (!elsewhere) return undefined;
    view = await bringIntoView(elsewhere, 2, 2);
    village = await readVillage(page);
    spot = findFreeArea(village, view, size, 2, 2, { margin: 0, accept: (x, y) => accept(village, x, y) });
    return spot;
  };

  // --- Ein Dorf mit drei Bewohnern: zwei im roten Haus (es ist voll), einer noch ohne Zuhause ---
  step('Stimmung: ein Dorf mit drei Bewohnern');
  await clearRecords(page);
  await enterIsland(page, profile, waitForScene, SAVE_URL);
  let village = await waitForVillage(page, (v) => v.save.start === 'new' && v.buildings.length > 0, 'das neue Dorf mit Speicher');
  let cam = await cameraAtRest();
  // Ein neues Dorf speichert erst nach einer Minute oder nach einer Änderung: zwei Wegkacheln (kosten nichts) speichern sofort.
  const pathSpot = findFreeArea(village, cam, size, 2, 1, { near: { x: size.width * 0.2, y: size.height * 0.3 } });
  check(pathSpot !== undefined, 'Stimmung: kein Platz für zwei Wegkacheln');
  if (!pathSpot) return;
  await selectTool('path');
  await tapTile(pathSpot);
  await tapTile({ x: pathSpot.x + 1, y: pathSpot.y });
  await confirm((v) => v.paths.length === village.paths.length + 2, 'zwei neue Wegkacheln');
  await exitTool();
  const fresh = await waitForRecord(page, (r) => r.version === SAVE_VERSION && r.residents?.length === 2 && r.paths?.length === village.paths.length + 2, 'den Spielstand des neuen Dorfs');
  check(
    fresh.residents.every((r) => Number.isInteger(r.meal) && r.meal > 0 && r.hungry === false),
    `Spielstand Version ${SAVE_VERSION}: Essen und Hunger der Bewohner ${JSON.stringify(fresh.residents.map((r) => [r.meal, r.hungry]))}`,
  );
  const used = new Set(fresh.residents.map((r) => r.name));
  const newcomer = {
    id: fresh.nextResidentId,
    name: names.find((n) => !used.has(n)),
    hat: 3,
    home: null,
    job: null,
    at: fresh.paths[0],
    route: [],
    step: 0,
    doing: 'wait',
    goal: 'visit',
    place: null,
    timer: 20,
    carrying: null,
    seen: 0,
    trips: 0,
    meal: 1800,
    hungry: false,
  };
  // Genug Taler und Holz für drei Häuser, und Beeren zum Essen (niemand soll mitten im Test Hunger bekommen). Alles ist
  // schon freigeschaltet: Sonst verdrängt „Neu im Shop: …“ mitten im Test den Satz, auf den der Test wartet.
  const unlocked = types.filter((type) => type.unlock !== undefined).map((type) => type.id);
  await setRecordFromOutside(page, {
    ...fresh,
    inventory: { ...fresh.inventory, coins: 500, wood: 80, berries: 8 },
    residents: [...fresh.residents, newcomer],
    nextResidentId: fresh.nextResidentId + 1,
    unlocked,
  });
  await enterIsland(page, profile, waitForScene, SAVE_URL);
  village = await waitForVillage(page, (v) => v.save.start !== undefined && v.buildings.length > 0, 'das Dorf mit drei Bewohnern', 20_000);
  check(village.save.start === 'loaded', `Stimmung: ${JSON.stringify(village.save)}, erwartet „loaded“`);
  check(unlocked.every((id) => village.unlocked.includes(id)), `Stimmung: freigeschaltet ${village.unlocked.join(',')}, erwartet alles (${unlocked.join(',')})`);
  let state = await waitForResidents(page, (s) => s.residents.length === 3 && s.residents.every((r) => r.x !== undefined), 'die drei Bewohner');
  const gardener = state.residents.find((r) => r.job === 'berry-garden');
  const trader = state.residents.find((r) => r.job === 'market');
  const guest = state.residents.find((r) => r.id === newcomer.id);
  const red = village.buildings.find((b) => b.type === 'house-red');
  const garden = village.buildings.find((b) => b.type === 'berry-garden');
  const market = village.buildings.find((b) => b.type === 'market');
  check(gardener && trader && guest && red && garden && market, `Stimmung: Gärtner, Händler, Gast, rotes Haus, Beerengarten oder Markt fehlt (${JSON.stringify(state.residents)})`);
  if (!gardener || !trader || !guest || !red || !garden || !market) return;
  check(gardener.homeId === red.id && trader.homeId === red.id && guest.homeId === null, `Stimmung: Zuhause ${JSON.stringify(state.residents.map((r) => [r.name, r.homeId]))}, erwartet zwei im roten Haus ${red.id}, einer ohne`);
  check(state.residents.every((r) => MOODS.includes(r.mood) && typeof r.reason === 'string' && r.reason.startsWith('reason.')), `Stimmung: ${JSON.stringify(state.residents.map((r) => [r.mood, r.reason]))}`);
  // Im Startdorf stehen Blumen und ein Busch am roten Haus, die Arbeit ist nah: fröhlich. Ohne Zuhause: normal.
  check(gardener.mood === 'happy' && gardener.reason === 'reason.deco' && trader.mood === 'happy', `Stimmung im Startdorf: Gärtner ${gardener.mood}/${gardener.reason}, Händler ${trader.mood}/${trader.reason}, erwartet fröhlich (Deko am Haus)`);
  check(guest.mood === 'normal' && guest.reason === 'reason.homeless', `Stimmung ohne Zuhause: ${guest.mood}/${guest.reason}, erwartet normal (noch kein Zuhause)`);
  check(paceOf(village, garden.id) === pace.happy && paceOf(village, market.id) === pace.happy, `Arbeitstempo im Startdorf: ${JSON.stringify(village.producers)}, erwartet ${pace.happy} %`);

  // --- Arbeitstempo mit dem fröhlichen Gärtner ---
  step('Arbeitstempo: der fröhliche Gärtner');
  const happyRound = await measureRound(page, garden.id, 3);
  check(same(happyRound.paces, [pace.happy]) && Math.abs(happyRound.ticks - roundOf(pace.happy)) <= 3, `Arbeitstempo fröhlich: ${happyRound.ticks.toFixed(1)} Ticks pro Runde bei ${JSON.stringify(happyRound.paces)} %, erwartet ${roundOf(pace.happy)}`);

  // --- Die Stimmung auf der Karte ---
  step('Stimmung: auf der Karte des Gärtners');
  await zoom('zoom-in', 1);
  cam = await readCamera(page);
  check(cam.zoom >= 0.5, `Stimmung: Zoom ${cam.zoom} – Bewohner lassen sich erst ab 0,5 tragen`);
  let { village: v } = await tapResident(size, 'Karte des Gärtners', NO_OFFSET, (r) => r.id === gardener.id);
  checkCard(v, size, 'Karte mit Stimmung');
  check(v.ui.card.mood === 'happy' && v.ui.card.rows === 6, `Karte: Stimmung „${v.ui.card.mood}“ mit ${v.ui.card.rows} Zeilen, erwartet fröhlich mit 6 Zeilen`);
  let move = v.ui['card-move'];
  check(move?.enabled === true && move.w >= 72 && move.h >= 48 && move.font >= 14 && spotInside(move, v.ui.card), `Karte: „Umziehen“ ${JSON.stringify(move)} (mindestens 72×48 px, Schrift 14 px, in der Karte ${JSON.stringify(v.ui.card)})`);
  // Das Wort „Umziehen“ ist so groß wie die Zeilen der Karte (höchstens 1 px kleiner, wo der Knopf es begrenzt).
  check(move.font >= Math.min(v.ui.card.font, 19) - 1, `Karte: „Umziehen“ in ${move.font} px, die Zeilen in ${v.ui.card.font} px`);
  console.log(`  [${name}] Karte: Zeilen ${v.ui.card.font} px, „Umziehen“ ${move.w}×${move.h} px mit ${move.font} px`);
  await sleep(400);
  await shot(`${name}-stimmung-karte`);
  await closeCard('Karte des Gärtners');
  await sleep(400);

  // --- Ein neues Haus: der Bewohner ohne Zuhause zieht ein ---
  step('Wohnen: ein neues Haus nah an der Arbeit, ohne Deko');
  // Nah am Markt (die Mitten höchstens 8 Kacheln auseinander, von Tür zu Tür nicht mehr als 12 Schritte – das prüft die
  // Stimmung des Händlers nach dem Umzug), keine Deko bis 2 Kacheln ums Haus, rechts daneben Platz für eine Blume.
  const nearSpot = await houseSpot((vv, x, y) => centerSteps({ x, y }, 2, market, 3) <= 8 && decoDistance(vv, x, y, 2, 2) > 2 && freeGrass(vv, x + 2, y + 1));
  check(nearSpot !== undefined, 'Wohnen: kein Platz für ein Haus nah am Markt ohne Deko');
  if (!nearSpot) return;
  await pickItem('house-blue');
  await tapTile({ x: nearSpot.x, y: nearSpot.y + 1 });
  await waitForVillage(page, (x) => x.preview === 'place:ok', 'grüne Vorschau fürs blaue Haus');
  let before = village.buildings.length;
  village = await confirm((x) => x.buildings.length === before + 1, 'das blaue Haus');
  await exitTool();
  const blue = village.buildings.find((b) => b.type === 'house-blue' && b.x === nearSpot.x && b.y === nearSpot.y);
  check(blue !== undefined, `Wohnen: das blaue Haus steht nicht bei ${nearSpot.x},${nearSpot.y}`);
  if (!blue) return;
  state = await waitForResidents(page, (s) => s.residents.find((r) => r.id === guest.id && r.homeId === blue.id), `${guest.name} im neuen blauen Haus`, 5000);
  check(state.found.mood === 'normal' && state.found.reason === 'reason.noDeco', `Wohnen: ${guest.name} im Haus ohne Deko ${state.found.mood}/${state.found.reason}, erwartet normal`);

  // --- Eine Blume daneben macht fröhlich – sofort, und über dem Kopf erscheint ab und zu ein Herz ---
  step('Stimmung: eine Blume am Haus macht fröhlich');
  await pickItem('flower');
  await tapTile({ x: blue.x + 2, y: blue.y + 1 });
  await waitForVillage(page, (x) => x.preview === 'place:ok', 'grüne Vorschau für die Blume');
  before = (await readVillage(page)).buildings.length;
  await confirm((x) => x.buildings.length === before + 1, 'die Blume am blauen Haus');
  const flowered = Date.now();
  state = await waitForResidents(page, (s) => s.residents.find((r) => r.id === guest.id && r.mood === 'happy'), `${guest.name} fröhlich nach der Blume`, 5000);
  const happierAfter = (Date.now() - flowered) / 1000;
  check(state.found.reason === 'reason.deco', `Stimmung nach der Blume: Grund ${state.found.reason}`);
  await exitTool();
  console.log(`  [${name}] ${guest.name}: normal ohne Deko, ${happierAfter.toFixed(1)} s nach der Blume fröhlich`);
  const heart = await page
    .waitForFunction(
      (id) => {
        const r = JSON.parse(document.documentElement.dataset.residents ?? '[]').find((x) => x.id === id);
        const shown = r && r.sign === 1 && r.mood === 'happy' && r.sx > 40 && r.sx < window.innerWidth - 40 && r.sy > 60 && r.sy < window.innerHeight - 120;
        // Das Bild anhalten, solange das Herz zu sehen ist (für den Screenshot).
        if (shown) window.__holdFrames = true;
        return shown ? JSON.stringify(r) : false;
      },
      guest.id,
      { timeout: 40_000, polling: 60 },
    )
    .then((handle) => handle.jsonValue())
    .catch(() => undefined);
  check(heart !== undefined, `Stimmung: über ${guest.name} erschien in 40 s kein Herz`);
  if (heart) await shot(`${name}-deko-froh`);
  await page.evaluate(() => window.__releaseFrames());

  /**
   * Trägt den Bewohner `who` (stehend im Bild) zum Haus `house` (oder, ohne Haus, zum Punkt `to`), schaut mitten im
   * Ziehen nach (`data-drag`, Vorschau, „2/2“, Kamera) und lässt dann los. Erst drückt der Finger auf den Bewohner und
   * rückt 24 px weiter (mehr als ein Tipp): Trägt er ihn dann nicht, ging der Bewohner gerade los – der Finger hat nur
   * die Kamera ein Stück gezogen, ein neuer Versuch folgt.
   */
  const carry = async (who, house, what, { to: point, shotName, secondFinger = false } = {}) => {
    let camBefore = await cameraAtRest();
    let from;
    let nudged;
    for (let attempt = 1; ; attempt += 1) {
      const ui = (await readVillage(page)).ui;
      const { found } = await waitForResidents(page, (s) => standingOnScreen(s, ui, size, NO_OFFSET, new Set(), (r) => r.id === who.id), `${who.name} stehend im Bild (${what})`, 90_000);
      from = { x: found.sx, y: found.sy };
      const aim = house ? screenOfBuilding(camBefore, size, house) : point;
      const length = Math.hypot(aim.x - from.x, aim.y - from.y) || 1;
      nudged = { x: from.x + ((aim.x - from.x) / length) * 24, y: from.y + ((aim.y - from.y) / length) * 24 };
      await pointer.down(from);
      await sleep(120);
      await pointer.move({ x: (from.x + nudged.x) / 2, y: (from.y + nudged.y) / 2 });
      await sleep(45);
      await pointer.move(nudged);
      const picked = await waitForVillage(page, (x) => x.drag?.resident === who.id, `${who.name} am Finger (${what})`, 1500).catch(() => undefined);
      if (picked) break;
      await pointer.up();
      const now = await residentById(who.id);
      if (attempt >= 4) throw new Error(`${what}: ${who.name} ließ sich nicht greifen (gedrückt bei ${from.x.toFixed(0)},${from.y.toFixed(0)}, jetzt ${JSON.stringify(now)})`);
      console.log(`  [${name}] (${what}: ${who.name} nicht gegriffen – ${now?.activity}, jetzt bei ${now?.sx},${now?.sy} statt ${from.x.toFixed(0)},${from.y.toFixed(0)}; noch einmal)`);
      await sleep(500);
      camBefore = await cameraAtRest();
    }
    // Das Tragen bewegt die Kamera nicht: das Ziel liegt, wo es vor dem Drücken lag.
    const to = house ? screenOfBuilding(camBefore, size, house) : point;
    let during;
    let camCarrying;
    // Korrekturrunde 1: über einem Haus mit Platz ist es erst gelb (`ready` false, Vorschau „…:wait“) und wird nach
    // einem kurzen Verweilen grün – erst dann zieht Loslassen um.
    let sawWait = false;
    let sliding;
    const peek = () =>
      page.evaluate(() => {
        const d = document.documentElement.dataset;
        return { drag: d.drag ? JSON.parse(d.drag) : undefined, preview: d.preview ?? '' };
      });
    try {
      for (let i = 1; i <= 10; i += 1) {
        const t = i / 10;
        await pointer.move({ x: nudged.x + (to.x - nudged.x) * t, y: nudged.y + (to.y - nudged.y) * t });
        await sleep(45);
        const seen = await peek();
        if (house && seen.drag?.house === house.id && seen.drag.result === 'ok' && seen.drag.ready === false && seen.preview.endsWith(':carried:wait')) sawWait = true;
      }
      await sleep(250);
      during = await waitForVillage(
        page,
        (x) => x.drag?.resident === who.id && x.drag.house === house?.id && (x.drag.result !== 'ok' || x.drag.ready === true),
        `${who.name} getragen über ${house ? house.type : 'der Wiese'} (${what})`,
        4000,
      ).catch((error) => error);
      camCarrying = await readCamera(page);
      if (shotName && !(during instanceof Error)) {
        await sleep(300);
        await shot(shotName);
      }
      if (secondFinger && cdp && !(during instanceof Error)) {
        // K2: ein zweiter Finger beendet das Tragen – die Figur gleitet zurück, statt zu springen.
        sliding = sampleResident(who.id, 1500);
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [
            { x: to.x, y: to.y, id: 0 },
            { x: Math.min(size.width - 20, to.x + 160), y: Math.min(size.height - 20, to.y + 60), id: 1 },
          ],
        });
        await sleep(200);
      }
    } finally {
      await pointer.up();
    }
    await sleep(600);
    if (during instanceof Error) throw during;
    check(Math.abs(during.drag.sx - to.x) <= 3 && Math.abs(during.drag.sy - to.y) <= 3, `${what}: der Finger steht laut data-drag bei ${during.drag.sx},${during.drag.sy}, nicht bei ${to.x.toFixed(0)},${to.y.toFixed(0)}`);
    check(Math.abs(camCarrying.x - camBefore.x) < 1 && Math.abs(camCarrying.y - camBefore.y) < 1 && camCarrying.zoom === camBefore.zoom, `${what}: die Kamera hat sich beim Tragen bewegt (${camBefore.x},${camBefore.y} → ${camCarrying.x},${camCarrying.y})`);
    return { during, after: await readVillage(page), sawWait, slide: sliding ? jumpsOf(await sliding) : undefined };
  };

  /**
   * W1 (Korrekturrunde 1): ein schnelles Wischen, das auf dem Bewohner `who` beginnt und über das Haus `house` (mit
   * Platz) geht und dort sofort endet – wie ein Kind, das eigentlich das Bild schieben wollte. Niemand zieht um; der Satz
   * sagt, dass man kurz halten soll (das belegt, dass der Bewohner wirklich getragen wurde). Ging der Bewohner gerade los
   * (der Finger zog nur die Kamera), folgt ein neuer Versuch.
   */
  const swipe = async (who, house, what) => {
    for (let attempt = 1; ; attempt += 1) {
      const view = await cameraAtRest();
      const ui = (await readVillage(page)).ui;
      const { found } = await waitForResidents(page, (s) => standingOnScreen(s, ui, size, NO_OFFSET, new Set(), (r) => r.id === who.id), `${who.name} stehend im Bild (${what})`, 90_000);
      const from = { x: found.sx, y: found.sy };
      const to = screenOfBuilding(view, size, house);
      // Headless zeichnet nur 3–8 Bilder pro Sekunde, die Schritte des Fingers kommen dort im Takt der Bilder an: Vier
      // Zwischenschritte standen zusammen länger als 250 ms über dem Haus (ein erster Entwurf dieses Tests zog so um).
      // Deshalb kommen der Schritt aufs Haus und das Loslassen ohne Pause hintereinander – wie ein schnelles Wischen.
      const started = Date.now();
      await pointer.down(from);
      await sleep(60);
      await Promise.all([pointer.move(to), pointer.up()]);
      const took = Date.now() - started;
      const after = await waitForVillage(page, (x) => x.drag === undefined && x.hint !== '', `den Satz nach dem Wischen (${what})`, 3000).catch(() => readVillage(page));
      if (after.hint.includes('kurz über dem Haus')) return { after, took };
      if (attempt >= 4) throw new Error(`${what}: nach dem Wischen von ${who.name} steht „${after.hint}“ (Vorschau ${after.preview})`);
      console.log(`  [${name}] (${what}: ${who.name} nicht getragen – „${after.hint}“; noch einmal)`);
      await sleep(600);
    }
  };

  /**
   * Wo ein Bewohner gezeichnet wird (Fußpunkt, Welt-px) und ob er gerade gleitet (`glide`), in jedem Bild für `ms`
   * Millisekunden – nur die Änderungen.
   */
  const sampleResident = (id, ms) =>
    page.evaluate(
      ({ id: who, ms: span }) =>
        new Promise((resolve) => {
          const points = [];
          const started = performance.now();
          // Einmal pro Bild (ein Zeitgeber käme zwischen langsamen Bildern oft nicht dran und verpasste welche).
          const frame = () => {
            const r = JSON.parse(document.documentElement.dataset.residents ?? '[]').find((x) => x.id === who);
            const last = points[points.length - 1];
            if (r && r.x !== undefined && (!last || last.x !== r.x || last.y !== r.y || last.glide !== r.glide)) points.push({ x: r.x, y: r.y, glide: r.glide });
            if (performance.now() - started > span) resolve(points);
            else requestAnimationFrame(frame);
          };
          frame();
        }),
      { id, ms },
    );
  /**
   * Ob eine Figur gleitet statt springt, aus einer Folge von Punkten ({@link sampleResident}), die dort beginnt, wo sie
   * war (getragen oder stehend). Headless zeichnet nur 3–8 Bilder pro Sekunde, ein Gleiten von 0,3–0,9 s fällt dort in
   * ein bis drei Bilder – die Größe der Schritte sagt also nichts. Belegt wird es über `glide` in `data-residents`: Das
   * erste gleitende Bild (`glide` 1) zeigt die Figur genau dort, wo sie im Bild davor stand (`startGap`; das erste Bild
   * nach dem Loslassen zeigt sie am alten Ort), vorher macht sie keinen Satz, der weiter ist als ein Schritt beim Gehen
   * (`jumped`: über 40 Welt-px von einem Bild zum nächsten), und am Ende steht sie wieder ohne Gleiten (`ended`). Dazu
   * zum Nachlesen der größte Schritt und der ganze Weg (Welt-px).
   */
  const jumpsOf = (points) => {
    const step = (i) => Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    let biggest = 0;
    for (let i = 1; i < points.length; i += 1) biggest = Math.max(biggest, step(i));
    const first = points[0];
    const last = points[points.length - 1];
    const glideIndex = points.findIndex((p) => p.glide === 1);
    let jumped = false;
    for (let i = 1; i < (glideIndex < 0 ? points.length : glideIndex); i += 1) jumped ||= step(i) > 40;
    return {
      biggest,
      total: first && last ? Math.hypot(last.x - first.x, last.y - first.y) : 0,
      frames: points.length,
      glided: glideIndex >= 0,
      startGap: glideIndex > 0 ? step(glideIndex) : Number.POSITIVE_INFINITY,
      jumped,
      ended: last?.glide === 0,
    };
  };
  /** Die Figur glitt vom alten Ort (höchstens `gap` Welt-px daneben) und sprang nicht. */
  const glidOk = (slide, gap = 2) => slide !== undefined && slide.glided && !slide.jumped && slide.startGap <= gap && slide.ended;

  // --- W1: ein schnelles Wischen vom Bewohner über ein Haus mit Platz zieht nicht um ---
  step(`Wohnen: ${trader.name} per ${pointer.kind} schnell über das blaue Haus wischen`);
  const swiped = await swipe(trader, blue, 'schnelles Wischen');
  await sleep(800);
  check((await residentById(trader.id))?.homeId === red.id, `Schnelles Wischen: ${trader.name} ist ins blaue Haus gezogen („${swiped.after.hint}“)`);
  check(swiped.after.hint === `Halte ${trader.name} kurz über dem Haus, bis es grün wird.`, `Schnelles Wischen: Satz „${swiped.after.hint}“`);
  console.log(`  [${name}] schnelles Wischen in ${swiped.took} ms: kein Umzug, „${swiped.after.hint}“`);

  // --- Ziehen auf ein Haus mit Platz: grün, „1/2“, der Bewohner zieht ein ---
  step(`Wohnen: ${trader.name} per ${pointer.kind} ins blaue Haus ziehen`);
  let carried = await carry(trader, blue, 'Ziehen ins Haus mit Platz', { shotName: `${name}-ziehen` });
  check(carried.during.drag.result === 'ok' && carried.during.drag.ready === true && carried.during.drag.used === 1 && carried.during.drag.capacity === 2, `Ziehen ins Haus mit Platz: ${JSON.stringify(carried.during.drag)}`);
  check(carried.during.preview === 'home:ok:1/2:carried' && carried.during.homeLabel === '1/2', `Ziehen ins Haus mit Platz: Vorschau ${carried.during.preview}, über dem Haus „${carried.during.homeLabel}“`);
  check(carried.sawWait, 'Ziehen ins Haus mit Platz: das Haus war nie erst gelb (Vorschau „…:carried:wait“), bevor es grün wurde');
  state = await waitForResidents(page, (s) => s.residents.find((r) => r.id === trader.id && r.homeId === blue.id), `${trader.name} im blauen Haus`, 4000);
  check(state.card === '' && carried.after.drag === undefined && carried.after.preview === 'none', `Nach dem Ziehen: Karte „${state.card}“, data-drag ${JSON.stringify(carried.after.drag)}, Vorschau ${carried.after.preview}`);
  village = await waitForVillage(page, (x) => x.hint === `${trader.name} wohnt jetzt hier!`, `den Satz, dass ${trader.name} jetzt im blauen Haus wohnt`, 4000);
  check(state.found.mood === 'happy' && state.found.reason === 'reason.deco', `Nach dem Umzug ins blaue Haus (mit Blume): ${trader.name} ${state.found.mood}/${state.found.reason}`);
  console.log(`  [${name}] ${trader.name} per ${pointer.kind} ins blaue Haus getragen: „${village.hint}“`);

  // --- Ziehen auf ein volles Haus: rot, „2/2“, nichts passiert ---
  step(`Wohnen: ${gardener.name} auf das volle blaue Haus ziehen`);
  carried = await carry(gardener, blue, 'Ziehen auf ein volles Haus', { shotName: `${name}-ziehen-voll` });
  check(carried.during.drag.result === 'full' && carried.during.drag.used === 2 && carried.during.drag.capacity === 2, `Ziehen auf ein volles Haus: ${JSON.stringify(carried.during.drag)}`);
  check(carried.during.preview === 'home:full:2/2:carried' && carried.during.homeLabel === '2/2', `Ziehen auf ein volles Haus: Vorschau ${carried.during.preview}, über dem Haus „${carried.during.homeLabel}“`);
  village = await waitForVillage(page, (x) => x.hint.includes('2/2'), 'den Satz, dass das Haus voll ist', 4000);
  check((await residentById(gardener.id))?.homeId === red.id, `Ziehen auf ein volles Haus: ${gardener.name} wohnt nicht mehr im roten Haus`);

  // --- Loslassen auf der Wiese: nichts passiert ---
  step(`Wohnen: ${gardener.name} auf die Wiese ziehen`);
  cam = await cameraAtRest();
  village = await readVillage(page);
  // Freie Wiese, auf die auch kein Dach eines Hauses darunter ragt.
  const underRoof = (x, y) => village.buildings.some((b) => SHOP_TAB[b.type] === 'houses' && b.x <= x + 1 && b.x + footprintOf(b.type) - 1 >= x - 1 && b.y > y && b.y <= y + 3);
  const meadow = findFreeArea(village, cam, size, 1, 1, { margin: 1, near: { x: size.width * 0.3, y: size.height * 0.4 }, accept: (x, y) => !underRoof(x, y) });
  if (meadow) {
    carried = await carry(gardener, undefined, 'Ziehen auf die Wiese', { to: screenOfTile(cam, size, meadow) });
    check(carried.during.drag.result === undefined && carried.during.homeLabel === '' && carried.during.preview === 'none', `Ziehen auf die Wiese: ${JSON.stringify(carried.during.drag)}, Vorschau ${carried.during.preview}, „${carried.during.homeLabel}“`);
    check((await residentById(gardener.id))?.homeId === red.id, `Ziehen auf die Wiese: ${gardener.name} ist umgezogen („${carried.after.hint}“)`);
    // T1: ein Satz sagt, wo man loslassen muss – er bleibt bis zum nächsten Tipp.
    check(carried.after.hint === `Lass ${gardener.name} auf einem Haus los, dann ist es das neue Zuhause.`, `Ziehen auf die Wiese: Satz „${carried.after.hint}“`);
    await sleep(1500);
    const later = await readVillage(page);
    check(later.hint === carried.after.hint, `Ziehen auf die Wiese: der Satz ist nach 1,5 s „${later.hint}“`);
    if (cdp) {
      step(`Wohnen: ein zweiter Finger beendet das Tragen von ${gardener.name}`);
      cam = await cameraAtRest();
      carried = await carry(gardener, undefined, 'Tragen mit zweitem Finger', { to: screenOfTile(cam, size, meadow), secondFinger: true });
      const { slide } = carried;
      check(carried.after.drag === undefined && (await residentById(gardener.id))?.homeId === red.id, `Zweiter Finger: data-drag ${JSON.stringify(carried.after.drag)}, ${gardener.name} wohnt nicht mehr im roten Haus`);
      check(slide !== undefined && slide.total > TILE && glidOk(slide), `Zweiter Finger: ${gardener.name} sprang zurück (${JSON.stringify(slide)})`);
      console.log(`  [${name}] zweiter Finger: ${gardener.name} gleitet ${slide?.total.toFixed(0)} Welt-px zurück (erstes gleitendes Bild ${slide?.startGap.toFixed(1)} px vom Ort des Tragens, ${slide?.frames} Bilder, größter Schritt ${slide?.biggest.toFixed(0)})`);
    }
  } else {
    check(false, 'Ziehen auf die Wiese: keine freie Wiese im Bild');
  }

  // --- Ziehen neben den Bewohnern bewegt die Kamera ---
  step(`Kamera: ${pointer.kind} neben den Bewohnern zieht die Karte`);
  cam = await cameraAtRest();
  const candidates = [];
  for (let fy = 0.35; fy <= 0.6; fy += 0.05) for (let fx = 0.3; fx <= 0.7; fx += 0.05) candidates.push({ x: size.width * fx, y: size.height * fy });
  const panFrom = await pointClearOfResidents(page, candidates);
  const panTo = { x: panFrom.x - 180, y: panFrom.y - 60 };
  let sawDrag;
  try {
    await pressAndMove(pointer, panFrom, panTo, { steps: 10, pauseMs: 45 });
    sawDrag = (await readVillage(page)).drag !== undefined;
    await sleep(300);
  } finally {
    await pointer.up();
  }
  const panned = await cameraAtRest();
  check(!sawDrag && (panned.x - cam.x) * cam.zoom > 0.6 * 180 && (panned.y - cam.y) * cam.zoom > 0.6 * 60, `Kamera: Ziehen neben den Bewohnern hat die Kamera um ${((panned.x - cam.x) * cam.zoom).toFixed(0)}/${((panned.y - cam.y) * cam.zoom).toFixed(0)} px bewegt, erwartet etwa 180/60 (getragen: ${sawDrag})`);

  // --- Ein Haus weit weg von der Arbeit ---
  step('Wohnen: ein Haus weit weg vom Beerengarten');
  await zoom('zoom-out', 2);

  // --- T2: weit draußen lässt sich niemand tragen – die Kamera zieht wie immer, und ein Satz sagt, warum ---
  step(`Wohnen: weit draußen per ${pointer.kind} einen Bewohner ziehen`);
  for (let attempt = 1; ; attempt += 1) {
    const view = await cameraAtRest();
    check(view.zoom < 0.5, `Weit draußen: Zoom ${view.zoom}, erwartet unter 0,5`);
    const ui = (await readVillage(page)).ui;
    const { found } = await waitForResidents(page, (s) => standingOnScreen(s, ui, size, NO_OFFSET, new Set()), 'einen stehenden Bewohner weit draußen', 90_000);
    // Vom Bewohner zur Bildmitte ziehen: Der Mittelpunkt der Kamera wandert dabei zum Bewohner, also auf Land – dort
    // hält ihn keine Grenze (der Mittelpunkt bleibt auf Land; ein erster Entwurf zog zur Mitte der Karte, und die
    // Kamera kam quer nicht weiter, weil dort Wasser lag). Steht der Bewohner fast in der Mitte, geht es zur Inselmitte.
    const toMiddle = { x: size.width / 2 - found.sx, y: size.height / 2 - found.sy };
    const far = Math.hypot(toMiddle.x, toMiddle.y);
    const middle = (MAP_TILES / 2) * TILE;
    const length = Math.min(120, far);
    const by = far >= 60 ? { x: (toMiddle.x / far) * length, y: (toMiddle.y / far) * length } : { x: Math.sign(view.x - middle || 1) * 120, y: Math.sign(view.y - middle || 1) * 40 };
    let dragged;
    try {
      await pressAndMove(pointer, { x: found.sx, y: found.sy }, { x: found.sx + by.x, y: found.sy + by.y }, { steps: 8, pauseMs: 40 });
      dragged = (await readVillage(page)).drag !== undefined;
    } finally {
      await pointer.up();
    }
    const after = await cameraAtRest();
    const hint = (await readVillage(page)).hint;
    const moved = Math.hypot((after.x - view.x) * view.zoom, (after.y - view.y) * view.zoom);
    if (hint === `Zoom näher heran, dann kannst du ${found.name} tragen.` || attempt >= 3) {
      check(!dragged, `Weit draußen: ${found.name} wurde bei Zoom ${view.zoom.toFixed(2)} getragen`);
      check(hint === `Zoom näher heran, dann kannst du ${found.name} tragen.`, `Weit draußen: nach dem Ziehen auf ${found.name} steht „${hint}“`);
      // Zum Vergleich derselbe Zug neben den Bewohnern: Weit draußen hält die Grenze die Kamera oft schon nach wenigen
      // Pixeln (der Mittelpunkt bleibt auf Land, fast die ganze Insel ist im Bild). Der Zug auf dem Bewohner muss die
      // Kamera genauso weit bewegen wie ein gewöhnlicher – wo die Grenze hält, hält sie beide.
      const clear = await pointClearOfResidents(page, [0.35, 0.45, 0.55].flatMap((fy) => [0.3, 0.4, 0.5, 0.6].map((fx) => ({ x: size.width * fx, y: size.height * fy }))));
      try {
        await pressAndMove(pointer, clear, { x: clear.x + by.x, y: clear.y + by.y }, { steps: 8, pauseMs: 40 });
      } finally {
        await pointer.up();
      }
      const control = await cameraAtRest();
      const controlMoved = Math.hypot((control.x - after.x) * view.zoom, (control.y - after.y) * view.zoom);
      check(moved >= 0.8 * controlMoved - 10, `Weit draußen: der Zug auf ${found.name} zog die Kamera nur ${moved.toFixed(0)} px, derselbe Zug daneben ${controlMoved.toFixed(0)} px (Zoom ${view.zoom.toFixed(2)})`);
      const px = (a, b) => `${((a.x - b.x) * view.zoom).toFixed(0)},${((a.y - b.y) * view.zoom).toFixed(0)}`;
      console.log(
        `  [${name}] weit draußen (Zoom ${view.zoom.toFixed(2)}, kleinster ${view.min.toFixed(2)}): Finger ${by.x.toFixed(0)},${by.y.toFixed(0)} px, Kamera auf ${found.name} ${moved.toFixed(0)} px (${px(view, after)}), daneben ${controlMoved.toFixed(0)} px (${px(after, control)}), „${hint}“`,
      );
      break;
    }
    console.log(`  [${name}] (weit draußen: ${found.name} nicht getroffen – „${hint}“; noch einmal)`);
    await sleep(600);
  }
  // Die Mitten mindestens 20 Kacheln auseinander: von Tür zu Tür sicher mehr als `farTiles` Schritte.
  const farSpot = await houseSpot((vv, x, y) => centerSteps({ x, y }, 2, garden, 2) >= 20 && decoDistance(vv, x, y, 2, 2) > 2 && freeGrass(vv, x + 2, y + 1));
  check(farSpot !== undefined, 'Wohnen: kein Platz für ein Haus weit weg vom Beerengarten');
  if (!farSpot) return;
  await pickItem('house-yellow');
  await tapTile({ x: farSpot.x, y: farSpot.y + 1 });
  await waitForVillage(page, (x) => x.preview === 'place:ok', 'grüne Vorschau fürs gelbe Haus');
  before = (await readVillage(page)).buildings.length;
  village = await confirm((x) => x.buildings.length === before + 1, 'das gelbe Haus');
  await exitTool();
  const yellow = village.buildings.find((b) => b.type === 'house-yellow' && b.x === farSpot.x && b.y === farSpot.y);
  check(yellow !== undefined, `Wohnen: das gelbe Haus steht nicht bei ${farSpot.x},${farSpot.y}`);
  if (!yellow) return;

  // --- Umziehen über die Karte: Knopf, Haus antippen, ✓ ---
  step(`Umziehen über die Karte: ${gardener.name} ins gelbe Haus`);
  await zoom('zoom-in', 2);
  await bringIntoView(garden, 2, 2);
  await sleep(400);
  ({ village: v } = await tapResident(size, 'Karte zum Umziehen', NO_OFFSET, (r) => r.id === gardener.id));
  move = v.ui['card-move'];
  check(move?.enabled === true, `Umziehen: der Knopf ${JSON.stringify(move)} ist nicht bereit`);
  await tapUi('card-move');
  v = await waitForVillage(page, (x) => x.tool === 'home' && x.hint.includes(gardener.name), 'das Werkzeug „Umziehen“ mit dem Satz', 4000);
  check(!('card' in v.ui) && !('confirm' in v.ui && v.ui.confirm.enabled), `Umziehen: Karte ${JSON.stringify(v.ui.card)} oder ✓ ${JSON.stringify(v.ui.confirm)} vor der Wahl eines Hauses`);
  // Beim Umziehen zieht ein Finger (auch auf einem Bewohner) nur die Kamera: hin zum gelben Haus.
  await bringIntoView(yellow, 2, 2);
  // Ein Tipp neben das Haus sagt nur, was zu tun ist.
  await tapTile({ x: yellow.x + 2, y: yellow.y + 1 });
  await waitForVillage(page, (x) => x.tool === 'home' && x.hint.includes('Tippe auf ein Haus') && x.preview === 'none', 'den Satz nach einem Tipp auf die Wiese', 4000);
  // T3: liegt das Haus halb unter der Hinweisleiste, fährt die Kamera nach dem Tipp sanft hin.
  const rise = types.find((type) => type.id === 'house-yellow').look.rise;
  const roofTop = (view) => screenOfTile(view, size, { x: yellow.x, y: yellow.y }).y - (TILE / 2 + rise) * view.zoom;
  const houseBottom = (view) => screenOfTile(view, size, { x: yellow.x, y: yellow.y + 1 }).y + (TILE / 2) * view.zoom;
  let band = (await readVillage(page)).ui.band;
  let view = await cameraAtRest();
  const shiftBy = band.y - band.h / 2 - 30 - roofTop(view);
  const starts = [];
  for (let fy = 0.4; fy <= 0.6; fy += 0.05) for (let fx = 0.3; fx <= 0.7; fx += 0.05) starts.push({ x: size.width * fx, y: size.height * fy });
  const panStart = await pointClearOfResidents(page, starts);
  try {
    await pressAndMove(pointer, panStart, { x: panStart.x, y: panStart.y + shiftBy }, { steps: 10, pauseMs: 40 });
  } finally {
    await pointer.up();
  }
  view = await cameraAtRest();
  band = (await readVillage(page)).ui.band;
  const bandTop = band.y - band.h / 2;
  check(roofTop(view) < bandTop, `Umziehen: das Dach des gelben Hauses (${roofTop(view).toFixed(0)}) liegt nicht unter der Hinweisleiste (bis ${bandTop.toFixed(0)})`);
  await tapTile({ x: yellow.x, y: yellow.y + 1 });
  v = await waitForVillage(page, (x) => x.preview === 'home:ok:0/2' && x.ui.confirm?.enabled === true, 'die grüne Vorschau auf dem gelben Haus', 4000);
  check(v.homeLabel === '0/2' && v.hint.includes(gardener.name), `Umziehen: über dem Haus „${v.homeLabel}“, Satz „${v.hint}“`);
  await sleep(400);
  const glided = await cameraAtRest();
  band = (await readVillage(page)).ui.band;
  check(
    Math.abs(glided.y - view.y) * view.zoom > 40 && roofTop(glided) >= band.y - band.h / 2 && houseBottom(glided) <= band.y + band.h / 2,
    `Umziehen: nach dem Tipp auf das Haus unter der Leiste fuhr die Kamera nicht hin (Dach bei ${roofTop(glided).toFixed(0)}, Fuß bei ${houseBottom(glided).toFixed(0)}, freier Teil ${(band.y - band.h / 2).toFixed(0)}–${(band.y + band.h / 2).toFixed(0)})`,
  );
  console.log(`  [${name}] Umziehen: Haus unter der Leiste angetippt, die Kamera fuhr ${((glided.y - view.y) * view.zoom).toFixed(0)} px – Dach jetzt bei ${roofTop(glided).toFixed(0)} px`);
  await sleep(300);
  await shot(`${name}-umziehen`);
  // K1: nach ✓ gleitet die Figur vom alten Ort zur Tür des neuen Hauses, statt zu springen.
  const sliding = sampleResident(gardener.id, 2500);
  await confirm((x) => x.tool === 'view', 'zurück auf „Anschauen“ nach dem Umzug');
  const slide = jumpsOf(await sliding);
  check(slide.total > 2 * TILE && glidOk(slide), `Umziehen: ${gardener.name} sprang nach ✓ (${JSON.stringify(slide)})`);
  console.log(`  [${name}] Umziehen: ${gardener.name} gleitet ${slide.total.toFixed(0)} Welt-px (erstes gleitendes Bild ${slide.startGap.toFixed(1)} px vom alten Ort, ${slide.frames} Bilder, größter Schritt ${slide.biggest.toFixed(0)})`);
  state = await waitForResidents(page, (s) => s.card === String(gardener.id) && s.residents.find((r) => r.id === gardener.id && r.homeId === yellow.id), `${gardener.name} im gelben Haus, seine Karte offen`, 4000);
  check(state.found.mood === 'sad' && state.found.reason === 'reason.far', `Nach dem Umzug weit weg: ${gardener.name} ${state.found.mood}/${state.found.reason}, erwartet traurig (weiter Weg)`);
  v = await waitForVillage(page, (x) => x.ui.card?.mood === 'sad', 'die Karte mit der traurigen Stimmung', 4000);
  checkCard(v, size, 'Karte nach dem Umzug');
  await sleep(400);
  await shot(`${name}-traurig`);
  await closeCard('Karte nach dem Umzug');

  // --- Arbeitstempo mit dem traurigen Gärtner: langsamer, aber er arbeitet ---
  step('Arbeitstempo: der traurige Gärtner');
  village = await readVillage(page);
  check(paceOf(village, garden.id) === pace.sad && village.producers.find((p) => p.id === garden.id)?.status === 'working', `Arbeitstempo traurig: ${JSON.stringify(village.producers.find((p) => p.id === garden.id))}, erwartet ${pace.sad} % bei der Arbeit`);
  const sadRound = await measureRound(page, garden.id, 3);
  check(same(sadRound.paces, [pace.sad]) && Math.abs(sadRound.ticks - roundOf(pace.sad)) <= 3, `Arbeitstempo traurig: ${sadRound.ticks.toFixed(1)} Ticks pro Runde bei ${JSON.stringify(sadRound.paces)} %, erwartet ${roundOf(pace.sad)}`);
  check(sadRound.ticks > happyRound.ticks * 1.3, `Arbeitstempo: traurig ${sadRound.ticks.toFixed(1)} Ticks pro Runde, fröhlich ${happyRound.ticks.toFixed(1)} – erwartet deutlich länger`);
  console.log(
    `  [${name}] Beerengarten: fröhlich ${happyRound.ticks.toFixed(1)} Ticks pro Runde (erwartet ${roundOf(pace.happy)}), traurig ${sadRound.ticks.toFixed(1)} (erwartet ${roundOf(pace.sad)}, normal wären ${roundOf(pace.normal)})`,
  );

  // --- Eine Blume am fernen Haus: wieder normal ---
  step('Stimmung: eine Blume am fernen Haus');
  await pickItem('flower');
  await tapTile({ x: yellow.x + 2, y: yellow.y + 1 });
  await waitForVillage(page, (x) => x.preview === 'place:ok', 'grüne Vorschau für die Blume am gelben Haus');
  before = (await readVillage(page)).buildings.length;
  await confirm((x) => x.buildings.length === before + 1, 'die Blume am gelben Haus');
  state = await waitForResidents(page, (s) => s.residents.find((r) => r.id === gardener.id && r.mood === 'normal'), `${gardener.name} normal nach der Blume`, 5000);
  check(state.found.reason === 'reason.decoFar', `Blume am fernen Haus: Grund ${state.found.reason}, erwartet „Deko am Haus, aber weiter Weg“`);
  await exitTool();
  village = await waitForVillage(page, (x) => paceOf(x, garden.id) === pace.normal, `Arbeitstempo ${pace.normal} % nach der Blume`, 4000);

  // --- Neuladen: Zuhause und Stimmung bleiben ---
  step('Wohnen: Neuladen behält Zuhause und Stimmung');
  const homesOf = (residents) => residents.map((r) => [r.id, r.name, r.homeId, r.mood, r.reason]).sort((a, b) => a[0] - b[0]);
  const homesBefore = homesOf((await readResidents(page)).residents);
  await waitForRecord(page, (r) => r.residents?.find((x) => x.id === gardener.id)?.home === yellow.id && r.buildings?.length === village.buildings.length, 'den Umzug und die Blume im Spielstand');
  await enterIsland(page, profile, waitForScene, SAVE_URL);
  village = await waitForVillage(page, (x) => x.save.start !== undefined && x.buildings.length > 0, 'das neu geladene Dorf', 20_000);
  check(village.save.start === 'loaded', `Neuladen: ${JSON.stringify(village.save)}`);
  state = await waitForResidents(page, (s) => s.residents.length === 3, 'die drei Bewohner nach dem Neuladen');
  check(same(homesOf(state.residents), homesBefore), `Neuladen: ${JSON.stringify(homesOf(state.residents))} statt ${JSON.stringify(homesBefore)}`);
  check(paceOf(village, garden.id) === pace.normal && paceOf(village, market.id) === pace.happy, `Neuladen: Arbeitstempo ${JSON.stringify(village.producers)}`);
  const record = await readRecord(page);
  check(record?.version === SAVE_VERSION && record.residents?.every((r) => Number.isInteger(r.meal) && typeof r.hungry === 'boolean'), `Neuladen: Spielstand Version ${record?.version}, Essen ${JSON.stringify(record?.residents?.map((r) => [r.meal, r.hungry]))}`);

  // --- Ein volles Dorf mit Blumen: Herzen und Wolken nur, wo sie hingehören; die Bildzeit ---
  step('Stimmung: volles Dorf mit Blumen (40 Bewohner)');
  const crowded = crowdedRecord(fresh, names, { residents: 40, houses: 10, producers: 6 });
  const decorated = decorateHouses(crowded.record, 2);
  console.log(`  [${name}] volles Dorf: ${crowded.houses} große Häuser, ${decorated.flowers} davon mit Blume, ${crowded.producers} Produktionsgebäude, ${crowded.record.residents.length} Bewohner`);
  await setRecordFromOutside(page, decorated.record);
  await enterIsland(page, profile, waitForScene, SAVE_URL);
  village = await waitForVillage(page, (x) => x.save.start !== undefined && x.buildings.length > 0, 'das volle Dorf', 20_000);
  check(village.save.start === 'loaded', `Volles Dorf: ${JSON.stringify(village.save)}, erwartet „loaded“`);
  state = await waitForResidents(page, (s) => s.residents.length === 40 && s.residents.every((r) => r.x !== undefined), 'die 40 Bewohner', 10_000);
  const moodCount = (residents) => Object.fromEntries(MOODS.map((m) => [m, residents.filter((r) => r.mood === m).length]));
  const counted = moodCount(state.residents);
  check(counted.happy >= 6 && counted.normal >= 1, `Volles Dorf: Stimmungen ${JSON.stringify(counted)}, erwartet fröhliche (Blumen) und normale`);
  // 16 s lang zweimal pro Sekunde: Herzen und Wolken erscheinen, aber nie länger über einem Kopf mit normaler Stimmung
  // (die Figur sieht eine neue Stimmung höchstens eine Sekunde später).
  const signs = { happy: 0, sad: 0 };
  const normalInARow = new Map();
  let wrongSign;
  for (let i = 0; i < 32; i += 1) {
    const { residents } = await readResidents(page);
    for (const r of residents) {
      if (r.sign === 1 && r.mood !== 'normal') signs[r.mood] += 1;
      const row = r.sign === 1 && r.mood === 'normal' ? (normalInARow.get(r.id) ?? 0) + 1 : 0;
      normalInARow.set(r.id, row);
      if (row >= 3) wrongSign ??= r;
    }
    await sleep(500);
  }
  console.log(`  [${name}] volles Dorf: Stimmungen ${JSON.stringify(counted)}; in 16 s ${signs.happy}× ein Herz, ${signs.sad}× eine Wolke gesehen`);
  check(signs.happy > 0, 'Volles Dorf: in 16 s kein einziges Herz über einem fröhlichen Bewohner');
  check(wrongSign === undefined, `Volles Dorf: ${wrongSign?.name} zeigt mit normaler Stimmung ein Zeichen`);
  await shot(`${name}-stimmung-dorf`);
  await measureFrameTime({ context, page, check, name });

  // --- Kleine Handys: die Karte mit Stimmung, Tipp und „Umziehen“ passt ---
  if (profile.name === 'tablet') {
    for (const [w, h, label, rows] of [
      [320, 568, 'hochkant', 6],
      [568, 320, 'quer', 4],
    ]) {
      step(`Stimmung: Karte auf dem Handy ${label} (${w}×${h})`);
      await page.setViewportSize({ width: w, height: h });
      await sleep(800);
      await cameraAtRest();
      await sleep(300);
      const phone = { width: w, height: h };
      const { target, village: pv } = await tapResident(phone, `${w}×${h}`, NO_OFFSET, (r) => r.mood === 'happy');
      checkCard(pv, phone, `Karte ${w}×${h}`);
      const { card } = pv.ui;
      const button = pv.ui['card-move'];
      check(card.rows === rows && card.mood === 'happy', `Karte ${w}×${h}: ${card.rows} Zeilen, Stimmung „${card.mood}“ – erwartet ${rows} Zeilen, fröhlich (${target.name})`);
      check(button !== undefined && button.h >= 48 && button.w >= 72 && button.font >= 14 && spotInside(button, card), `Karte ${w}×${h}: „Umziehen“ ${JSON.stringify(button)} in ${JSON.stringify(card)}`);
      console.log(`  [${name}] Karte ${w}×${h}: ${card.w}×${card.h} px, ${card.rows} Zeilen zu ${card.font} px, „Umziehen“ ${button?.w}×${button?.h} px mit ${button?.font} px`);
      await sleep(400);
      await shot(`${name}-stimmung-handy-${label}`);
      await closeCard(`${w}×${h}`);
      await sleep(400);
    }
    await page.setViewportSize(size);
    await sleep(800);
  }
}

/** Startet das Spiel (Tippen zum Spielen) und wartet auf die Insel. */
// --- M8: Kinderfreundlich (geführter Start, Eltern-Menü, Tageslimit, Gute Nacht) ---

/** Die Einstellungen der Eltern (PIN, Limit, Tageskonto, geführter Start) liegen in einer eigenen Datenbank (`settingsStore.ts`). */
const SETTINGS_DB = 'village-settings/Schlumpfwelt/';
/** Ein übersprungener geführter Start (`storeTutorial` in `src/ui/tutorial.ts`). */
const TUTORIAL_SKIPPED = { format: 'village-tutorial', status: 'skipped' };
const TUTORIAL_STEPS = ['resident', 'shop', 'deco', 'coins', 'house', 'path', 'praise'];
const TEST_PIN = '2468';

/** Die sichtbaren Texte des Spiels (wie `t()` in `src/data/texts.ts`: Platzhalter aus dem Theme und aus `params`). */
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');
const GAME_TEXTS = JSON.parse(readFileSync(path.join(DATA_DIR, 'texts.de.json'), 'utf8'));
const GAME_THEME = JSON.parse(readFileSync(path.join(DATA_DIR, 'theme.json'), 'utf8'));
function gameText(key, params = {}) {
  const values = { gameName: GAME_THEME.gameName, ...GAME_THEME.terms, ...params };
  return String(GAME_TEXTS[key] ?? `?${key}?`).replace(/\{(\w+)\}/g, (all, name) => (name in values ? String(values[name]) : all));
}

/**
 * Passt der Satz des geführten Starts zur Hand (Korrekturrunde 1)? Er steht dort, wo das Kind hinschaut (Hinweisleiste,
 * feste Zeile des Shops, Tipp-Zeile der Bewohner-Karte) und sagt, was die Hand zeigt. Nur bei Zielen, die das offene
 * Werkzeug selbst erklärt (Platz, ✓, Anfang und Ende des Wegs), darf der Hinweis des Werkzeugs dastehen.
 * Gibt `undefined` zurück, wenn alles passt, sonst den Grund.
 */
function tutorialMismatch(tutorial, village, residentCard) {
  if (!tutorial.sentence) return undefined;
  const want = gameText(`tutorial.${tutorial.sentence}`);
  const where = village.tool === 'shop' ? 'shop' : residentCard !== '' ? 'card' : 'hint';
  const toolOwn = /^(place:|pathStart$|pathEnd$|spot:confirm$)/.test(tutorial.target) && village.tool !== 'view' && village.tool !== 'shop';
  if (tutorial.at === where && tutorial.said === want) return undefined;
  if (toolOwn && tutorial.at === '' && village.hint !== '') return undefined;
  // Die Infokarte eines Gebäudes hat keine Zeile dafür (die Hand zeigt auf ihr ✕).
  if (village.card !== '' && tutorial.target === 'spot:card-close') return undefined;
  // Hinter einer Meldung (Neu im Shop, Erklärung) wartet die Hand.
  if (tutorial.hx === undefined && where === 'hint' && tutorial.at === '') return undefined;
  // Eine gesperrte Karte hat ihren Satz in der Zeile des Shops (er geht vor).
  if (where === 'shop' && village.tip !== '') return undefined;
  return `Satz „${tutorial.said}“ (${tutorial.at || 'nirgends'}, Hinweis „${village.hint}“) passt nicht zu Ziel ${tutorial.target}: erwartet „${want}“ in ${where}`;
}

/** Der lokale Kalendertag der Seite (`localDayKey`), wie ihn das Spiel rechnet. */
async function localDay(page) {
  return page.evaluate(() => {
    const d = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
}

/** Ein Eintrag der Eltern-Einstellungen im gespeicherten Format (`toStored` in `src/parent/settings.ts`). */
function settingsEntry({ day, pin = null, limitMinutes = 0, usedMs = 0, extraMinutes = 0, tutorial }) {
  return { format: 'village-parent', version: 1, pin, limitMinutes, day, usedMs, extraMinutes, ...(tutorial === undefined ? {} : { tutorial }) };
}

/** Der gespeicherte Eintrag der Eltern-Einstellungen (`null`, wenn keiner da ist). */
async function readSettingsEntry(page) {
  return page.evaluate(
    (name) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open(name, 1);
        open.onupgradeneeded = () => open.result.createObjectStore('settings');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('settings').objectStore('settings').get('parent');
          request.onsuccess = () => {
            db.close();
            resolve(request.result ?? null);
          };
          request.onerror = () => reject(request.error);
        };
      }),
    SETTINGS_DB,
  );
}

/**
 * Schreibt die Eltern-Einstellungen von außen (wie `setRecordFromOutside`: erst weg vom Spiel, das beim Verlassen noch
 * einmal speichert). So beginnt ein Test kurz vor dem Ende der Spielzeit, ohne einen geheimen Adress-Parameter.
 */
async function setSettingsFromOutside(page, value) {
  await page.goto(`${URL}manifest.webmanifest`, { waitUntil: 'load' });
  await page.evaluate(
    ({ name, data }) =>
      new Promise((resolve, reject) => {
        const open = indexedDB.open(name, 1);
        open.onupgradeneeded = () => open.result.createObjectStore('settings');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const transaction = db.transaction('settings', 'readwrite');
          transaction.objectStore('settings').put(data, 'parent');
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    { name: SETTINGS_DB, data: value },
  );
}

/**
 * Die älteren Prüfungen (M2–M7) sehen keinen geführten Start: Er ist in den Einstellungen des Browsers schon
 * übersprungen – auch ein Dorf mit `&nosave=1` liest das (und schreibt es unverändert zurück).
 */
async function skipTutorialForOlderChecks(page) {
  await setSettingsFromOutside(page, settingsEntry({ day: await localDay(page), tutorial: TUTORIAL_SKIPPED }));
}

/** Geführter Start, Eltern-Menü, Tageskonto und Nacht aus `<html data-tutorial|parent|parent-text|limit|night|bedtime>` (`markParent`). */
async function readParent(page) {
  return page.evaluate(() => {
    const d = document.documentElement.dataset;
    return {
      tutorial: JSON.parse(d.tutorial ?? '{}'),
      parent: d.parent ?? '',
      parentText: d.parentText ?? '',
      limit: JSON.parse(d.limit ?? '{}'),
      night: JSON.parse(d.night ?? '{}'),
      bedtime: d.bedtime === '1',
      residentCard: d.residentCard ?? '',
    };
  });
}

async function waitForParent(page, predicate, what, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let state;
  while (Date.now() < deadline) {
    state = await readParent(page);
    if (predicate(state)) return state;
    await sleep(120);
  }
  throw new Error(`Zeitüberschreitung beim Warten auf ${what} (Stand: Tutorial ${JSON.stringify(state?.tutorial)}, Eltern „${state?.parent}“, Limit ${JSON.stringify(state?.limit)}, Nacht ${JSON.stringify(state?.night)})`);
}

/** Liegt der Knopf (Mitte, `w`, `h` in CSS-px) ganz im Bild und ist mindestens `min` groß? */
function spotFits(spot, size, min = 48) {
  return (
    spot !== undefined &&
    spot.w >= min - 0.01 &&
    spot.h >= min - 0.01 &&
    spot.x - spot.w / 2 >= -0.5 &&
    spot.y - spot.h / 2 >= -0.5 &&
    spot.x + spot.w / 2 <= size.width + 0.5 &&
    spot.y + spot.h / 2 <= size.height + 0.5
  );
}

function spotsOverlap(a, b) {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w - 0.5 && Math.abs(a.y - b.y) * 2 < a.h + b.h - 0.5;
}

/**
 * Das Eltern-Menü (Ziffernfeld oder Einstellungen) passt: alle Knöpfe im Bild, mindestens 48 px, keiner überdeckt
 * einen anderen.
 */
function checkParentSpots(village, size, check, when) {
  const names = Object.keys(village.ui).filter((key) => /^(pin-|limit-|parent-(close|extra|pin|tutorial))/.test(key));
  check(names.length > 0, `${when}: keine Knöpfe im Eltern-Menü`);
  for (const key of names) {
    check(spotFits(village.ui[key], size), `${when}: Knopf „${key}“ ${JSON.stringify(village.ui[key])} zu klein oder nicht ganz im Bild (${size.width}×${size.height})`);
  }
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      check(!spotsOverlap(village.ui[names[i]], village.ui[names[j]]), `${when}: „${names[i]}“ und „${names[j]}“ überdecken sich`);
    }
  }
  check(spotFits(village.ui['parent-panel'], size, 0), `${when}: das Feld ragt aus dem Bild`);
}

/**
 * M8 „Kinderfreundlich“ in einem eigenen, frischen Browser-Kontext (eigene Einstellungen, die älteren Prüfungen haben
 * den geführten Start übersprungen): geführter Start (Hand auf dem Ziel, jeder Schritt führt zum nächsten, Neuladen
 * behält den Fortschritt, ein geladenes Dorf hat keinen, Überspringen), Eltern-Menü (PIN zweimal, falsche PIN,
 * „PIN vergessen“, richtige PIN, Limit), der sanfte Satz, Abend (alle gehen heim), Nacht (Tipps verschluckt, kein Takt,
 * kein Ertrag), Neuladen in der Nacht, +10 Minuten, der nächste Tag (Playwright-Uhr, nur das Datum), Export/Import
 * ohne PIN, kleine Schirme.
 */
async function testKidFriendly({ browser, profile, check, problems, name }) {
  const context = await browser.newContext(profile.context);
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`Konsolenfehler (M8): ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`Seitenfehler (M8): ${error.message}`));
  page.on('requestfailed', (request) => problems.push(`Request fehlgeschlagen (M8): ${request.url()}`));
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`HTTP ${response.status()} (M8): ${response.url()}`);
  });
  const shot = (shotName) => page.screenshot({ path: path.join(KEEP_SCREENSHOTS.has(shotName) ? SCREENSHOT_DIR : TEMP_SCREENSHOT_DIR, `${shotName}.png`), scale: 'css' });
  const waitForScene = (scene) => page.waitForSelector(`html[data-scene="${scene}"]`, { state: 'attached', timeout: 20_000 });
  const size = { ...profile.context.viewport };
  const input = profile.context.hasTouch ? { tap: (p) => page.touchscreen.tap(p.x, p.y) } : { tap: (p) => page.mouse.click(p.x, p.y) };
  const { step, tapUi, openShop, exitTool } = buildHelpers({ page, check, size, input, name });
  const near = (a, b, tolerance) => a !== undefined && b !== undefined && Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
  /** Tippt nacheinander auf die Ziffern (zwischen zwei Tipps ein paar Bilder Zeit). */
  const typeDigits = async (digits) => {
    for (const digit of digits) {
      await tapUi(`pin-${digit}`);
      await sleep(220);
    }
  };
  /** Zahnrad → „Für Eltern“: das Ziffernfeld geht auf. */
  const openParents = async () => {
    await tapUi('menu');
    await waitForVillage(page, (v) => v.menu === 'menu' && 'menu-parent' in v.ui, 'das Menü mit „Für Eltern“');
    await tapUi('menu-parent');
    return waitForParent(page, (p) => p.parent !== 'closed' && p.parent !== '', 'das Eltern-Menü');
  };
  const closeParents = async () => {
    await tapUi('parent-close');
    await waitForParent(page, (p) => p.parent === 'closed', 'das geschlossene Eltern-Menü');
  };
  /** PIN eingeben, bis die Einstellungen da sind. */
  const unlock = async () => {
    await waitForParent(page, (p) => p.parent.startsWith('enterPin'), 'das Ziffernfeld „PIN eingeben“');
    await typeDigits(TEST_PIN);
    return waitForParent(page, (p) => p.parent.startsWith('settings'), 'die Einstellungen nach der richtigen PIN');
  };
  const tickNow = async () => (await readVillage(page)).tick;

  /**
   * Folgt der Hand des geführten Starts bis zum Ende: jeder erledigte Schritt führt zum nächsten; Satz und Hand passen
   * zusammen, ein Platz in der Welt liegt im freien Band. `reloadAt`: ab diesem Schritt einmal neu laden.
   */
  const walkTutorial = async ({ label, view, reloadAt, first }) => {
    let p;
    let v;
    const seenSteps = [first];
    const wrongSentence = new Set();
    const sentencesSeen = new Set();
    const wrongHand = new Set();
    let reloaded = reloadAt === undefined;
    const handInBar = new Set();
    let last = { key: '', at: 0 };
    const placesSeen = new Set();
    const taps = new Map();
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline) {
      p = await readParent(page);
      v = await readVillage(page);
      if (p.tutorial.status !== 'active') break;
      const stepId = p.tutorial.step;
      if (seenSteps.at(-1) !== stepId) {
        seenSteps.push(stepId);
        step(`M8${label}: Schritt „${stepId}“ – „${v.hint}“`);
      }
      const hand = p.tutorial.hx === undefined ? undefined : { x: p.tutorial.hx, y: p.tutorial.hy };
      // Satz und Hand passen zusammen (bei jedem Schritt, mit jedem Werkzeug).
      const mismatch = tutorialMismatch(p.tutorial, v, p.residentCard);
      const sentenceKey = `${stepId}:${v.tool}:${p.tutorial.target}`;
      if (mismatch && !wrongSentence.has(sentenceKey)) {
        await sleep(300);
        const again = await readParent(page);
        const vAgain = await readVillage(page);
        const still = again.tutorial.step === stepId && vAgain.tool === v.tool ? tutorialMismatch(again.tutorial, vAgain, again.residentCard) : undefined;
        if (still) {
          wrongSentence.add(sentenceKey);
          check(false, `Tutorial${label}, Schritt ${stepId} (Werkzeug ${v.tool}): ${still}`);
        }
        continue;
      }
      if (p.tutorial.sentence) sentencesSeen.add(`${p.tutorial.sentence}@${p.tutorial.at || 'tool'}`);
      // Wohin die Hand zeigen muss (nur die eindeutigen Fälle).
      let expected;
      if (stepId === 'coins') {
        expected = 'stock';
      } else if (p.residentCard !== '' && stepId !== 'resident') {
        expected = 'card-close';
      } else if (v.tool === 'view') {
        expected = { shop: 'tool-shop', deco: 'tool-shop', house: 'tool-shop', path: 'tool-path' }[stepId];
      } else if (v.tool === 'shop' && (stepId === 'deco' || stepId === 'house')) {
        const item = stepId === 'deco' ? 'item-flower' : 'item-house-red';
        expected = item in v.ui ? item : v.shop.startsWith(stepId === 'deco' ? 'deco:' : 'houses:') ? undefined : `tab-${stepId === 'deco' ? 'deco' : 'houses'}`;
      } else if ((v.tool === 'place' || v.tool === 'path') && v.ui.confirm?.enabled === true) {
        expected = 'confirm';
      }
      if (expected && !near(hand, v.ui[expected], 32) && !wrongHand.has(`${stepId}:${expected}`)) {
        // Ein Bild später noch einmal (Hand und Knöpfe werden im selben Bild gesetzt, gelesen wird zwischendurch).
        await sleep(300);
        const again = await readParent(page);
        const vAgain = await readVillage(page);
        if (again.tutorial.step === stepId && vAgain.tool === v.tool && !near({ x: again.tutorial.hx, y: again.tutorial.hy }, vAgain.ui[expected], 32)) {
          wrongHand.add(`${stepId}:${expected}`);
          check(false, `Tutorial${label}, Schritt ${stepId} (Werkzeug ${v.tool}): die Hand ${JSON.stringify(hand)} zeigt nicht auf „${expected}“ ${JSON.stringify(vAgain.ui[expected])}`);
        }
        continue;
      }
      // Ein Platz in der Welt (Blume, Haus, Anfang und Ende des Wegs) liegt immer im freien Band zwischen den Leisten,
      // ein Bewohner nie unter der Lagerleiste – sonst verdeckt die Hand den Satz, und ein Tipp erreicht die Insel nicht
      // (Korrekturrunde 2).
      const band = v.ui.band;
      const inRect = (point, spot) => spot !== undefined && Math.abs(point.x - spot.x) * 2 <= spot.w && Math.abs(point.y - spot.y) * 2 <= spot.h;
      const worldPlace = /^(place:|pathStart$|pathEnd$)/.test(p.tutorial.target ?? '');
      if (hand && ((worldPlace && !inRect(hand, band)) || (p.tutorial.target === 'resident' && inRect(hand, v.ui.stock))) && !handInBar.has(`${stepId}:${p.tutorial.target}`)) {
        await sleep(300);
        const again = await readParent(page);
        const vAgain = await readVillage(page);
        const handAgain = again.tutorial.hx === undefined ? undefined : { x: again.tutorial.hx, y: again.tutorial.hy };
        if (handAgain && again.tutorial.target === p.tutorial.target && (worldPlace ? !inRect(handAgain, vAgain.ui.band) : inRect(handAgain, vAgain.ui.stock))) {
          handInBar.add(`${stepId}:${p.tutorial.target}`);
          check(false, `Tutorial${label}, Schritt ${stepId}: die Hand ${JSON.stringify(handAgain)} auf ${again.tutorial.target} liegt in einer Leiste (freies Band ${JSON.stringify(vAgain.ui.band)}, Lager ${JSON.stringify(vAgain.ui.stock)})`);
        }
        continue;
      }
      if (worldPlace && hand && !placesSeen.has(p.tutorial.target)) {
        placesSeen.add(p.tutorial.target);
        if (label !== '') await shot(`${name}-tutorial${label.replace(/\W+/g, '-')}-${p.tutorial.target.replace(/\W+/g, '-')}`);
      }
      if (reloadAt !== undefined && p.tutorial.index >= reloadAt && !reloaded) {
        // Der Fortschritt übersteht das Neuladen (er steht in den Einstellungen, nicht im Dorf).
        reloaded = true;
        await sleep(1500);
        await enterIsland(page, profile, waitForScene, SAVE_URL);
        const after = await waitForParent(page, (x) => x.tutorial.status !== undefined, 'den geführten Start nach dem Neuladen');
        check(after.tutorial.status === 'active' && after.tutorial.index >= p.tutorial.index, `Tutorial nach dem Neuladen: ${JSON.stringify(after.tutorial)} (erwartet: weiter ab Schritt ${p.tutorial.index} „${stepId}“)`);
        console.log(`  [${name}] Neuladen bei Schritt „${stepId}“: weiter mit „${after.tutorial.step}“`);
        continue;
      }
      if (stepId === 'praise' && !hand) {
        // Das Lob endet mit dem nächsten Tipp (irgendwo), sobald es in der Hinweisleiste steht.
        // Mit dem Weg-Werkzeug kann so ein Tipp einen neuen (roten) Weg beginnen – dessen Grund geht vor das Lob
        // (Korrekturrunde 2). Dann wie ein Kind erst das Werkzeug beenden.
        if (v.tool !== 'view' && v.hint !== gameText('tutorial.praise') && 'exit' in v.ui) await tapUi('exit');
        else await input.tap({ x: view.width / 2, y: view.height * 0.42 });
        await sleep(600);
        continue;
      }
      if (!hand || stepId === 'coins') {
        // „Taler“: die Hand zeigt auf die Lagerleiste, erledigt wird es ohne Tipp, sobald der Markt verkauft.
        await sleep(400);
        continue;
      }
      const key = `${stepId}|${v.tool}|${v.preview}|${Math.round(hand.x / 8)}|${Math.round(hand.y / 8)}`;
      if (key === last.key && Date.now() - last.at < 3000) {
        await sleep(300);
        continue;
      }
      await input.tap(hand);
      taps.set(key, (taps.get(key) ?? 0) + 1);
      if (taps.get(key) === 4) console.log(`  [${name}]${label} vierter Tipp auf dasselbe Ziel ${p.tutorial.target} bei ${JSON.stringify(hand)}: Vorschau „${v.preview}“, Hinweis „${v.hint}“, Band ${JSON.stringify(v.ui.band)}, Kamera ${JSON.stringify(await readCamera(page))}`);
      last = { key, at: Date.now() };
      await sleep(700);
    }
    return { seenSteps, sentencesSeen, reloaded, placesSeen };
  };


  try {
    // --- Geführter Start: nur ein neues Dorf ---
    step('M8: neues Dorf mit ?seed=1 – der geführte Start beginnt');
    await clearRecords(page);
    await enterIsland(page, profile, waitForScene, SAVE_URL);
    let p = await waitForParent(page, (x) => x.tutorial.status === 'active' && x.tutorial.step === 'resident' && x.tutorial.hx !== undefined, 'den ersten Schritt mit der Hand', 15_000);
    let v = await readVillage(page);
    check(p.tutorial.shown === true && v.hint.startsWith('Tippe auf einen'), `Tutorial: Satz in der Hinweisleiste „${v.hint}“`);
    check(spotFits(v.ui['tutorial-skip'], size), `Tutorial: Überspringen ${JSON.stringify(v.ui['tutorial-skip'])} fehlt oder ist kleiner als 48 px`);
    check(p.limit.limit === 0 && p.limit.phase === 'day' && p.limit.pin === false && p.limit.store === 'indexedDb', `Start: Tageskonto ${JSON.stringify(p.limit)} (erwartet: kein Limit, keine PIN, IndexedDB)`);
    {
      const { residents } = await readResidents(page);
      const hand = { x: p.tutorial.hx, y: p.tutorial.hy };
      const closest = Math.min(...residents.map((r) => Math.hypot(r.sx - hand.x, r.sy - hand.y)));
      check(closest <= 60, `Tutorial: die Hand (${hand.x}, ${hand.y}) zeigt auf keinen Bewohner (nächster ${closest.toFixed(0)} px)`);
    }
    await sleep(500);
    await shot(`${name}-tutorial-hand`);

    // --- Handy quer (568×320): das freie Band zwischen den Leisten ist niedrig – die Hand ist trotzdem da (Korrekturrunde 1) ---
    step('M8: 568×320 – die Hand zeigt auf einen Bewohner, dann aufs ✕ der Karte');
    {
      const low = { width: 568, height: 320 };
      await page.setViewportSize(low);
      p = await waitForParent(page, (x) => x.tutorial.step === 'resident' && x.tutorial.hx !== undefined && x.tutorial.hx <= low.width, 'die Hand auf einem Bewohner bei 568×320', 7000);
      const { residents } = await readResidents(page);
      const hand = { x: p.tutorial.hx, y: p.tutorial.hy };
      const nearest = residents.reduce((best, r) => (Math.hypot(r.sx - hand.x, r.sy - hand.y) < Math.hypot(best.sx - hand.x, best.sy - hand.y) ? r : best), residents[0]);
      check(nearest && Math.hypot(nearest.sx - hand.x, nearest.sy - hand.y) <= 40, `568×320: die Hand ${JSON.stringify(hand)} zeigt auf keinen Bewohner`);
      v = await readVillage(page);
      check(p.tutorial.said === gameText('tutorial.resident') && v.hint === p.tutorial.said, `568×320: Satz „${p.tutorial.said}“, Hinweis „${v.hint}“`);
      // Antippen öffnet die Karte (der erste Schritt), die Hand geht aufs ✕ der Karte, die Karte sagt es. Der Bewohner
      // läuft (Headless zeichnet nur wenige Bilder pro Sekunde): wie ein Kind notfalls noch einmal tippen.
      let opened = false;
      for (let attempt = 0; attempt < 4 && !opened; attempt += 1) {
        const now = attempt === 0 ? p : await waitForParent(page, (x) => x.tutorial.step !== 'resident' || x.tutorial.hx !== undefined, 'die Hand auf einem Bewohner (noch einmal)', 7000);
        if (now.tutorial.step === 'resident') await input.tap({ x: now.tutorial.hx, y: now.tutorial.hy });
        opened = await waitForParent(page, (x) => x.residentCard !== '', 'die Karte des Bewohners', 2500).then(
          () => true,
          () => false,
        );
      }
      p = await waitForParent(page, (x) => x.tutorial.step === 'shop' && x.residentCard !== '' && x.tutorial.target === 'spot:card-close' && x.tutorial.hx !== undefined, 'die Karte mit der Hand auf ihrem ✕', 6000);
      v = await readVillage(page);
      check(near({ x: p.tutorial.hx, y: p.tutorial.hy }, v.ui['card-close'], 32), `568×320: die Hand ${JSON.stringify([p.tutorial.hx, p.tutorial.hy])} zeigt nicht aufs ✕ der Karte ${JSON.stringify(v.ui['card-close'])}`);
      check(p.tutorial.at === 'card' && p.tutorial.said === gameText('tutorial.closeCard'), `568×320: auf der Karte steht „${p.tutorial.said}“ (${p.tutorial.at})`);
      await shot(`${name}-tutorial-karte-quer`);
      await tapUi('card-close');
      p = await waitForParent(page, (x) => x.residentCard === '' && x.tutorial.target === 'spot:tool-shop' && x.tutorial.hx !== undefined, 'die Hand auf dem Shop nach dem ✕', 6000);
      v = await readVillage(page);
      check(v.hint === gameText('tutorial.shop') && near({ x: p.tutorial.hx, y: p.tutorial.hy }, v.ui['tool-shop'], 32), `568×320 nach dem ✕: Hinweis „${v.hint}“, Hand ${JSON.stringify([p.tutorial.hx, p.tutorial.hy])}`);
      await page.setViewportSize(size);
      await sleep(1200);
    }

    // Der Hand folgen: jeder erledigte Schritt führt zum nächsten. Unterwegs einmal neu laden.
    const walk = await walkTutorial({ label: '', view: size, reloadAt: 3, first: 'resident' });
    const { seenSteps, sentencesSeen, reloaded } = walk;
    p = await readParent(page);
    check(p.tutorial.status === 'done', `Tutorial: am Ende ${JSON.stringify(p.tutorial)} (erwartet: fertig)`);
    // „Taler“ kann schon nach einem Bild erledigt sein (der Markt verkauft gerade) – dann sieht der Test ihn nicht.
    const mustSee = TUTORIAL_STEPS.filter((id) => id !== 'coins');
    check(mustSee.every((id) => seenSteps.includes(id)) && seenSteps.every((id, i) => i === 0 || TUTORIAL_STEPS.indexOf(id) > TUTORIAL_STEPS.indexOf(seenSteps[i - 1])), `Tutorial: Schritte ${seenSteps.join(' → ')} (erwartet ${TUTORIAL_STEPS.join(' → ')})`);
    check(reloaded, 'Tutorial: kein Neuladen mitten im geführten Start geprüft');
    console.log(`  [${name}] geführter Start: ${seenSteps.join(' → ')}, fertig; Sätze: ${[...sentencesSeen].join(', ')}`);
    check(sentencesSeen.has('shop@hint') && [...sentencesSeen].some((x) => x.endsWith('@shop')), `Tutorial: Sätze ${[...sentencesSeen].join(', ')} (erwartet u. a. „shop“ in der Hinweisleiste und einen Satz in der Zeile des Shops)`);
    await sleep(1000);
    p = await readParent(page);
    check(p.tutorial.hx === undefined && !p.tutorial.shown, `Tutorial: nach dem Ende noch Hand oder Satz ${JSON.stringify(p.tutorial)}`);

    // --- Ein geladenes Dorf (ohne Eintrag in den Einstellungen) hat keinen geführten Start ---
    step('M8: geladenes Dorf ohne Fortschritt – kein geführter Start');
    await setSettingsFromOutside(page, settingsEntry({ day: await localDay(page) }));
    await enterIsland(page, profile, waitForScene, SAVE_URL);
    p = await waitForParent(page, (x) => x.tutorial.status !== undefined, 'den Stand des geführten Starts');
    v = await readVillage(page);
    check(v.save.start === 'loaded', `Geladenes Dorf: Start „${v.save.start}“`);
    check(p.tutorial.status === 'done' && p.tutorial.hx === undefined && !p.tutorial.shown && !('tutorial-skip' in v.ui), `Geladenes Dorf: geführter Start ${JSON.stringify(p.tutorial)}`);

    // --- Eltern-Menü: PIN zweimal setzen (erst falsch wiederholt) ---
    step('M8: Eltern-Menü – PIN setzen');
    p = await openParents();
    check(p.parent === 'newPin:parent.firstPin' && p.parentText === gameText('parent.firstPin'), `Eltern-Menü beim ersten Mal: „${p.parent}“, „${p.parentText}“ (erwartet: neue PIN, wer zuerst wählt)`);
    v = await readVillage(page);
    checkParentSpots(v, size, check, 'Ziffernfeld');
    check(!('pin-forgot' in v.ui), 'Neue PIN: „PIN vergessen“ ist zu sehen');
    await typeDigits(TEST_PIN.slice(0, 2));
    await sleep(400);
    await shot(`${name}-eltern-pin`);
    await typeDigits(TEST_PIN.slice(2));
    await waitForParent(page, (x) => x.parent.startsWith('repeatPin'), 'die Frage nach der Wiederholung');
    await typeDigits('1357');
    p = await waitForParent(page, (x) => x.parent === 'newPin:parent.pinMismatch', 'den Satz „nicht gleich“');
    await typeDigits(TEST_PIN);
    await waitForParent(page, (x) => x.parent.startsWith('repeatPin'), 'die Wiederholung');
    // ⌫ löscht eine Ziffer.
    await typeDigits(TEST_PIN.slice(0, 3));
    await tapUi('pin-back');
    await sleep(220);
    await typeDigits(TEST_PIN.slice(2));
    p = await waitForParent(page, (x) => x.parent === 'settings:parent.pinSaved', 'die Einstellungen mit „PIN gespeichert“');
    check(p.limit.pin === true, 'PIN: im Tageskonto steht keine PIN');
    v = await readVillage(page);
    checkParentSpots(v, size, check, 'Einstellungen');
    check(v.ui['limit-0']?.active === true, 'Einstellungen: „Aus“ ist nicht gewählt');
    check(!('parent-extra' in v.ui), 'Einstellungen ohne Limit: „+10 Minuten“ ist zu sehen');
    const stored = await readSettingsEntry(page);
    check(stored?.pin && typeof stored.pin.hash === 'string' && !JSON.stringify(stored).includes(TEST_PIN), `PIN: gespeichert wird ${JSON.stringify(stored?.pin)} (erwartet: Hash, nie die Ziffern)`);

    // „Tutorial noch einmal“, dann überspringen.
    step('M8: „Tutorial noch einmal“ und Überspringen');
    await tapUi('parent-tutorial');
    // Das Eltern-Feld geht dabei zu: das Kind sieht gleich die Hand.
    p = await waitForParent(page, (x) => x.tutorial.status === 'active' && x.parent === 'closed', 'den neuen geführten Start mit geschlossenem Eltern-Feld');

    // Den ganzen Start einmal auf dem Handy quer (568×320) bis zum Lob: Blume, Haus und Weg liegen im freien Band
    // zwischen den Leisten, nie hinter Lager- oder Hinweisleiste (Korrekturrunde 2). In einem neuen Dorf (das erste Haus
    // hat Holz gekostet, für ein zweites reicht es nicht); der begonnene Start steht in den Einstellungen und läuft weiter.
    step('M8: der ganze geführte Start auf 568×320');
    {
      const low = { width: 568, height: 320 };
      await sleep(800);
      await clearRecords(page);
      await enterIsland(page, profile, waitForScene, SAVE_URL);
      p = await waitForParent(page, (x) => x.tutorial.status === 'active' && x.tutorial.step === 'resident', 'den geführten Start im neuen Dorf');
      await page.setViewportSize(low);
      await sleep(1200);
      const lowWalk = await walkTutorial({ label: ' 568×320', view: low, first: 'resident' });
      p = await readParent(page);
      const mustSee = TUTORIAL_STEPS.filter((id) => id !== 'coins');
      check(p.tutorial.status === 'done' && mustSee.every((id) => lowWalk.seenSteps.includes(id)), `568×320: geführter Start ${lowWalk.seenSteps.join(' → ')}, am Ende ${JSON.stringify(p.tutorial)} (erwartet: alle Schritte bis zum Lob)`);
      check(['place:flower', 'place:house-red'].every((target) => lowWalk.placesSeen.has(target)), `568×320: die Hand zeigte auf ${[...lowWalk.placesSeen].join(', ')} (erwartet: Platz für Blume und Haus im freien Band)`);
      console.log(`  [${name}] 568×320: ${lowWalk.seenSteps.join(' → ')}, Plätze im Band: ${[...lowWalk.placesSeen].join(', ')}`);
      await page.setViewportSize(size);
      await sleep(1200);
      // Der Weg zum Haus lässt das Werkzeug an (das Lob kam darüber): zurück zum Anschauen, dort ist das Zahnrad.
      if ((await readVillage(page)).tool !== 'view') await exitTool();
    }
    await openParents();
    await unlock();
    await tapUi('parent-tutorial');
    p = await waitForParent(page, (x) => x.tutorial.status === 'active' && x.parent === 'closed', 'den geführten Start noch einmal');
    // Erst wenn der Satz des Starts dasteht (eine Meldung wie „Neu im Shop“ hat ein eigenes ✕ an derselben Stelle).
    for (let attempt = 0; attempt < 3; attempt += 1) {
      v = await waitForVillage(page, (x) => 'tutorial-skip' in x.ui && x.hint === gameText('tutorial.resident'), 'den Knopf zum Überspringen neben dem Satz des Starts', 15_000);
      await tapUi('tutorial-skip');
      const skipped = await waitForParent(page, (x) => x.tutorial.status === 'skipped', 'den übersprungenen Start', 3000).then(
        () => true,
        () => false,
      );
      if (skipped) break;
    }
    p = await waitForParent(page, (x) => x.tutorial.status === 'skipped', 'den übersprungenen Start');
    v = await waitForVillage(page, (x) => x.hint.startsWith('Alles klar'), 'den Satz nach dem Überspringen');
    await sleep(500);
    v = await readVillage(page);
    p = await readParent(page);
    check(!('tutorial-skip' in v.ui) && p.tutorial.hx === undefined, `Überspringen: Knopf ${JSON.stringify(v.ui['tutorial-skip'])} oder Hand ${JSON.stringify(p.tutorial)} noch da`);
    await sleep(800);
    await enterIsland(page, profile, waitForScene, SAVE_URL);
    p = await waitForParent(page, (x) => x.tutorial.status !== undefined, 'den Stand nach dem Neuladen');
    check(p.tutorial.status === 'skipped' && p.tutorial.hx === undefined, `Überspringen gilt für immer: nach dem Neuladen ${JSON.stringify(p.tutorial)}`);

    // --- Falsche PIN, „PIN vergessen“, richtige PIN ---
    step('M8: falsche PIN, „PIN vergessen“, richtige PIN');
    p = await openParents();
    check(p.parent.split(':')[0] === 'enterPin', `Eltern-Menü mit PIN: „${p.parent}“`);
    v = await readVillage(page);
    check(spotFits(v.ui['pin-forgot'], size), '„PIN vergessen“ fehlt oder ist kleiner als 48 px');
    await typeDigits('1111');
    p = await waitForParent(page, (x) => x.parent === 'enterPin:parent.pinWrong', 'den freundlichen Satz zur falschen PIN');
    await typeDigits('9999');
    await waitForParent(page, (x) => x.parent === 'enterPin:parent.pinWrong', 'die zweite falsche PIN');
    await tapUi('pin-forgot');
    p = await waitForParent(page, (x) => x.parent === 'question:parent.question', 'die Rechenfrage');
    let numbers = (p.parentText.match(/\d+/g) ?? []).map(Number);
    check(numbers.length === 2 && numbers.every((n) => n >= 12 && n <= 29), `Rechenfrage: „${p.parentText}“`);
    await typeDigits('100');
    // Die neue Aufgabe steht sofort im Satz („Leider falsch. Wie viel ist 17 × 23?“).
    p = await waitForParent(page, (x) => x.parent === 'question:parent.questionWrong', 'den Satz zur falschen Antwort');
    numbers = (p.parentText.match(/\d+/g) ?? []).map(Number);
    check(p.parentText.startsWith('Leider falsch') && numbers.length === 2 && numbers.every((n) => n >= 12 && n <= 29), `Falsche Antwort: „${p.parentText}“ (erwartet: die neue Aufgabe im Satz)`);
    await typeDigits(String(numbers[0] * numbers[1]));
    await waitForParent(page, (x) => x.parent === 'newPin:parent.questionRight', 'die neue PIN nach der richtigen Antwort');
    // Wieder dieselbe PIN (der Test kennt sie), dann zu – und mit der richtigen PIN hinein.
    await typeDigits(TEST_PIN);
    await waitForParent(page, (x) => x.parent.startsWith('repeatPin'), 'die Wiederholung');
    await typeDigits(TEST_PIN);
    await waitForParent(page, (x) => x.parent.startsWith('settings'), 'die Einstellungen');
    await closeParents();
    await openParents();
    await typeDigits('1112');
    await waitForParent(page, (x) => x.parent === 'enterPin:parent.pinWrong', 'die falsche PIN');
    await unlock();
    await closeParents();

    // --- „Bald wird es Abend“ kommt, während der Shop offen ist: der Satz wartet, bis die Hinweisleiste ihn zeigt ---
    step('M8: der sanfte Satz geht unter dem Shop nicht verloren');
    const entry = await readSettingsEntry(page);
    const today = await localDay(page);
    await setSettingsFromOutside(page, { ...entry, day: today, usedMs: 10 * 60_000 - 8000, limitMinutes: 15, extraMinutes: 0 });
    await enterIsland(page, profile, waitForScene, SAVE_URL);
    await openShop();
    p = await waitForParent(page, (x) => x.limit.warned === true, 'den sanften Satz (unter dem offenen Shop)', 20_000);
    v = await readVillage(page);
    check(v.shop !== 'closed' && v.hint === '', `Unter dem Shop: Shop ${v.shop}, Hinweis „${v.hint}“`);
    // Ein Tipp in den Shop und das Schließen mit ✕ löschten früher den nie gezeigten Satz.
    await tapUi('tab-deco');
    await sleep(300);
    await tapUi('shop-close');
    // („Neu im Shop“ geht vor, höchstens 7 s.)
    v = await waitForVillage(page, (x) => x.shop === 'closed' && x.hint.startsWith('Bald wird es Abend'), 'den sanften Satz nach dem Schließen des Shops', 12_000).catch(async (error) => {
      throw new Error(`${error.message}; Hinweis „${(await readVillage(page)).hint}“, Konto ${JSON.stringify((await readParent(page)).limit)}`);
    });
    // Gezeigt: der nächste Tipp nimmt ihn weg.
    await sleep(500);
    await input.tap({ x: size.width / 2, y: size.height * 0.45 });
    await waitForVillage(page, (x) => !x.hint.startsWith('Bald wird es Abend'), 'den Hinweis ohne den sanften Satz nach dem nächsten Tipp', 6000);

    // --- Tageslimit: kurz vor dem Ende (von außen ins Tageskonto geschrieben), Limit 15 Minuten ---
    step('M8: Limit 15 Minuten, 14:40 schon gespielt');
    await setSettingsFromOutside(page, { ...entry, day: today, usedMs: 14 * 60_000 + 40_000, limitMinutes: 0, extraMinutes: 0 });
    await enterIsland(page, profile, waitForScene, SAVE_URL);
    p = await waitForParent(page, (x) => x.limit.used >= 880, 'das Tageskonto mit 14:40');
    check(p.limit.phase === 'day' && p.limit.limit === 0 && p.limit.warned === false, `Vor dem Limit: ${JSON.stringify(p.limit)}`);
    await openParents();
    await unlock();
    await tapUi('limit-15');
    p = await waitForParent(page, (x) => x.limit.limit === 15, 'das Limit 15');
    v = await waitForVillage(page, (x) => x.ui['limit-15']?.active === true, 'den gewählten Knopf „15“');
    await sleep(400);
    await shot(`${name}-eltern-einstellungen`);
    const usedBefore = (await readParent(page)).limit.used;
    await sleep(2000);
    check((await readParent(page)).limit.used === usedBefore, 'Eltern-Menü offen: die Spielzeit läuft weiter');
    await closeParents();
    // „Neu im Shop“ geht vor (höchstens 7 s), danach steht der sanfte Satz da.
    v = await waitForVillage(page, (x) => x.hint.startsWith('Bald wird es Abend'), 'den sanften Satz vor dem Ende', 15_000).catch(async (error) => {
      throw new Error(`${error.message}; Hinweis „${(await readVillage(page)).hint}“, Konto ${JSON.stringify((await readParent(page)).limit)}`);
    });
    p = await readParent(page);
    check(p.limit.warned === true && p.limit.phase === 'day', `Sanfter Satz: ${JSON.stringify(p.limit)}`);
    check(!/\d/.test(v.hint), `Sanfter Satz ohne Countdown: „${v.hint}“`);
    await sleep(500);
    await shot(`${name}-bald-abend`);

    // --- Abend: es wird wärmer und dunkler, alle gehen heim, Tipps tun nichts ---
    step('M8: Abend');
    p = await waitForParent(page, (x) => x.limit.phase === 'dusk', 'den Abend', 45_000);
    p = await waitForParent(page, (x) => x.bedtime, 'die Schlafenszeit in der Simulation', 3000);
    const { residents: atDusk } = await readResidents(page);
    check(atDusk.every((r) => r.activity !== 'work' && !r.carrying), `Abend: ${JSON.stringify(atDusk.map((r) => [r.name, r.activity, r.carrying]))} (erwartet: niemand arbeitet oder trägt)`);
    p = await waitForParent(page, (x) => x.night.dark >= 0.2 || x.limit.phase === 'night', 'den dunkleren Abend', 15_000);
    check(p.night.blocks === true && p.night.warm > 0, `Abend: Ebene ${JSON.stringify(p.night)}`);
    v = await readVillage(page);
    await input.tap(v.ui['tool-shop']);
    await sleep(600);
    v = await readVillage(page);
    check(v.shop === 'closed' && v.tool === 'view', `Abend: ein Tipp auf „Shop“ hat etwas getan (Shop ${v.shop}, Werkzeug ${v.tool})`);
    await shot(`${name}-abend`);

    // --- Nacht: alle im Bett, kein Takt, kein Ertrag, Tipps verschluckt ---
    step('M8: Gute Nacht');
    p = await waitForParent(page, (x) => x.limit.phase === 'night', 'die Nacht', 30_000);
    p = await waitForParent(page, (x) => x.night.sky >= 1, 'Mond und Sterne', 6000);
    const { residents: atNight } = await readResidents(page);
    check(atNight.length > 0 && atNight.every((r) => r.activity === 'sleep'), `Nacht: ${JSON.stringify(atNight.map((r) => [r.name, r.activity]))} (erwartet: alle schlafen)`);
    v = await readVillage(page);
    check(spotFits(v.ui['night-parent'], size, 64) && v.ui['night-parent'].x < size.width / 3 && v.ui['night-parent'].y > size.height * 0.6, `Nacht: Eltern-Knopf ${JSON.stringify(v.ui['night-parent'])} (erwartet: ruhig unten links, mindestens 64 px)`);
    const nightTick = v.tick;
    const stockAtNight = v.stock;
    await input.tap(v.ui['tool-shop'] ?? { x: size.width / 2, y: size.height - 40 });
    await sleep(400);
    await input.tap(v.ui.menu ?? { x: 40, y: size.height - 40 });
    await sleep(400);
    if (atNight[0]) await input.tap({ x: atNight[0].sx, y: atNight[0].sy });
    await sleep(2500);
    const quiet = await readVillage(page);
    check(quiet.tick === nightTick, `Nacht: der Takt läuft weiter (${nightTick} → ${quiet.tick})`);
    check(same(quiet.stock, stockAtNight), `Nacht: Ertrag ${JSON.stringify(stockAtNight)} → ${JSON.stringify(quiet.stock)}`);
    check(quiet.shop === 'closed' && quiet.menu === 'closed' && (await readResidents(page)).card === '', `Nacht: ein Tipp kam durch (Shop ${quiet.shop}, Menü ${quiet.menu})`);
    check(quiet.save.savedTick === nightTick, `Nacht: gespeichert bei Takt ${quiet.save.savedTick}, die Nacht begann bei ${nightTick}`);
    await shot(`${name}-gute-nacht`);

    // --- Neuladen in der Nacht: sofort Nacht ---
    step('M8: Neuladen in der Nacht');
    await enterIsland(page, profile, waitForScene, SAVE_URL);
    p = await readParent(page);
    check(p.limit.phase === 'night' && p.night.sky >= 1 && p.night.blocks && p.bedtime, `Neuladen in der Nacht: ${JSON.stringify({ limit: p.limit, night: p.night, bedtime: p.bedtime })}`);
    const reloadTick = await tickNow();
    await sleep(2000);
    check((await tickNow()) === reloadTick, 'Neuladen in der Nacht: der Takt läuft');
    check((await readResidents(page)).residents.every((r) => r.activity === 'sleep'), 'Neuladen in der Nacht: nicht alle schlafen');

    // --- Kleine Schirme in der Nacht: Eltern-Knopf, Ziffernfeld, Einstellungen ---
    for (const small of [
      { width: 320, height: 568, shotName: `${name}-m8-handy-hochkant`, at: 'night' },
      { width: 568, height: 320, shotName: `${name}-m8-handy-quer`, at: 'pin' },
    ]) {
      const smallSize = { width: small.width, height: small.height };
      step(`M8: ${small.width}×${small.height}`);
      await page.setViewportSize(smallSize);
      await sleep(1200);
      // Erst wenn die Knöpfe zur neuen Größe gehören (die Lage wird nach dem Drehen neu veröffentlicht).
      v = await waitForVillage(page, (x) => spotFits(x.ui['night-parent'], smallSize, 64), `den Eltern-Knopf der Nacht ganz im Bild bei ${small.width}×${small.height}`).catch(async (error) => {
        throw new Error(`${error.message}; Knopf ${JSON.stringify((await readVillage(page)).ui['night-parent'])}`);
      });
      check(spotFits(v.ui['night-parent'], smallSize, 64) && v.ui['night-parent'].x < small.width / 3, `${small.width}×${small.height}: Eltern-Knopf der Nacht ${JSON.stringify(v.ui['night-parent'])} (erwartet: unten links)`);
      if (small.height > small.width) {
        // Hochkant liegt er über der (gedimmten) Werkzeugleiste, nicht auf „Weg“ und „Shop“ (Korrekturrunde 2).
        const button = v.ui['night-parent'];
        const tools = Object.entries(v.ui).filter(([key]) => key.startsWith('tool-')).map(([, spot]) => spot);
        const clear = tools.every((tool) => button.y + button.h / 2 <= tool.y - 24);
        if (tools.length === 0) console.log(`  [${name}] ${small.width}×${small.height}: in der Nacht keine Werkzeug-Knöpfe in data-ui`);
        check(clear, `${small.width}×${small.height}: Eltern-Knopf der Nacht ${JSON.stringify(button)} liegt auf der Werkzeugleiste ${JSON.stringify(tools)}`);
      }
      if (small.at === 'night') await shot(small.shotName);
      await tapUi('night-parent');
      await waitForParent(page, (x) => x.parent.startsWith('enterPin'), `das Ziffernfeld bei ${small.width}×${small.height}`);
      v = await readVillage(page);
      checkParentSpots(v, smallSize, check, `Ziffernfeld ${small.width}×${small.height}`);
      check(spotFits(v.ui['pin-forgot'], smallSize), `${small.width}×${small.height}: „PIN vergessen“ ${JSON.stringify(v.ui['pin-forgot'])}`);
      await typeDigits(TEST_PIN.slice(0, 1));
      await sleep(400);
      if (small.at === 'pin') await shot(small.shotName);
      await typeDigits(TEST_PIN.slice(1));
      await waitForParent(page, (x) => x.parent.startsWith('settings'), `die Einstellungen bei ${small.width}×${small.height}`);
      await sleep(300);
      v = await readVillage(page);
      checkParentSpots(v, smallSize, check, `Einstellungen ${small.width}×${small.height}`);
      await closeParents();
      p = await readParent(page);
      check(p.limit.phase === 'night', `${small.width}×${small.height}: nach dem Schließen ist es nicht mehr Nacht (${p.limit.phase})`);
    }
    await page.setViewportSize(size);
    await sleep(1200);

    // --- +10 Minuten: es wird hell, alle wachen auf ---
    step('M8: „Heute noch 10 Minuten mehr“');
    await waitForVillage(page, (x) => 'night-parent' in x.ui, 'den Eltern-Knopf der Nacht');
    await tapUi('night-parent');
    await unlock();
    await tapUi('parent-extra');
    p = await waitForParent(page, (x) => x.parent === 'settings:parent.extraGiven' && x.limit.extra === 10, 'die 10 Minuten mehr');
    check(/Heute gespielt: \d+ von 25 Min\./.test(p.parentText), `+10 Minuten: „${p.parentText}“ (erwartet: auch „Heute gespielt: … von 25 Min.“)`);
    await closeParents();
    p = await waitForParent(page, (x) => x.limit.phase === 'day' && !x.night.blocks && x.night.dark === 0, 'den hellen Tag', 10_000);
    const dayTick = await tickNow();
    await sleep(2000);
    check((await tickNow()) > dayTick, '+10 Minuten: der Takt steht still');
    check(!(await readParent(page)).bedtime, '+10 Minuten: noch Schlafenszeit');
    await waitForResidents(page, ({ residents }) => residents.some((r) => r.activity !== 'sleep'), 'den ersten wachen Bewohner', 15_000);

    // --- Der nächste Tag: wieder Nacht (von außen aufgebraucht), dann zeigt die Uhr den nächsten Morgen ---
    step('M8: der nächste Tag');
    const spent = await readSettingsEntry(page);
    await setSettingsFromOutside(page, { ...spent, day: today, usedMs: 25 * 60_000, limitMinutes: 15, extraMinutes: 10 });
    await enterIsland(page, profile, waitForScene, SAVE_URL);
    p = await readParent(page);
    check(p.limit.phase === 'night', `Aufgebraucht: nach dem Neuladen ${p.limit.phase} statt Nacht`);
    const [year, month, dayOfMonth] = today.split('-').map(Number);
    const tomorrow = new Date(year, month - 1, dayOfMonth + 1, 8, 0, 0);
    // Nur das Datum der Seite springt (Zeitgeber laufen weiter): so schlägt im laufenden Spiel Mitternacht.
    await page.clock.setFixedTime(tomorrow);
    p = await waitForParent(page, (x) => x.limit.day !== today && x.limit.phase === 'day' && x.night.dark === 0, 'den nächsten Morgen', 12_000);
    check(p.limit.used < 30 && p.limit.extra === 0 && p.limit.limit === 15, `Nächster Tag: ${JSON.stringify(p.limit)}`);
    const morningTick = await tickNow();
    await sleep(1500);
    check((await tickNow()) > morningTick, 'Nächster Tag: der Takt steht still');
    await enterIsland(page, profile, waitForScene, SAVE_URL);
    p = await readParent(page);
    check(p.limit.phase === 'day' && p.limit.day !== today && !p.night.blocks, `Nächster Tag nach dem Neuladen: ${JSON.stringify(p.limit)}`);

    // --- Export und Import: die PIN und das Limit gehören nicht zum Dorf ---
    step('M8: Datei sichern und laden – ohne PIN');
    await tapUi('menu');
    await waitForVillage(page, (x) => x.menu === 'menu' && 'menu-save' in x.ui, 'das Menü');
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10_000 }), tapUi('menu-save')]);
    const exported = await readFile(await download.path(), 'utf8');
    check(!/village-parent|limitMinutes|usedMs|"pin"|"salt"|"hash"|village-tutorial/.test(exported), 'Export: die Datei enthält Eltern-Einstellungen');
    await tapUi('menu-close');
    await waitForVillage(page, (x) => x.menu === 'closed', 'das geschlossene Menü');
    const foreign = JSON.parse(exported);
    // Auch eine Datei mit fremden Feldern bringt keine PIN mit.
    foreign.pin = { salt: 'x', hash: 'y' };
    foreign.limitMinutes = 0;
    await tapUi('menu');
    await waitForVillage(page, (x) => x.menu === 'menu' && 'menu-load' in x.ui, 'das Menü');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser', { timeout: 10_000 }), tapUi('menu-load')]);
    await chooser.setFiles({ name: 'dorf.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(foreign)) });
    await waitForVillage(page, (x) => x.menu === 'confirm' && 'menu-confirm' in x.ui, 'die Frage „Dorf ersetzen?“');
    await tapUi('menu-confirm');
    await waitForVillage(page, (x) => x.menu === 'closed' && x.hint === 'Dein Dorf aus der Datei ist da!', 'das geladene Dorf', 15_000);
    p = await readParent(page);
    check(p.limit.pin === true && p.limit.limit === 15, `Nach dem Import: ${JSON.stringify(p.limit)} (PIN und Limit bleiben)`);
    const afterImport = await readSettingsEntry(page);
    check(afterImport?.pin?.hash === spent.pin.hash && afterImport.limitMinutes === 15, 'Nach dem Import: PIN oder Limit in den Einstellungen geändert');
    await openParents();
    await unlock();
    await closeParents();

    // --- Ohne IndexedDB: beim ersten Öffnen stehen „speichert nichts“ und „PIN wählen“ zusammen da (Korrekturrunde 1) ---
    step('M8: ohne IndexedDB – beide Sätze im Eltern-Menü');
    // Das Dorf von oben wird nicht mehr gebraucht: zumachen, damit es dem neuen Kontext keine Rechenzeit nimmt (im
    // Headless-Modus zeichnen beide sonst gleichzeitig und die erste Insel des frischen Kontexts kommt zu spät).
    await page.close();
    const plain = await browser.newContext(profile.context);
    try {
      await plain.addInitScript(() => {
        Object.defineProperty(window, 'indexedDB', {
          get() {
            throw new DOMException('Speicher gesperrt', 'SecurityError');
          },
        });
      });
      const lone = await plain.newPage();
      lone.on('console', (message) => {
        if (message.type() === 'error') problems.push(`Konsolenfehler (M8 ohne IndexedDB): ${message.text()}`);
      });
      lone.on('pageerror', (error) => problems.push(`Seitenfehler (M8 ohne IndexedDB): ${error.message}`));
      const loneInput = profile.context.hasTouch ? { tap: (at) => lone.touchscreen.tap(at.x, at.y) } : { tap: (at) => lone.mouse.click(at.x, at.y) };
      const loneUi = buildHelpers({ page: lone, check, size, input: loneInput, name });
      // Wie im M5-Teil ohne IndexedDB: die erste Insel eines frischen Browsers braucht im Headless-Modus länger.
      await lone.goto(SAVE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await lone.waitForSelector('html[data-scene="boot"]', { state: 'attached', timeout: 40_000 });
      await lone.waitForTimeout(500);
      await loneInput.tap({ x: size.width / 2, y: size.height * 0.54 });
      await lone.waitForSelector('html[data-scene="island"]', { state: 'attached', timeout: 40_000 });
      await waitForCameraRest(lone);
      await lone.waitForTimeout(1500);
      await loneUi.tapUi('menu');
      await waitForVillage(lone, (x) => x.menu === 'menu' && 'menu-parent' in x.ui, 'das Menü mit „Für Eltern“');
      await loneUi.tapUi('menu-parent');
      const first = await waitForParent(lone, (x) => x.parent.startsWith('newPin'), 'das Ziffernfeld ohne IndexedDB');
      const both = `${gameText('parent.memoryOnly')} ${gameText('parent.newPin')}`;
      check(first.parent === 'newPin:parent.memoryOnly' && first.parentText === both, `Ohne IndexedDB: „${first.parent}“, „${first.parentText}“ (erwartet: „${both}“)`);
      check(JSON.parse(await lone.evaluate(() => document.documentElement.dataset.limit ?? '{}')).store === 'memory', 'Ohne IndexedDB: die Einstellungen liegen nicht im Arbeitsspeicher');
      await loneUi.tapUi('pin-1');
      const typed = await waitForParent(lone, (x) => x.parent === 'newPin:parent.firstPin', 'den Satz „PIN wählen“ nach der ersten Ziffer');
      check(typed.parentText === gameText('parent.firstPin'), `Ohne IndexedDB nach der ersten Ziffer: „${typed.parentText}“`);
    } finally {
      await plain.close();
    }
  } finally {
    await context.close();
  }
}

async function enterIsland(page, profile, waitForScene, url = GAME_URL) {
  // Ein Abschnitt, der abbrach, kann den Bildschirm klein gelassen haben: jeder neue Start beginnt mit der Größe des Geräts.
  await page.setViewportSize(profile.context.viewport);
  await page.goto(url, { waitUntil: 'load' });
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

  // M8: die älteren Prüfungen laufen ohne den geführten Start (die M8-Prüfungen haben einen eigenen, frischen Kontext).
  await skipTutorialForOlderChecks(page);
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

  if (!ONLY) {
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
  if (runs(M2_ONLY)) {
    try {
      await testBuilding({ page, check, shot, size, input, drag, name: profile.name });
    } catch (error) {
      problems.push(`Bauen: ${error.message}`);
      await shot(`${profile.name}-bauen-fehler`).catch(() => {});
    }
  }
  if (runs(M3_ONLY)) {
    try {
      // Frische Insel mit frischem Startlager für die Wirtschafts-Prüfungen (das Bauen oben hat Geld ausgegeben).
      if (!M3_ONLY) await enterIsland(page, profile, waitForScene);
      await testEconomy({ page, check, shot, size, input, name: profile.name });
    } catch (error) {
      problems.push(`Wirtschaft: ${error.message}`);
      await shot(`${profile.name}-wirtschaft-fehler`).catch(() => {});
    }
  }
  if (runs(M4_ONLY)) {
    try {
      // Frische Insel für den Shop (das Bauen und Wirtschaften oben hat Geld ausgegeben und Freischaltungen erreicht).
      if (!M4_ONLY) await enterIsland(page, profile, waitForScene);
      // Erst der Shop mit dem frischen Start (verdiente Taler, Sperren), dann die kleinen Schirme (sie brauchen Zeit).
      await testShop({ page, check, shot, size, input, name: profile.name, waitLong: profile.name === 'tablet' });
      await testShopSmall({ page, check, shot, size, input, name: profile.name });
    } catch (error) {
      problems.push(`Shop: ${error.message}`);
      await shot(`${profile.name}-shop-fehler`).catch(() => {});
    }
  }
  if (runs(M5_ONLY)) {
    try {
      await testSaving({ browser, page, check, shot, size, input, name: profile.name, profile, waitForScene, problems });
    } catch (error) {
      problems.push(`Speichern: ${error.message}`);
      await shot(`${profile.name}-speichern-fehler`).catch(() => {});
    }
    try {
      await testPwa({ context, page, check, shot, size, profile, waitForScene, problems });
    } catch (error) {
      problems.push(`Web-App: ${error.message}`);
      await shot(`${profile.name}-webapp-fehler`).catch(() => {});
    }
  }
  if (runs(M6_ONLY)) {
    try {
      await testResidents({ context, page, check, shot, size, input, name: profile.name, profile, waitForScene });
    } catch (error) {
      problems.push(`Bewohner: ${error.message}`);
      await shot(`${profile.name}-bewohner-fehler`).catch(() => {});
    }
  }
  if (runs(M7_ONLY)) {
    try {
      await testHomes({ context, page, check, shot, size, input, cdp, name: profile.name, profile, waitForScene });
    } catch (error) {
      problems.push(`Wohnen und Stimmung: ${error.message}`);
      await shot(`${profile.name}-stimmung-fehler`).catch(() => {});
    }
  }
  if (runs(M8_ONLY)) {
    try {
      await testKidFriendly({ browser, profile, check, problems, name: profile.name });
    } catch (error) {
      problems.push(`Kinderfreundlich: ${error.message}`);
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
