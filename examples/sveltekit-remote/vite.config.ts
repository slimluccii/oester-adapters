import oester from "@oester/sveltekit";
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
