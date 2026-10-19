export default defineNuxtConfig({
  compatibilityDate: "2026-10-01",
  nitro: { preset: "@oester/nitro" },
  runtimeConfig: {
    apiSecret: "build-time",
    public: { greeting: "hi" },
  },
  experimental: { componentIslands: true },
  routeRules: {
    "/": { prerender: true },
    "/about": { prerender: true, headers: { "x-page": "about" } },
    "/old": { redirect: "/about" },
    "/moved": { redirect: { to: "/about", statusCode: 302 } },
    "/blog/**": { redirect: "/posts/**" },
    "/swr": { swr: 60 },
    "/isr": { isr: true },
    "/api/cors": { cors: true },
    "/spa": { ssr: false },
  },
});
