import preact from "@astrojs/preact";
import oester, { oesterCache } from "@oester/astro";
import { defineConfig, envField, sessionDrivers } from "astro/config";

export default defineConfig({
  site: "https://astro-server.example",
  output: "server",
  adapter: oester(),
  integrations: [preact()],
  redirects: {
    "/old": "/about",
    "/moved": { status: 302, destination: "/about" },
    "/blog-old/[slug]": "/blog/[slug]",
  },
  env: {
    schema: {
      PUBLIC_GREETING: envField.string({ context: "client", access: "public", default: "hi" }),
      SECRET_TOKEN: envField.string({ context: "server", access: "secret" }),
    },
  },
  session: { driver: sessionDrivers.lruCache() },
  cache: { provider: oesterCache() },
  routeRules: { "/cached-rule": { maxAge: 120, swr: 30 } },
  i18n: {
    locales: ["en", "nl"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
    fallback: { nl: "en" },
  },
  security: { csp: true },
});
