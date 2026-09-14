// ESLint 9 flat config.
//
// `eslint-config-next` 15.x still ships only legacy .eslintrc-style configs and
// loads @rushstack/eslint-patch, which throws under flat config. The underlying
// plugins work fine on their own, so they are wired up directly here.
import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import nextPlugin from '@next/eslint-plugin-next';
import reactPlugin from 'eslint-plugin-react';
import hooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'coverage/**',
      'next-env.d.ts',
      'assets-src/**',
      'public/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      '@next/next': nextPlugin,
      react: reactPlugin,
      'react-hooks': hooksPlugin,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...hooksPlugin.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,

      // The new JSX transform means React need not be in scope, and prop types
      // are TypeScript's job.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      // Canvas draw code legitimately reads many unused destructured values;
      // an underscore prefix marks those deliberate.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // `any` is banned by the project rules; this keeps it from creeping back.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Build and pipeline tooling is plain Node ESM, not part of the app bundle.
    files: ['scripts/**/*.mjs', '*.config.{mjs,ts}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      // Browser globals too: page.evaluate() bodies are serialised and run in
      // the page, so they legitimately reference window/localStorage.
      globals: { ...globals.node, ...globals.browser },
    },
    rules: { 'no-console': 'off' },
  },
];
