import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import indexHtml from '../index.html?raw';

/**
 * Guards the architecture rules from CLAUDE.md:
 * 1. `src/sim/` must not import Phaser, scenes, UI or save code (ESLint rule).
 * 2. Theme-specific words only live in `src/data/theme.json`.
 */

const ARCHITECTURE_RULES = new Set(['no-restricted-imports', 'no-restricted-globals', 'no-restricted-syntax']);

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
    ['main', "import '../main';\n"],
  ])('verbietet Imports: %s', async (_name, code) => {
    expect(await architectureViolations(SIM_FILE, code)).toContain('no-restricted-imports');
  });

  it('verbietet Browser-Globals', async () => {
    const code = 'export const width = window.innerWidth + document.body.clientWidth;\n';
    expect(await architectureViolations(SIM_FILE, code)).toEqual(['no-restricted-globals', 'no-restricted-globals']);
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

  it('erlaubt Phaser außerhalb von src/sim/', async () => {
    const code = "import Phaser from 'phaser';\nexport const mode = Phaser.AUTO;\n";
    expect(await architectureViolations(SCENE_FILE, code)).toEqual([]);
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
