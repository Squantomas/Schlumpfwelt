import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';
import texts from '../src/data/texts.de.json';
import theme from '../src/data/theme.json';
import { createManifest } from '../scripts/pwaPlugin.mjs';
import { ASSETS, assetSvg } from '../src/art/catalog';

/**
 * Guards the architecture rules from CLAUDE.md:
 * 1. `src/sim/` must not import Phaser, scenes, UI, save or parent code (ESLint rule); `src/parent/` stays free of
 *    Phaser, scenes and UI.
 * 2. Theme-specific words only live in `src/data/theme.json`.
 */

const ARCHITECTURE_RULES = new Set([
  'no-restricted-imports',
  'no-restricted-globals',
  'no-restricted-properties',
  'no-restricted-syntax',
]);

/** Globals that give access to browser, network, timers or the wall clock. */
const FORBIDDEN_GLOBALS = [
  'window',
  'self',
  'globalThis',
  'document',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'caches',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'Worker',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'performance',
  'crypto',
  'Phaser',
];

const eslint = new ESLint();

/** Lints `code` as if it were the file at `filePath` and returns the architecture violations. */
async function architectureViolations(filePath: string, code: string): Promise<string[]> {
  const results = await eslint.lintText(code, { filePath });
  return results
    .flatMap((result) => result.messages)
    .filter((message) => message.ruleId !== null && ARCHITECTURE_RULES.has(message.ruleId))
    .map((message) => message.ruleId ?? '');
}

// Real file paths, so the type-aware lint setup finds them in the project.
const SIM_FILE = 'src/sim/simulation.ts';
const SCENE_FILE = 'src/scenes/IslandScene.ts';

describe('Architektur: src/sim/ ist reines TypeScript', { timeout: 30_000 }, () => {
  it.each([
    ['Phaser', "import Phaser from 'phaser';\nexport const game = Phaser.AUTO;\n"],
    ['Phaser (nur Typen)', "import type { Scene } from 'phaser';\nexport type S = Scene;\n"],
    ['Phaser-Unterpfad', "import { Scene } from 'phaser/src/phaser';\nexport const s = Scene;\n"],
    ['Szenen', "import { IslandScene } from '../scenes/IslandScene';\nexport const s = IslandScene;\n"],
    ['UI', "import { computeRenderScale } from '../ui/renderScale';\nexport const f = computeRenderScale;\n"],
    ['Speichern', "export * from '../save/storage';\n"],
    ['Eltern', "import { DayClock } from '../parent/dayClock';\nexport const c = DayClock;\n"],
    ['main', "import '../main';\n"],
  ])('verbietet Imports: %s', async (_name, code) => {
    expect(await architectureViolations(SIM_FILE, code)).toContain('no-restricted-imports');
  });

  it('verbietet Browser-Globals', async () => {
    const code = 'export const width = window.innerWidth + document.body.clientWidth;\n';
    expect(await architectureViolations(SIM_FILE, code)).toEqual(['no-restricted-globals', 'no-restricted-globals']);
  });

  it.each(FORBIDDEN_GLOBALS)('verbietet das Global %s', async (name) => {
    const code = `export const value: unknown = ${name};\n`;
    expect(await architectureViolations(SIM_FILE, code)).toEqual(['no-restricted-globals']);
  });

  it('verbietet den Umweg über globalThis', async () => {
    const code = "export const load = globalThis.fetch('https://example.org');\n";
    expect(await architectureViolations(SIM_FILE, code)).toEqual(['no-restricted-globals']);
  });

  it.each([
    ['Date.now()', 'export const now = Date.now();\n'],
    ['Math.random()', 'export const roll = Math.random();\n'],
    ['Math.random als Wert', 'export const roll = Math.random;\n'],
    ['Math.random per Destrukturierung', 'const { random } = Math;\nexport const roll = random();\n'],
  ])('verbietet Wanduhr und Zufall: %s', async (_name, code) => {
    expect(await architectureViolations(SIM_FILE, code)).toEqual(['no-restricted-properties']);
  });

  it.each([
    ['new Date()', 'export const today = new Date();\n'],
    ['Date()', 'export const today = Date();\n'],
  ])('verbietet die aktuelle Uhrzeit: %s', async (_name, code) => {
    expect(await architectureViolations(SIM_FILE, code)).toEqual(['no-restricted-syntax']);
  });

  it('verbietet dynamische Imports', async () => {
    const code = "export const later = import('./clock');\n";
    expect(await architectureViolations(SIM_FILE, code)).toEqual(['no-restricted-syntax']);
  });

  it('erlaubt Imports innerhalb von src/sim/ und aus src/data/', async () => {
    const code =
      "import { TICK_MS } from './clock';\nimport { t } from '../data/texts';\nexport const x = [TICK_MS, t];\n";
    expect(await architectureViolations(SIM_FILE, code)).toEqual([]);
  });

  it('erlaubt reine Berechnungen mit Math und festen Datumswerten', async () => {
    const code = 'export const x = Math.floor(Math.max(1, 2.5));\nexport const epoch = new Date(0);\n';
    expect(await architectureViolations(SIM_FILE, code)).toEqual([]);
  });

  it('erlaubt Phaser, Browser und Uhr außerhalb von src/sim/', async () => {
    const code =
      "import Phaser from 'phaser';\nexport const x = [Phaser.AUTO, window.innerWidth, Date.now(), Math.random()];\n";
    expect(await architectureViolations(SCENE_FILE, code)).toEqual([]);
  });
});

const PARENT_FILE = 'src/parent/dayClock.ts';

describe('Architektur: src/parent/ (Eltern und Tageslimit) ist Phaser-frei (M8)', { timeout: 30_000 }, () => {
  it.each([
    ['Phaser', "import Phaser from 'phaser';\nexport const game = Phaser.AUTO;\n"],
    ['Phaser (nur Typen)', "import type { Scene } from 'phaser';\nexport type S = Scene;\n"],
    ['Phaser-Unterpfad', "import { Scene } from 'phaser/src/phaser';\nexport const s = Scene;\n"],
    ['Szenen', "import { IslandScene } from '../scenes/IslandScene';\nexport const s = IslandScene;\n"],
    ['UI', "import { computeRenderScale } from '../ui/renderScale';\nexport const f = computeRenderScale;\n"],
    ['main', "import '../main';\n"],
  ])('verbietet Imports: %s', async (_name, code) => {
    expect(await architectureViolations(PARENT_FILE, code)).toContain('no-restricted-imports');
  });

  it('verbietet das Global Phaser und dynamische Imports', async () => {
    expect(await architectureViolations(PARENT_FILE, 'export const p: unknown = Phaser;\n')).toEqual(['no-restricted-globals']);
    expect(await architectureViolations(PARENT_FILE, "export const later = import('./pin');\n")).toEqual(['no-restricted-syntax']);
  });

  it('erlaubt Wanduhr, Datum, Speicher und Imports aus sim/, save/ und data/ (das ist ihre Aufgabe)', async () => {
    const code =
      "import { MAX_FRAME_MS } from '../sim/clock';\nimport { MemoryStore } from '../save/saveStore';\nimport { PARENT_RULES } from '../data/parent';\nexport const x = [MAX_FRAME_MS, MemoryStore, PARENT_RULES, new Date(), Date.now(), Math.random(), indexedDB, document.visibilityState];\n";
    expect(await architectureViolations(PARENT_FILE, code)).toEqual([]);
  });
});

describe('Theme: Markenbegriffe nur in src/data/theme.json', () => {
  const BRAND_WORDS = /schl[uü]mpf|smurf/i;
  const sources = import.meta.glob<string>(['/src/**/*', '!/src/data/theme.json'], {
    query: '?raw',
    import: 'default',
    eager: true,
  });

  it('findet die Quelldateien', () => {
    expect(Object.keys(sources)).toContain('/src/main.ts');
    expect(Object.keys(sources)).toContain('/src/data/texts.de.json');
  });

  it.each(Object.entries(sources))('%s enthält keine Markenbegriffe', (_path, content) => {
    expect(content).not.toMatch(BRAND_WORDS);
  });

  it('index.html holt den Titel aus dem Theme', () => {
    expect(indexHtml).not.toMatch(BRAND_WORDS);
    expect(indexHtml).toContain('<title>%GAME_NAME%</title>');
  });
});

describe('Theme: auch Build-Skripte, Symbole und Manifest kennen keinen Markennamen (R14)', () => {
  const BRAND_WORDS = /schl[uü]mpf|smurf/i;
  // Everything the build and the web app are made of, except the smoke test (it opens the address of the game, which has the name in it).
  const scripts = import.meta.glob<string>(['/scripts/*', '!/scripts/smoke.mjs'], { query: '?raw', import: 'default', eager: true });
  const publicTexts = import.meta.glob<string>('/public/**/*.{svg,json,webmanifest,html,txt,js}', { query: '?raw', import: 'default', eager: true });

  it('findet die Skripte und die Dateien in public/', () => {
    expect(Object.keys(scripts)).toEqual(expect.arrayContaining(['/scripts/pwaPlugin.mjs', '/scripts/swTemplate.js', '/scripts/makeIcons.mjs']));
    expect(Object.keys(publicTexts)).toContain('/public/favicon.svg');
  });

  it.each(Object.entries(scripts))('%s enthält keine Markenbegriffe', (_path, content) => {
    expect(content).not.toMatch(BRAND_WORDS);
  });

  it.each(Object.entries(publicTexts))('%s enthält keine Markenbegriffe', (_path, content) => {
    expect(content).not.toMatch(BRAND_WORDS);
  });

  it('das Manifest bekommt den Namen nur aus dem Theme (alles andere im Manifest ist markenfrei)', () => {
    const manifest = createManifest({ name: theme.gameName, description: texts['app.description'], color: '#000000', lang: 'de' });
    const { name, short_name: shortName, ...rest } = manifest;
    expect(name).toBe(theme.gameName);
    expect(shortName).toBe(theme.gameName);
    expect(JSON.stringify(rest)).not.toMatch(BRAND_WORDS);
  });

  it('index.html holt auch die Farbe aus dem Spiel (eine Quelle: COLORS.water)', () => {
    expect(indexHtml).toContain('content="%THEME_COLOR%"');
    expect(indexHtml).not.toMatch(/#[0-9a-f]{6}/i);
  });
});

describe('Theme: auch die Bilder, ihre Vorlagen und die Doku zu Bild und Ton kennen keinen Markennamen (M9)', () => {
  const BRAND_WORDS = /schl[uü]mpf|smurf/i;
  const docs = import.meta.glob<string>(['/docs/assets/*.md', '/docs/STIL_LEITFADEN.md', '/docs/CREDITS.md'], { query: '?raw', import: 'default', eager: true });
  const publicFiles = Object.keys(import.meta.glob('/public/**/*', { query: '?url' }));

  it('findet die Vorlagen, den Stil-Leitfaden und die Credits', () => {
    expect(Object.keys(docs)).toEqual(expect.arrayContaining(['/docs/assets/README.md', '/docs/STIL_LEITFADEN.md', '/docs/CREDITS.md']));
  });

  it.each(Object.entries(docs))('%s enthält keine Markenbegriffe', (_path, content) => {
    expect(content).not.toMatch(BRAND_WORDS);
  });

  it('jedes gezeichnete Bild (SVG) und seine Beschreibung sind markenfrei', () => {
    for (const asset of ASSETS) {
      expect(assetSvg(asset), asset.key).not.toMatch(BRAND_WORDS);
      expect(asset.subject, asset.key).not.toMatch(BRAND_WORDS);
      expect(asset.key).not.toMatch(BRAND_WORDS);
    }
  });

  it('kein Dateiname in public/ nennt eine Marke', () => {
    for (const path of publicFiles) {
      expect(path).not.toMatch(BRAND_WORDS);
    }
  });
});

const AUDIO_FILE = 'src/audio/engine.ts';
const ART_FILE = 'src/art/svg.ts';

describe('Architektur: Ton (src/audio/) und Bilder (src/art/) (M9)', { timeout: 30_000 }, () => {
  it.each([
    ['Phaser', "import Phaser from 'phaser';\nexport const game = Phaser.AUTO;\n"],
    ['Szenen', "import { IslandScene } from '../scenes/IslandScene';\nexport const s = IslandScene;\n"],
    ['UI', "import { COLORS } from '../ui/style';\nexport const c = COLORS;\n"],
    ['Simulation', "import { TICK_MS } from '../sim/clock';\nexport const x = TICK_MS;\n"],
    ['Eltern', "import { DayClock } from '../parent/dayClock';\nexport const c = DayClock;\n"],
    ['Bilder', "import { Svg } from '../art/svg';\nexport const s = Svg;\n"],
  ])('src/audio/ verbietet Imports: %s', async (_name, code) => {
    expect(await architectureViolations(AUDIO_FILE, code)).toContain('no-restricted-imports');
  });

  it('src/audio/ darf Web Audio, Browser und die Daten benutzen', async () => {
    const code = "import { SOUND_BOOK } from './recipes';\nimport sounds from '../data/sounds.json';\nexport const x = [SOUND_BOOK, sounds, new AudioContext(), document.hidden];\n";
    expect(await architectureViolations(AUDIO_FILE, code)).toEqual([]);
  });

  it.each([
    ['src/sim/', SIM_FILE],
    ['src/parent/', PARENT_FILE],
    ['eine Szene', SCENE_FILE],
    ['src/art/', ART_FILE],
  ])('Web Audio nur in src/audio/: nicht in %s', async (_name, file) => {
    expect(await architectureViolations(file, 'export const ctx = new AudioContext();\n')).toEqual(['no-restricted-globals']);
  });

  it('src/sim/ importiert weder Ton noch Bilder', async () => {
    expect(await architectureViolations(SIM_FILE, "import { AudioEngine } from '../audio/engine';\nexport const a = AudioEngine;\n")).toContain('no-restricted-imports');
    expect(await architectureViolations(SIM_FILE, "import { Svg } from '../art/svg';\nexport const s = Svg;\n")).toContain('no-restricted-imports');
  });

  it.each([
    ['Phaser', "import Phaser from 'phaser';\nexport const game = Phaser.AUTO;\n"],
    ['Szenen', "import { IslandScene } from '../scenes/IslandScene';\nexport const s = IslandScene;\n"],
    ['UI außer style', "import { BuildTool } from '../ui/buildTool';\nexport const b = BuildTool;\n"],
    ['Simulation', "import { TICK_MS } from '../sim/clock';\nexport const x = TICK_MS;\n"],
    ['Ton', "import { AudioEngine } from '../audio/engine';\nexport const a = AudioEngine;\n"],
  ])('src/art/ verbietet Imports: %s', async (_name, code) => {
    expect(await architectureViolations(ART_FILE, code)).toContain('no-restricted-imports');
  });

  it.each([
    ['Date.now()', 'export const t = Date.now();\n', 'no-restricted-properties'],
    ['new Date() ohne Argument', 'export const d = new Date();\n', 'no-restricted-syntax'],
    ['Date() als Funktion', 'export const d = Date();\n', 'no-restricted-syntax'],
  ])('src/art/ hat keine Wanduhr: %s (Korrekturrunde 1)', async (_name, code, rule) => {
    expect(await architectureViolations(ART_FILE, code)).toEqual([rule]);
  });

  it('src/art/ darf ein festes Datum benutzen (new Date mit Argument)', async () => {
    expect(await architectureViolations(ART_FILE, 'export const d = new Date(0);\n')).toEqual([]);
  });

  it('src/art/ ist rein: kein Browser, kein Zufall; die Farben aus ui/style und die Daten sind erlaubt', async () => {
    expect(await architectureViolations(ART_FILE, 'export const w = window.innerWidth;\n')).toEqual(['no-restricted-globals']);
    expect(await architectureViolations(ART_FILE, 'export const r = Math.random();\n')).toEqual(['no-restricted-properties']);
    const code = "import { COLORS } from '../ui/style';\nimport { BUILDING_TYPES } from '../data/buildings';\nexport const x = [COLORS, BUILDING_TYPES, Math.round(1.5)];\n";
    expect(await architectureViolations(ART_FILE, code)).toEqual([]);
  });
});
