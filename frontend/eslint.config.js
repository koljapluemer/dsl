import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import boundaries from 'eslint-plugin-boundaries';

/** Layers may only import from below: pages > features > entities > dumb, api. Slices of one layer don't import each other. */
const below = {
  page: ['feature', 'entity', 'dumb', 'api'],
  feature: ['entity', 'dumb', 'api'],
  entity: ['dumb', 'api'],
  dumb: [],
  api: [],
};

export default tseslint.config(
  { ignores: ['dist'] },
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'import/resolver': { typescript: true, node: true },
      'boundaries/elements': [
        { type: 'api', pattern: 'src/api' },
        { type: 'dumb', pattern: 'src/dumb' },
        { type: 'entity', pattern: 'src/entities/*', capture: ['slice'] },
        { type: 'feature', pattern: 'src/features/*', capture: ['slice'] },
        { type: 'page', pattern: 'src/pages/*', capture: ['slice'] },
        // the rest: main, router and the App shell at the root
        { type: 'app', pattern: 'src' },
      ],
    },
    rules: {
      'boundaries/no-unknown-files': 2,
      'boundaries/dependencies': [2, {
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
  },
);
