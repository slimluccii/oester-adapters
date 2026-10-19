import oester from "@oester/svelte";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sveltekit({
      adapter: oester(),
      experimental: { remoteFunctions: true },
      compilerOptions: { experimental: { async: true } },
    }),
  ],
});
