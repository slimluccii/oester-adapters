import oester from "@oester/astro";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://astro-static.example",
  base: "/docs",
  trailingSlash: "always",
  adapter: oester(),
  redirects: {
    // Astro sends a redirect's destination as written, so one under the base includes it.
    "/start": "/docs/guide/intro/",
    "/moved": { status: 308, destination: "/docs/en/" },
  },
  i18n: {
    locales: ["en", "nl"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: true },
  },
});
