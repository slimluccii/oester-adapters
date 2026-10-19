export default defineNuxtConfig({
  compatibilityDate: "2026-10-01",
  nitro: { preset: "@oester/nitro" },
  ssr: false,
  app: { baseURL: "/app/" },
});
