import oester from "@oester/svelte";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // read() from $app/server is only exercised by assets that are not inlined
  build: { assetsInlineLimit: 0 },
  plugins: [sveltekit({ adapter: oester() })],
});
