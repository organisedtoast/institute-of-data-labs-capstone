const js = require("@eslint/js");
const globals = require("globals");
const reactHooks = require("eslint-plugin-react-hooks");
const reactRefreshPlugin = require("eslint-plugin-react-refresh");
const reactRefresh = reactRefreshPlugin.default || reactRefreshPlugin.reactRefresh || reactRefreshPlugin;

module.exports = [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      ".vite/**",
    ],
  },
  {
    ...js.configs.recommended,
    files: ["**/*.{js,cjs,mjs,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
        varsIgnorePattern: "^(React|_)",
        ignoreRestSiblings: true,
      }],
    },
  },
  {
    files: ["src/**/*.{js,jsx}", "services/stockSearchApi.js", "vite.config.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    files: ["src/**/*.jsx"],
    rules: {
      // The repo does not currently install `eslint-plugin-react`, so core
      // `no-unused-vars` cannot see component symbols consumed only through JSX.
      "no-unused-vars": "off",
    },
  },
  {
    files: [
      "src/**/*.{test,spec}.{js,jsx}",
      "src/test/**/*.js",
      "tests/**/*.js",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.vitest,
      },
    },
  },
];
