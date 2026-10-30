import { defineConfig, type Plugin } from 'vitest/config';
import theme from './src/data/theme.json' with { type: 'json' };

/** Fills `%GAME_NAME%` in index.html from the theme, so the title is right before any JS runs. */
function themeHtml(): Plugin {
  return {
    name: 'theme-html',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replaceAll('%GAME_NAME%', escapeHtml(theme.gameName)),
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
  plugins: [themeHtml()],
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
