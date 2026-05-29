import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "src-tauri/**"] },

  // Application and engine source.
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  // Engine import boundary: pure TypeScript with no UI, DOM, Tauri, or I/O.
  // This is the enforcement half of the engine/UI separation (ADR 0002).
  {
    files: ["src/engine/**/*.ts"],
    ignores: ["src/engine/**/*.{test,spec}.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-dom", "react/*", "react-dom/*"],
              message: "The engine must stay framework-free (no React).",
            },
            {
              group: ["@tauri-apps/*"],
              message: "The engine must not call Tauri APIs.",
            },
            {
              group: ["@ui", "@ui/*"],
              message: "The engine must not depend on UI code.",
            },
            {
              group: ["zustand", "zustand/*"],
              message: "The engine owns no store bindings.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "The engine must not touch the DOM." },
        { name: "document", message: "The engine must not touch the DOM." },
        { name: "navigator", message: "The engine must not touch the DOM." },
        { name: "localStorage", message: "The engine performs no I/O." },
      ],
    },
  },

  // Test files run under Vitest globals.
  {
    files: ["src/**/*.{test,spec}.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        vi: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
    },
  },

  // Ambient declaration files may use triple-slash references.
  {
    files: ["**/*.d.ts"],
    rules: { "@typescript-eslint/triple-slash-reference": "off" },
  },

  prettier,
);
