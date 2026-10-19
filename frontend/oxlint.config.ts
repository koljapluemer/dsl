import { defineConfig } from 'oxlint';

/** Layers may only import from below: pages > meta > features > entities > dumb, api. Slices of one layer don't import each other. */
const below = {
  page: ['meta', 'feature', 'entity', 'dumb', 'api'],
  meta: ['feature', 'entity', 'dumb', 'api'],
  feature: ['entity', 'dumb', 'api'],
  entity: ['dumb', 'api'],
  dumb: [],
  api: [],
};

// react-hooks' React Compiler rules have no native oxlint port; rules-of-hooks and exhaustive-deps do (react plugin)
const compilerRules = {
  'static-components': 'error',
  'use-memo': 'error',
  'preserve-manual-memoization': 'error',
  'incompatible-library': 'warn',
  'immutability': 'error',
  'globals': 'error',
  'refs': 'error',
  'set-state-in-effect': 'error',
  'error-boundaries': 'error',
  'purity': 'error',
  'set-state-in-render': 'error',
  'unsupported-syntax': 'warn',
  'config': 'error',
  'gating': 'error',
} as const;

export default defineConfig({
  ignorePatterns: ['dist'],
  options: { typeAware: true },
  plugins: ['typescript', 'react', 'oxc', 'unicorn'],
  jsPlugins: [
    { name: 'react-hooks-js', specifier: 'eslint-plugin-react-hooks' },
    'eslint-plugin-boundaries',
  ],
  categories: { correctness: 'error' },
  settings: {
    'import/resolver': { typescript: true, node: true },
    'boundaries/elements': [
      { type: 'api', pattern: 'src/api' },
      { type: 'dumb', pattern: 'src/dumb' },
      { type: 'entity', pattern: 'src/entities/*', capture: ['slice'] },
      { type: 'feature', pattern: 'src/features/*', capture: ['slice'] },
      { type: 'meta', pattern: 'src/meta/*', capture: ['slice'] },
      { type: 'page', pattern: 'src/pages/*', capture: ['slice'] },
      // the rest: main, router and the App shell at the root
      { type: 'app', pattern: 'src' },
    ],
  },
  rules: {
    'react/rules-of-hooks': 'error',
    'react/exhaustive-deps': 'warn',
    ...Object.fromEntries(Object.entries(compilerRules).map(([rule, level]) => [`react-hooks-js/${rule}`, level])),
  },
  overrides: [{
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'boundaries/no-unknown-files': 'error',
      'boundaries/dependencies': ['error', {
        default: 'disallow',
        policies: [
          { allow: { dependency: { relationship: { to: 'internal' } } } },
          { from: { element: { type: 'app' } }, allow: { to: { element: { type: '*' } } } },
          ...Object.entries(below).map(([type, allowed]) => ({
            from: { element: { type } },
            allow: { to: { element: { types: { anyOf: allowed.length ? allowed : ['none'] } } } },
          })),
        ],
      }],
    },
  }],
});
