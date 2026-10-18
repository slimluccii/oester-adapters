import oester from "@oester/astro";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://astro-edge.example",
  adapter: oester({ middlewareMode: "edge" }),
});
