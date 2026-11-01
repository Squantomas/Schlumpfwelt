import { ASSETS, assetSvg, textureSize, type AssetEntry, type AssetGroup } from './catalog';

/**
 * Prompt templates for replacing the drawn pictures with painted ones (M9, `docs/assets/`): one section per picture
 * with its file name, the exact size in pixels, the anchor (where it stands), the main colours of the drawn picture
 * and a prompt that always starts with the same style preamble – so all pictures fit together. The files are made
 * from the catalog (`UPDATE_PROMPTS=1 npm test`) and a test checks that they are up to date.
 */

export const STYLE_PREAMBLE =
  'Game asset for a cosy island building game for children aged 6 to 10. Soft, friendly hand-painted cartoon look with ' +
  'round chunky shapes and no sharp corners; a soft outline in a darker shade of each fill colour (never black); light ' +
  'from the top left, a soft shadow towards the bottom right; bright warm colours with high contrast; slight top-down ' +
  'view (the ground seen from above, objects seen a little from the front); clean edges; transparent background ' +
  '(PNG or WebP with alpha); no text, no letters, no numbers, no logo, no watermark, no frame.';

/** The groups and the file each one is written to (`docs/assets/<file>`), in this order. */
export const PROMPT_FILES: Readonly<Record<AssetGroup, { readonly file: string; readonly title: string }>> = {
  ground: { file: 'boden.md', title: 'Boden: Muster und kleine Dinge' },
  nature: { file: 'natur.md', title: 'Natur: Bäume und Felsen' },
  building: { file: 'gebaeude.md', title: 'Häuser, Deko, Gebäude und Insel-Artikel' },
  path: { file: 'wege.md', title: 'Wege' },
  sign: { file: 'schilder.md', title: 'Schilder über Gebäuden' },
  good: { file: 'waren.md', title: 'Waren und Taler' },
  figure: { file: 'bewohner.md', title: 'Bewohner und Boot' },
  mood: { file: 'stimmung.md', title: 'Stimmung und Schlaf' },
  effect: { file: 'effekte.md', title: 'Effekte' },
  ui: { file: 'bedienung.md', title: 'Knöpfe, Schloss, Stern, Hand, Nacht' },
  title: { file: 'titel.md', title: 'Titelbild' },
};

/** The colours used most in the drawn picture (fills, outlines and gradients), most used first. */
export function mainColours(svg: string, count = 5): string[] {
  const seen = new Map<string, number>();
  for (const match of svg.matchAll(/(?:fill|stroke|stop-color)="(#[0-9a-f]{6})"/g)) {
    const colour = match[1] ?? '';
    seen.set(colour, (seen.get(colour) ?? 0) + 1);
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
    .map(([colour]) => colour);
}

function anchorText(asset: AssetEntry): string {
  const size = textureSize(asset);
  if (!asset.anchor) {
    return `Mitte (${String(size.width / 2)}, ${String(size.height / 2)}) – das Bild wird um seine Mitte gesetzt`;
  }
  const x = Math.round(asset.anchor.x * asset.scale);
  const y = Math.round(asset.anchor.y * asset.scale);
  return `Fußpunkt (${String(x)}, ${String(y)}) px von links oben – dort steht das Ding auf dem Boden`;
}

function sizeWords(asset: AssetEntry): string {
  const size = textureSize(asset);
  return `${String(size.width)} × ${String(size.height)} px`;
}

/** The prompt of one picture (English: image generators understand it best). */
export function promptOf(asset: AssetEntry, colours: readonly string[]): string {
  const size = textureSize(asset);
  const frame = asset.tiles
    ? 'Square seamless tile that repeats without a visible edge.'
    : asset.anchor
      ? `Canvas ${String(size.width)} x ${String(size.height)} px; the object stands on the ground at ${String(Math.round((asset.anchor.x * asset.scale * 100) / size.width))} % from the left and ${String(Math.round((asset.anchor.y * asset.scale * 100) / size.height))} % from the top, the rest of the canvas stays transparent; nothing is cut off.`
      : `Canvas ${String(size.width)} x ${String(size.height)} px, the subject centred with a small margin, nothing is cut off.`;
  return `${STYLE_PREAMBLE} Subject: ${asset.subject}. ${frame} Main colours: ${colours.join(', ')}.`;
}

/** One section of a template file. */
export function promptSection(asset: AssetEntry): string {
  const colours = mainColours(assetSvg(asset));
  return [
    `## \`${asset.key}\``,
    '',
    `- **Datei:** \`public/assets/${asset.key}.png\` (oder \`.webp\`)`,
    `- **Größe:** ${sizeWords(asset)}${asset.tiles ? ', nahtlos kachelbar, ganz gefüllt (kein transparenter Rand)' : ', transparenter Hintergrund'}`,
    `- **Anker:** ${anchorText(asset)}`,
    `- **Hauptfarben:** ${colours.map((colour) => `\`${colour}\``).join(', ')}`,
    '',
    '```text',
    promptOf(asset, colours),
    '```',
    '',
  ].join('\n');
}

/** The whole file of one group. */
export function promptFile(group: AssetGroup, assets: readonly AssetEntry[] = ASSETS): string {
  const { title } = PROMPT_FILES[group];
  const mine = assets.filter((asset) => asset.group === group);
  const head = [
    `# ${title}`,
    '',
    '<!-- Erzeugt aus src/art/catalog.ts (UPDATE_PROMPTS=1 npm test) – nicht von Hand ändern. -->',
    '',
    `${String(mine.length)} Bilder. Wie man ein Bild ersetzt, steht in [README.md](README.md).`,
    '',
  ].join('\n');
  return `${head}\n${mine.map(promptSection).join('\n')}`;
}
