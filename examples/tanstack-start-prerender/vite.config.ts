import oester from "@oester/tanstack-start";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/docs/",
  plugins: [
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
        // These stay server-rendered, to show both kinds of page side by side.
        filter: ({ path }) => !/live|client-only|data-only/.test(path),
      },
      pages: [{ path: "/guides/hidden" }],
      sitemap: { enabled: true, host: "https://example.com" },
    }),
    viteReact(),
    oester(),
  ],
});
