#!/usr/bin/env node
/**
 * Erzeugt die PNG-Symbole der Web-App aus einer kleinen SVG-Zeichnung (Platzhalter bis M9): ein Pilzhaus auf einer
 * Insel im Wasser. Läuft nur lokal, mit dem global installierten Playwright (nicht als Abhängigkeit):
 *
 *   node scripts/makeIcons.mjs
 *
 * Schreibt nach public/icons/: icon-192.png, icon-512.png, icon-maskable-512.png (Motiv im sicheren Innenkreis, damit
 * runde Masken nichts abschneiden) und apple-touch-icon.png (180×180, ohne Transparenz).
 */
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'icons');

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require('playwright');
  } catch {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return createRequire(path.join(globalRoot, 'noop.js'))('playwright');
  }
}

/** The picture on a 100×100 canvas; `scale` shrinks it around the middle (maskable icons). */
function svg(size, scale) {
  const s = scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#8ed8f8"/>
  <g transform="translate(50 50) scale(${s}) translate(-50 -50)">
    <circle cx="50" cy="54" r="34" fill="#b5e8fb"/>
    <circle cx="50" cy="55" r="31" fill="#f7e4a9"/>
    <circle cx="50" cy="53" r="26" fill="#8ad463"/>
    <ellipse cx="50" cy="73" rx="14" ry="3" fill="#69b946" opacity="0.6"/>
    <rect x="41" y="52" width="18" height="21" rx="6" fill="#fff1d6"/>
    <rect x="46.5" y="60" width="7" height="13" rx="3" fill="#9a5f2e"/>
    <path d="M26 54 Q26 24 50 24 Q74 24 74 54 Q74 58 70 58 L30 58 Q26 58 26 54 Z" fill="#e65a5a"/>
    <path d="M26 54 Q26 52 28 52 L72 52 Q74 52 74 54 Q74 58 70 58 L30 58 Q26 58 26 54 Z" fill="#c23f3f"/>
    <circle cx="40" cy="38" r="4.4" fill="#fff"/>
    <circle cx="57" cy="33" r="3.6" fill="#fff"/>
    <circle cx="62" cy="45" r="3" fill="#fff"/>
    <circle cx="35" cy="48" r="2.4" fill="#fff"/>
  </g>
</svg>`;
}

const ICONS = [
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  { file: 'icon-maskable-512.png', size: 512, scale: 0.78 },
  { file: 'apple-touch-icon.png', size: 180, scale: 1 },
];

const { chromium } = loadPlaywright();
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const { file, size, scale } of ICONS) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<html><body style="margin:0">${svg(size, scale)}</body></html>`);
    await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log(`public/icons/${file}`);
  }
} finally {
  await browser.close();
}
