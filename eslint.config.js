import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores([
    'dist/**',
    'coverage/**',
    '.vercel/**',
    '.local/**',
    'output/**',
    '.playwright-cli/**',
    '.agents/skills/**',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/server/**'],
              message:
                'Browser code may share contracts, never server runtime code.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    rules: {
      'react-refresh/only-export-components': [
        'error',
        { allowConstantExport: true, allowExportNames: ['Route'] },
      ],
    },
  },
  {
    files: [
      'api/**/*.ts',
      'server/**/*.ts',
      'tests/**/*.ts',
      'tests/**/*.tsx',
      'scripts/**/*.ts',
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
]);
