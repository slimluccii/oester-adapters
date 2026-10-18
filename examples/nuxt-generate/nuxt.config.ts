export default defineNuxtConfig({
  compatibilityDate: "2026-10-01",
  modules: ["@oester/nuxt"],
  routeRules: { "/old": { redirect: "/guide/intro" } },
  nitro: { prerender: { routes: ["/", "/guide/intro", "/guide/advanced"] } },
});
