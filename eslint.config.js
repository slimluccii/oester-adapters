import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "**/dist",
      "**/.oester",
      "**/.astro",
      "**/.nuxt",
      "**/.output",
      "**/.svelte-kit",
      "**/.next",
      "**/out",
      "**/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
);
