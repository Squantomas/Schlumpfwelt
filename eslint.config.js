import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const SIM_IMPORT_MESSAGE =
  'src/sim/ ist reines TypeScript: kein Phaser und keine Imports aus scenes/, ui/, save/ oder main (siehe CLAUDE.md).';

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

  // Playwright scripts: callbacks of page.evaluate() run in the browser.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // Architecture rule: the simulation must stay independent of Phaser, the
  // display and the browser, so it can be unit-tested and saved as plain data.
  {
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'phaser', message: SIM_IMPORT_MESSAGE }],
          patterns: [
            {
              group: ['phaser/*', '**/scenes', '**/scenes/**', '**/ui', '**/ui/**', '**/save', '**/save/**', '**/main'],
              message: SIM_IMPORT_MESSAGE,
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...['window', 'document', 'navigator', 'localStorage', 'sessionStorage', 'indexedDB', 'Phaser'].map(
          (name) => ({ name, message: 'src/sim/ darf nicht auf Browser oder Phaser zugreifen.' }),
        ),
      ],
      'no-restricted-syntax': [
        'error',
        { selector: 'ImportExpression', message: 'Keine dynamischen Imports in src/sim/.' },
      ],
    },
  },
);
