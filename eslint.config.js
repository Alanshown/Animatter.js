import js from "@eslint/js";
import ts from "typescript-eslint";
export default ts.config(
  { ignores: ["**/dist/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs", "**/*.ts"],
    languageOptions: {
      globals: Object.fromEntries(
        [
          "scrollTo",
          "getSelection",
          "FormData",
          "EventTarget",
          "innerHeight",
          "innerWidth",
          "Element",
          "window",
          "document",
          "console",
          "performance",
          "requestAnimationFrame",
          "cancelAnimationFrame",
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
          "AbortController",
          "HTMLElement",
          "HTMLInputElement",
          "CustomEvent",
          "ResizeObserver",
          "MutationObserver",
          "matchMedia",
          "getComputedStyle",
          "navigator",
          "location",
          "process",
          "Buffer",
          "URL",
          "fetch",
        ].map((k) => [k, "readonly"]),
      ),
    },
  },
  {
    files: [
      "scripts/*test*.mjs",
      "scripts/core-cases.mjs",
      "scripts/capture.mjs",
    ],
    languageOptions: {
      globals: Object.fromEntries(
        [
          "world",
          "am",
          "events",
          "nativeClicks",
          "adapterWorlds",
          "unmountAdapters",
          "demoEvents",
          "pip",
        ].map((k) => [k, "readonly"]),
      ),
    },
  },
  { rules: { "@typescript-eslint/no-explicit-any": "error" } },
);
