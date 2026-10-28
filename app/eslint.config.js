import js from "@eslint/js";
import ts from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-config-prettier";
import globals from "globals";
import svelteConfig from "./svelte.config.js";

export default [
  { ignores: ["dist/", "dev-dist/", "node_modules/", "public/icon-*.png"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts"],
    languageOptions: {
      parserOptions: { parser: ts.parser, svelteConfig },
    },
  },
  {
    files: ["scripts/**", "*.config.js", "*.config.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ["src/**/*.test.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    rules: {
      // SvelteKit-only rule; this app is plain Vite with hash links.
      "svelte/no-navigation-without-resolve": "off",
      // tasks/CONVENTIONS.md: plain linear async/await, no promise plumbing.
      "no-restricted-syntax": [
        "error",
        {
          selector: 'NewExpression[callee.name="Promise"]',
          message: "No `new Promise` wrappers (tasks/CONVENTIONS.md). Use plain async/await.",
        },
        {
          selector:
            'CallExpression[callee.object.name="Promise"][callee.property.name=/^(all|allSettled|race|any)$/]',
          message:
            "No `Promise.all` or its siblings (tasks/CONVENTIONS.md). A loop that awaits is fine.",
        },
      ],
    },
  },
];
