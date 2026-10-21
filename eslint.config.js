import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

const NETWORK_MODULES = [
  'http',
  'https',
  'http2',
  'net',
  'tls',
  'dgram',
  'undici',
  'node:http',
  'node:https',
  'node:http2',
  'node:net',
  'node:tls',
  'node:dgram',
];

const GATE_MESSAGE = 'All network access goes through the egress gate in src/guardrails/egress.';

export default defineConfig(
  { ignores: ['dist/', 'coverage/', 'node_modules/', 'demo/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: NETWORK_MODULES.map((name) => ({ name, message: GATE_MESSAGE })) },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: GATE_MESSAGE },
        { name: 'WebSocket', message: GATE_MESSAGE },
        { name: 'XMLHttpRequest', message: GATE_MESSAGE },
      ],
    },
  },
  {
    files: ['src/guardrails/egress/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
      'no-restricted-globals': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
);
