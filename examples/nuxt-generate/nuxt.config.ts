export default defineNuxtConfig({
  compatibilityDate: "2026-10-01",
  routeRules: { "/old": { redirect: "/guide/intro" } },
  nitro: {
    preset: "@oester/nitro",
    prerender: { routes: ["/", "/guide/intro", "/guide/advanced"] },
  },
});
