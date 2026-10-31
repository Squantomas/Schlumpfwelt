import { defineConfig, type Plugin } from 'vitest/config';
import texts from './src/data/texts.de.json' with { type: 'json' };
import theme from './src/data/theme.json' with { type: 'json' };
import { pwaPlugin } from './scripts/pwaPlugin.mjs';
import { COLORS, cssColor } from './src/ui/style';

/** The colour of the water: browser bar, splash screen and icons all take it from `COLORS.water` (one source). */
const WATER = cssColor(COLORS.water);

/** Fills `%GAME_NAME%` in index.html from the theme, so the title is right before any JS runs, and `%THEME_COLOR%` with the colour of the water. */
function themeHtml(): Plugin {
  return {
    name: 'theme-html',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replaceAll('%GAME_NAME%', escapeHtml(theme.gameName)).replaceAll('%THEME_COLOR%', WATER),
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export default defineConfig({
  // GitHub Pages serves the game at https://squantomas.github.io/Schlumpfwelt/
  base: '/Schlumpfwelt/',
  plugins: [
    themeHtml(),
    // Installable and offline: manifest (name from the theme) and service worker (see scripts/pwaPlugin.mjs).
    pwaPlugin({ name: theme.gameName, description: texts['app.description'], color: WATER, lang: 'de' }),
  ],
  build: {
    // Phaser alone is about 1.2 MB minified; that is expected for this game.
    chunkSizeWarningLimit: 1600,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
