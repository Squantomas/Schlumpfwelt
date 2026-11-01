import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const SIM_IMPORT_MESSAGE =
  'src/sim/ ist reines TypeScript: kein Phaser und keine Imports aus scenes/, ui/, save/, parent/ oder main (siehe CLAUDE.md).';

const PARENT_IMPORT_MESSAGE =
  'src/parent/ (Eltern, Tageslimit) ist Phaser-frei: kein Phaser und keine Imports aus scenes/, ui/ oder main (siehe CLAUDE.md).';

const SIM_DETERMINISM_MESSAGE =
  'src/sim/ ist deterministisch: keine Wanduhr, kein Math.random – Zeit kommt über die Ticks, Zufall nur über einen eigenen Seed-RNG in src/sim/.';

/** Browser, network, timers and wall clock – nothing the simulation may touch. */
const SIM_RESTRICTED_GLOBALS = [
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

export default defineConfig(
  globalIgnores(['dist/', 'coverage/', 'node_modules/']),

  js.configs.recommended,

  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },

  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        ...['describe', 'it', 'test'].flatMap((object) =>
          ['only', 'skip', 'todo'].map((property) => ({
            object,
            property,
            message: 'Tests nie deaktivieren oder einzeln laufen lassen (siehe CLAUDE.md).',
          })),
        ),
      ],
    },
  },

  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // The service worker template runs in a worker, not in the page; the build fills in the list of files.
  {
    files: ['scripts/swTemplate.js'],
    languageOptions: {
      globals: { ...globals.serviceworker, __FILES__: 'readonly' },
    },
  },

  // Playwright scripts: callbacks of page.evaluate() run in the browser.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // Architecture rule: the simulation must stay independent of Phaser, the
  // display and the browser, and deterministic (no wall clock, no Math.random),
  // so it can be unit-tested, replayed and saved as plain data.
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'phaser', message: SIM_IMPORT_MESSAGE }],
          patterns: [
            {
              group: ['phaser/*', '**/scenes', '**/scenes/**', '**/ui', '**/ui/**', '**/save', '**/save/**', '**/parent', '**/parent/**', '**/main'],
              message: SIM_IMPORT_MESSAGE,
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...SIM_RESTRICTED_GLOBALS.map((name) => ({
          name,
          message: 'src/sim/ darf nicht auf Browser, Netz, Timer, Wanduhr oder Phaser zugreifen.',
        })),
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: SIM_DETERMINISM_MESSAGE },
        { object: 'Math', property: 'random', message: SIM_DETERMINISM_MESSAGE },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: 'ImportExpression', message: 'Keine dynamischen Imports in src/sim/.' },
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: SIM_DETERMINISM_MESSAGE },
        { selector: "CallExpression[callee.name='Date']", message: SIM_DETERMINISM_MESSAGE },
      ],
    },
  },

  // The parents' layer (PIN, settings, the daily limit) keeps wall clock, date and storage out of the simulation, and
  // stays free of Phaser and the display, so it can be tested with made-up days and a memory store.
  {
    files: ['src/parent/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'phaser', message: PARENT_IMPORT_MESSAGE }],
          patterns: [
            {
              group: ['phaser/*', '**/scenes', '**/scenes/**', '**/ui', '**/ui/**', '**/main'],
              message: PARENT_IMPORT_MESSAGE,
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', { name: 'Phaser', message: PARENT_IMPORT_MESSAGE }],
      'no-restricted-syntax': ['error', { selector: 'ImportExpression', message: 'Keine dynamischen Imports in src/parent/.' }],
    },
  },
);
