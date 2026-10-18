import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { nodeBuiltins, outputDirectory, writeOutput, type Route } from "@oester/build-output";
import { edgeCacheRule } from "./edge-cache.ts";
import { nuxtRouteRules } from "./route-rules.ts";

type Nitro = {
  options: {
    rootDir: string;
    baseURL: string;
    static: boolean;
    framework: { name?: string; version?: string };
    output: { publicDir: string; serverDir: string };
    routeRules: Record<string, Parameters<typeof edgeCacheRule>[0]>;
  };
  logger: { info(message: string): void; warn(message: string): void };
};

const builtins = [...nodeBuiltins].map((name) => `node:${name}`);

async function emit(nitro: Nitro): Promise<void> {
  const { options } = nitro;
  const { redirects, headers, skipped } = nuxtRouteRules(
    options.routeRules as Parameters<typeof nuxtRouteRules>[0],
  );
  for (const rule of skipped)
    nitro.logger.warn(
      `Not in the Oester manifest, so it applies only to responses from the server: ${rule}`,
    );
  const has = (file: string) => existsSync(join(options.output.publicDir, file));
  // nuxt generate prerenders every page, and writes 200.html as the shell of a single page app.
  const routes: Route[] = options.static
    ? [{ match: "/*", type: "static", ...(has("200.html") ? { fallback: "200.html" } : {}) }]
    : [{ match: "/*", type: "static-or-server" }];
  const { warnings } = await writeOutput({
    root: options.rootDir,
    framework: {
      name: options.framework.name || "nitro",
      ...(options.framework.version ? { version: options.framework.version } : {}),
    },
    staticDir: options.output.publicDir,
    base: options.baseURL,
    routes,
    ...(options.static && has("404.html")
      ? { notFound: { type: "static", file: "404.html" } }
      : {}),
    redirects,
    headers,
    ...(options.static ? {} : { server: { entry: join(options.output.serverDir, "index.mjs") } }),
  });
  for (const warning of warnings) nitro.logger.warn(warning);
  nitro.logger.info(`Wrote ${outputDirectory}`);
}

const state: { nitro?: Nitro } = {};

// A plain object rather than defineNitroPreset: nitro loads presets through jiti with nitropack aliased to nitropack/config.
export default {
  entry: fileURLToPath(new URL("./runtime/entry.js", import.meta.url)),
  node: false,
  noExternals: true,
  // Nitro's import() boundaries become parts Oester fetches on first use.
  inlineDynamicImports: false,
  serveStatic: false,
  minify: true,
  esbuild: { options: { target: "es2024" } },
  exportConditions: ["workerd", "worker", "edge-light"],
  // Oester gives every deployment its own process and the builtins it lists; unenv would swap in stubs and a shared global.
  unenv: {
    inject: { process: false },
    alias: Object.fromEntries(
      builtins.flatMap((name) => [
        [name, name],
        [name.slice("node:".length), name],
      ]),
    ),
    external: builtins,
  },
  rollupConfig: {
    output: {
      format: "esm",
      exports: "named",
      inlineDynamicImports: false,
      entryFileNames: "index.mjs",
      chunkFileNames: "chunks/[name]-[hash].mjs",
    },
  },
  hooks: {
    "rollup:before"(nitro: Nitro) {
      for (const rule of Object.values(nitro.options.routeRules)) {
        const cached = edgeCacheRule(rule);
        if (cached) Object.assign(rule, cached);
      }
    },
    // Prerendering can finish after compilation, so the output is written again once the prerendered pages exist.
    async compiled(nitro: Nitro) {
      state.nitro = nitro;
      await emit(nitro);
    },
    async "prerender:done"() {
      if (state.nitro) await emit(state.nitro);
    },
  },
  _meta: { name: "oester", url: import.meta.url },
};
