import texts from './texts.de.json';
import theme from './theme.json';

/**
 * All visible texts come from `texts.de.json`, everything theme-specific
 * (game name, names of the inhabitants, …) from `theme.json`.
 *
 * Texts may contain placeholders like `{gameName}` or `{creatures}`. They are
 * filled from the theme (`gameName` plus every entry of `theme.terms`) and
 * from the optional `params` of {@link t}; params win over theme values.
 */

export type TextKey = keyof typeof texts;
export type TextParams = Readonly<Record<string, string | number>>;

const PLACEHOLDER = /\{(\w+)\}/g;
const numberFormat = new Intl.NumberFormat('de-DE');

/** Values every text can use as placeholder, taken from `theme.json`. */
export const themeValues: ReadonlyMap<string, string> = new Map([
  ['gameName', theme.gameName],
  ...Object.entries(theme.terms),
]);

/** A number the way it is written in German texts (1.234). */
export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** Returns the text for `key` with all placeholders filled. */
export function t(key: TextKey, params?: TextParams): string {
  return format(texts[key], params);
}

/**
 * Fills `{name}` placeholders in `template`. Numbers are formatted for German
 * (1.000). Unknown placeholders stay unchanged, so mistakes remain visible.
 */
export function format(template: string, params: TextParams = {}): string {
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = Object.hasOwn(params, name) ? params[name] : themeValues.get(name);
    if (value === undefined) {
      return match;
    }
    return typeof value === 'number' ? numberFormat.format(value) : value;
  });
}

/** Names of all placeholders used in `template` (in order, without duplicates). */
export function placeholdersOf(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(PLACEHOLDER)) {
    if (match[1] !== undefined) {
      names.add(match[1]);
    }
  }
  return [...names];
}
