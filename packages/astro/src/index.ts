import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AstroConfig,
  AstroIntegration,
  CacheProviderConfig,
  IntegrationResolvedRoute,
} from "astro";
import {
  isRefusedHeader,
  outputDirectory,
  writeOutput,
  type HeaderRule,
} from "@oester/build-output";
import { astroManifest } from "./manifest.ts";
import { astroRedirects } from "./redirects.ts";

export type { OesterLocals } from "./runtime/handler.ts";

export type Options = {
  /**
   * `"edge"` runs the site's middleware before every request but those for built assets, prerendered pages and public
   * files included. `"classic"` runs it only for pages rendered on request, as Astro does by default.
   */
  middlewareMode?: "classic" | "edge";
};

async function referencesServerIslands(clientDir: string): Promise<boolean> {
  for (const file of await readdir(clientDir, { recursive: true })) {
    if (
      file.endsWith(".html") &&
      (await readFile(join(clientDir, file), "utf8")).includes("/_server-islands/")
    )
      return true;
  }
  return false;
}

const runtime = (name: string) => fileURLToPath(new URL(`./runtime/${name}.js`, import.meta.url));

/** Astro's route caching through Oester's edge cache: `cache: { provider: oesterCache() }`. */
export function oesterCache(): CacheProviderConfig {
  return { name: "oester", entrypoint: "@oester/astro/cache" };
}

export default function oester(options: Options = {}): AstroIntegration {
  const middlewareMode = options.middlewareMode ?? "classic";
  let config: AstroConfig;
  let routes: IntegrationResolvedRoute[] = [];
  let middlewareEntry: URL | undefined;
  const staticHeaders: HeaderRule[] = [];

  // Astro runs this hook after those of the integrations the site lists, so the output holds what they wrote.
  const output: AstroIntegration = {
    name: "@oester/astro:output",
    hooks: {
      "astro:build:done": async ({ logger }) => {
        const root = fileURLToPath(config.root);
        const { needsServer, ...manifest } = astroManifest({
          routes,
          base: config.base,
          trailingSlash: config.trailingSlash,
          assetsDir: config.build.assets,
          middlewareMode,
          usesServerIslands: await referencesServerIslands(fileURLToPath(config.build.client)),
        });
        const { redirects, skipped } = astroRedirects(routes);
        for (const path of skipped)
          logger.warn(
            `The redirect from ${path} cannot be expressed in the Oester manifest, so Astro's server answers it.`,
          );

        let entry = join(fileURLToPath(config.build.server), config.build.serverEntry);
        if (middlewareMode === "edge") {
          if (!middlewareEntry)
            throw new Error('middlewareMode "edge" needs a src/middleware file');
          entry = join(fileURLToPath(config.build.server), "oester-edge-entry.mjs");
          const i18n = {
            defaultLocale: config.i18n?.defaultLocale,
            locales: config.i18n?.locales.map((l) => (typeof l === "string" ? l : l.path)),
          };
          await writeFile(
            entry,
            [
              `import * as server from ${JSON.stringify(join(fileURLToPath(config.build.server), config.build.serverEntry))};`,
              `import { onRequest } from ${JSON.stringify(fileURLToPath(middlewareEntry))};`,
              `import { withEdgeMiddleware } from ${JSON.stringify(runtime("edge-middleware"))};`,
              `export default withEdgeMiddleware(server, onRequest, ${JSON.stringify(i18n)});`,
            ].join("\n"),
          );
        }

        const { warnings } = await writeOutput({
          root,
          framework: { name: "astro" },
          staticDir: fileURLToPath(config.build.client),
          ...manifest,
          redirects,
          headers: staticHeaders,
          ...(needsServer ? { server: { entry } } : {}),
        });
        for (const warning of warnings) logger.warn(warning);
        logger.info(`Wrote ${outputDirectory}`);
      },
    },
  };

  return {
    name: "@oester/astro",
    hooks: {
      "astro:config:setup": ({ updateConfig, config: initial }) => {
        updateConfig({ integrations: [output] });
        // Sharp needs native bindings the edge does not have: it optimizes images at build, and the edge serves them as they are.
        const service = initial.image.service;
        const runtimeService = "runtime" in service ? service.runtime : service;
        if (runtimeService.entrypoint.includes("services/sharp")) {
          const build = "build" in service ? service.build : service;
          updateConfig({
            image: {
              service: { build, runtime: { entrypoint: "astro/assets/services/noop", config: {} } },
            },
          });
        }
      },
      "astro:config:done": ({ setAdapter, config: resolved }) => {
        config = resolved;
        setAdapter({
          name: "@oester/astro",
          entrypointResolution: "auto",
          serverEntrypoint: runtime("handler"),
          adapterFeatures: {
            middlewareMode,
            staticHeaders: true,
            preserveBuildClientDir: true,
            preserveBuildServerDir: true,
          },
          supportedAstroFeatures: {
            hybridOutput: "stable",
            staticOutput: "stable",
            serverOutput: "stable",
            envGetSecret: "stable",
            i18nDomains: "experimental",
            sharpImageService: {
              support: "limited",
              message:
                "Sharp optimizes images on prerendered pages at build; pages rendered on request serve images as they are.",
            },
          },
        });
      },
      "astro:routes:resolved": ({ routes: resolved }) => {
        routes = resolved;
      },
      "astro:build:ssr": ({ middlewareEntryPoint }) => {
        middlewareEntry = middlewareEntryPoint;
      },
      "astro:build:generated": ({ routeToHeaders }) => {
        for (const [source, { headers }] of routeToHeaders) {
          const kept = Object.fromEntries(
            [...headers.entries()].filter(
              ([name]) => name !== "content-type" && name !== "location" && !isRefusedHeader(name),
            ),
          );
          if (Object.keys(kept).length) staticHeaders.push({ source, headers: kept });
        }
      },
    },
  };
}
