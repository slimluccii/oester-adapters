import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { outputDirectory, writeOutput } from "@oester/build-output";
import type { Plugin, ResolvedConfig } from "vite";
import { planManifest } from "./plan.ts";

export type OesterOptions = {
  /** For SPA mode: where the shell is, and which paths its server routes live under. */
  spa?: {
    /** The shell's path in the client output, when `spa.prerender.outputPath` moved it from `/_shell`. */
    shell?: string;
    /** Patterns sent to the server instead of the shell, besides server functions. Defaults to `["/api/*"]`. */
    serverPaths?: string[];
  };
};

const startPostBuild = "tanstack-start-core:post-build";
const defaultShell = "_shell.html";

/** Writes `.oester/output` at the end of `vite build`, after TanStack Start has prerendered. */
export default function oester(options: OesterOptions = {}): Plugin {
  let config: ResolvedConfig;
  let serverEntry: string | undefined;

  return {
    name: "oester",
    apply: "build",
    enforce: "post",
    configResolved(resolved) {
      config = resolved;
      const names = resolved.plugins.map((plugin) => plugin.name);
      if (!names.includes(startPostBuild))
        throw new Error("@oester/tanstack-start needs TanStack Start's tanstackStart() plugin");
      if (names.indexOf("oester") < names.indexOf(startPostBuild))
        throw new Error(
          "List oester() after tanstackStart() in the Vite plugins, so the output includes the prerendered pages",
        );
    },
    writeBundle(outputOptions, bundle) {
      if (this.environment.name !== "ssr") return;
      const entries = Object.values(bundle).filter((file) => file.type === "chunk" && file.isEntry);
      const entry = entries.find((file) => file.name === "server") ?? entries[0];
      if (entry) serverEntry = join(outputOptions.dir ?? "", entry.fileName);
    },
    buildApp: {
      order: "post",
      async handler(builder) {
        const client = builder.environments.client?.config;
        if (!client || !serverEntry)
          throw new Error("TanStack Start did not build both its client and its server");
        const clientDir = resolve(config.root, client.build.outDir);
        const define = (key: string) => {
          const value = config.define?.[`process.env.${key}`];
          return typeof value === "string" ? (JSON.parse(value) as string) : "";
        };
        const shell =
          options.spa?.shell ??
          (existsSync(join(clientDir, defaultShell)) ? defaultShell : undefined);
        const plan = planManifest({
          publicBase: config.base,
          routerBasepath: define("TSS_ROUTER_BASEPATH"),
          serverFnBase: define("TSS_SERVER_FN_BASE") || "/_serverFn/",
          assetsDir: client.build.assetsDir,
          ...(shell ? { shell } : {}),
          ...(options.spa?.serverPaths ? { serverPaths: options.spa.serverPaths } : {}),
        });

        const entry = join(config.root, ".oester", "server-entry.mjs");
        const runtime = fileURLToPath(new URL("./runtime.js", import.meta.url));
        const specifier = (path: string) => JSON.stringify(path.replaceAll("\\", "/"));
        await mkdir(dirname(entry), { recursive: true });
        await writeFile(
          entry,
          `import { createHandler } from ${specifier(runtime)};\n` +
            `import server from ${specifier(resolve(config.root, serverEntry))};\n` +
            `export default createHandler(server);\n`,
        );

        const { warnings } = await writeOutput({
          root: config.root,
          framework: { name: "tanstack-start", ...frameworkVersion(config.root) },
          staticDir: clientDir,
          ...plan,
          server: { entry },
        });
        for (const warning of warnings) config.logger.warn(warning);
        config.logger.info(`Wrote ${outputDirectory}`);
      },
    },
  };
}

function frameworkVersion(root: string): { version?: string } {
  const require = createRequire(join(root, "package.json"));
  for (const name of ["@tanstack/react-start", "@tanstack/solid-start", "@tanstack/vue-start"]) {
    try {
      const path = require.resolve(`${name}/package.json`);
      return { version: (JSON.parse(readFileSync(path, "utf8")) as { version: string }).version };
    } catch {
      continue;
    }
  }
  return {};
}
