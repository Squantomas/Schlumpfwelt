import { describe, expect, it } from 'vitest';
import { ASSETS, assetSvg } from '../../src/art/catalog';
import { HAT_IDS } from '../../src/data/residents';
import theme from '../../src/data/theme.json';
import { mainColours, PROMPT_FILES, promptDocs, promptOf, promptSection, STYLE_PREAMBLE } from '../../src/art/prompts';

/** The template files as they are in the repository. */
const files = import.meta.glob<string>('/docs/assets/*.md', { query: '?raw', import: 'default', eager: true });
const fileOf = (name: string): string | undefined => files[`/docs/assets/${name}`];

const BRAND_WORDS = /schl[uü]mpf|smurf/i;
/** Prompts describe the picture itself – never a borrowed look. */
const BORROWED_LOOK = /in the style of|im stil von|im stile|style of|à la|nach art von|wie bei|like the (film|movie|comic)/i;

describe('Prompt-Vorlagen: eine Vorlage für jeden Schlüssel (M9)', () => {
  const docs = promptDocs();

  it('jede Datei in docs/assets/ ist auf dem Stand des Katalogs (sonst `npm run prompts`)', () => {
    for (const [name, content] of Object.entries(docs)) {
      expect(fileOf(name), `docs/assets/${name} fehlt oder ist veraltet – npm run prompts`).toBe(content);
    }
  });

  it('jeder Schlüssel hat genau einen Abschnitt in genau einer Datei', () => {
    const all = Object.values(docs).join('\n');
    for (const asset of ASSETS) {
      const heading = `## \`${asset.key}\`\n`;
      expect(all.split(heading).length - 1, asset.key).toBe(1);
      expect(docs[PROMPT_FILES[asset.group].file]).toContain(heading);
    }
    // Nothing else: as many sections as pictures.
    expect(all.match(/^## `/gm)).toHaveLength(ASSETS.length);
  });

  it('jeder Abschnitt nennt Dateiname, Größe, Anker und beginnt die Vorlage mit derselben Stil-Präambel', () => {
    for (const asset of ASSETS) {
      const section = promptSection(asset);
      expect(section).toContain(`public/assets/${asset.key}.png`);
      expect(section).toMatch(/\*\*Größe:\*\* \d+ × \d+ px/);
      expect(section).toMatch(/\*\*Anker:\*\* /);
      expect(promptOf(asset, mainColours(assetSvg(asset)))).toMatch(new RegExp(`^${STYLE_PREAMBLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} Subject: `));
    }
  });

  it('Bodenmuster sind nahtlos und ganz gefüllt, alle anderen Bilder haben einen transparenten Hintergrund', () => {
    for (const asset of ASSETS) {
      const prompt = promptOf(asset, []);
      if (asset.tiles) {
        expect(prompt).toContain('seamless');
        expect(prompt).toContain('no transparency');
      } else {
        expect(prompt).toContain('transparent');
      }
    }
  });

  it('keine Markenbegriffe und kein „im Stil von“ – weder in den Vorlagen noch in der Anleitung', () => {
    expect(Object.keys(files)).toContain('/docs/assets/README.md');
    for (const [name, content] of Object.entries(files)) {
      expect(content, name).not.toMatch(BRAND_WORDS);
      expect(content, name).not.toMatch(BORROWED_LOOK);
    }
  });

  it('die Anleitung verweist auf jede Vorlagen-Datei', () => {
    const readme = fileOf('README.md') ?? '';
    for (const { file } of Object.values(PROMPT_FILES)) {
      expect(readme, file).toContain(`(${file})`);
    }
  });

  it('die Bewohner-Vorlagen nennen die Farben aus dem Theme als Hexwerte, nicht „colours of the theme“ (Korrekturrunde 1)', () => {
    const figure = theme.figure;
    const residents = ASSETS.filter((asset) => HAT_IDS.some((hat) => asset.key === `resident-${hat}`));
    expect(residents.length).toBeGreaterThanOrEqual(8);
    for (const asset of residents) {
      const section = promptSection(asset);
      expect(section, asset.key).not.toContain('colours of the theme');
      for (const colour of [figure.skin, figure.cheek, figure.clothes, figure.shoes]) {
        expect(section.toLowerCase(), `${asset.key}: ${colour}`).toContain(colour.toLowerCase());
      }
      // Under "Hauptfarben" (the list) the skin comes first.
      const list = /\*\*Hauptfarben:\*\* (.*)/.exec(section)?.[1] ?? '';
      expect(list.toLowerCase().indexOf(figure.skin.toLowerCase()), asset.key).toBeGreaterThanOrEqual(0);
    }
    expect(docs[PROMPT_FILES.figure.file]).toContain(theme.figure.skin);
  });

  it('die Hauptfarben sind Flächenfarben, ohne die Farbe des weichen Schattens, die häufigste zuerst', () => {
    const svg = '<svg><rect fill="#111111"/><rect fill="#222222"/><rect fill="#222222"/><path stroke="#333333"/><stop stop-color="#111111"/><ellipse fill="#24401c"/></svg>';
    expect(mainColours(svg)).toEqual(['#111111', '#222222']);
    expect(mainColours(svg, 1)).toEqual(['#111111']);
  });
});
