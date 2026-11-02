import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'test-results', 'playwright-report', '.wrangler'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // False positives for Date.now() inside event handlers; we don't use the React Compiler.
      'react-hooks/purity': 'off',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Security: never render raw HTML. All text must go through JSX escaping.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Raw HTML is not allowed (XSS risk).',
        },
        {
          selector: 'MemberExpression[property.name=/^(innerHTML|outerHTML)$/]',
          message: 'Raw HTML is not allowed (XSS risk).',
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: 'Raw HTML is not allowed (XSS risk).',
        },
        {
          selector: "JSXOpeningElement[name.name='select']",
          message:
            'Use the Choice component: WebKit styles <select> with an internal stylesheet that our CSP blocks.',
        },
      ],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['scripts/sw-template.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        __CACHE_VERSION__: 'readonly',
        __PRECACHE__: 'readonly',
      },
    },
  },
  {
    files: ['scripts/**', '*.config.*', 'tests/**'],
    languageOptions: { globals: { ...globals.node } },
  },
);
