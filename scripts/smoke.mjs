#!/usr/bin/env node
/**
 * Lokaler Smoke-Test (läuft NICHT in CI – dort gibt es kein Playwright).
 *
 *   npm run smoke                                # baut, startet `vite preview`, testet, räumt auf
 *   npm run smoke -- --no-build                  # vorhandenes dist/ verwenden
 *   npm run smoke -- --out docs/screenshots/m1   # anderer Screenshot-Ordner (Standard: m0)
 *
 * Öffnet das Spiel als Tablet (1024×768, Touch, devicePixelRatio 2, quer und
 * hochkant) und als Desktop (1280×800, Maus), tippt „Tippen zum Spielen“ an
 * und speichert Screenshots (Start, Insel, Insel hochkant).
 * Exitcode ≠ 0 bei Konsolenfehlern, Seitenfehlern, fehlgeschlagenen Requests
 * oder wenn das Spiel nicht in die Insel-Szene wechselt.
 *
 * Playwright wird NICHT als Abhängigkeit installiert: das Skript nutzt das
 * global vorinstallierte Paket (NODE_PATH oder `npm root -g`).
 */
import { execSync, spawn, spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4173;
const URL = `http://localhost:${PORT}/Schlumpfwelt/`;
const SCREENSHOT_DIR = path.resolve(ROOT, argValue('--out') ?? path.join('docs', 'screenshots', 'm0'));

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

async function testProfile(browser, profile) {
  const problems = [];
  const context = await browser.newContext(profile.context);
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

  await page.goto(URL, { waitUntil: 'load' });
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
  await page.waitForTimeout(800);
  await shot(`${profile.name}-insel`);

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
    await shot(`${profile.name}-insel-hochkant`);
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
