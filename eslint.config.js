import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  { ignores: ["dist/", "test-results/", "playwright-report/"] },
  js.configs.recommended,
  { ...reactHooks.configs.flat.recommended, files: ["src/**/*.{js,jsx}"] },
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser },
    },
  },
  { files: ["scripts/**", "tests/**", "*.config.js"], languageOptions: { globals: { ...globals.node, ...globals.browser } } },
];
