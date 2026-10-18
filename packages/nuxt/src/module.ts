import { fileURLToPath } from "node:url";

type Nuxt = { options: { nitro: { preset?: string } } };

/** `modules: ["@oester/nuxt"]` builds the site for Oester. */
export default function oester(_options: unknown, nuxt: Nuxt): void {
  nuxt.options.nitro.preset = fileURLToPath(new URL("./preset.js", import.meta.url));
}

oester.meta = { name: "@oester/nuxt", configKey: "oester" };
