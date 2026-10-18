import { existsSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { outputDirectory, writeOutput } from "@oester/build-output";
import { VERSION, type Adapter } from "@sveltejs/kit";
import type { HandlerConfig } from "./handler.ts";
import { oesterManifest } from "./manifest.ts";

export type { Context, Env, Platform } from "./handler.ts";

const handler = fileURLToPath(new URL("./handler.js", import.meta.url));
const fetchModule = fileURLToPath(new URL("./fetch.js", import.meta.url));

/** Writes the Oester build output to `.oester/output`. */
export default function oester(): Adapter {
  return {
    name: "@oester/sveltekit",
    async adapt(builder) {
      const tmp = builder.getBuildDirectory("oester");
      const staticDir = join(tmp, "static");
      const serverDir = builder.getServerDirectory();
      const { base } = builder.config.paths;
      rmSync(tmp, { recursive: true, force: true });

      const chunks = join(serverDir, "chunks");
      const manifest = oesterManifest({
        base,
        appDir: builder.config.appDir,
        routes: builder.routes,
        remoteFunctions:
          existsSync(chunks) && readdirSync(chunks).some((file) => file.startsWith("remote-")),
        pages: builder.prerendered.pages,
        redirects: builder.prerendered.redirects,
      });
      for (const warning of manifest.warnings) builder.log.warn(warning);

      // With a server, SvelteKit answers /_app/env.js itself from the deployment's variables.
      if (!manifest.server) builder.generateEnvModule();
      builder.writeClient(staticDir);
      builder.writePrerendered(staticDir);

      let entry: string | undefined;
      if (manifest.server) {
        entry = join(tmp, "index.js");
        builder.generateServerInstance(join(tmp, "server.js"));
        const config: HandlerConfig = { base };
        writeFileSync(
          entry,
          [
            `import { server } from "./server.js";`,
            `import { createHandler } from ${JSON.stringify(handler)};`,
            `export default createHandler(server, ${JSON.stringify(config)});`,
          ].join("\n"),
        );
        if (builder.hasServerInstrumentationFile()) {
          builder.instrument({
            entrypoint: entry,
            instrumentation: join(serverDir, "instrumentation.server.js"),
            initializer: builder.createInstrumentationInitializer({ outputDirectory: tmp }),
          });
        }
      }

      const { warnings } = await writeOutput({
        root: process.cwd(),
        framework: { name: "sveltekit", version: VERSION },
        staticDir,
        base,
        routes: manifest.routes,
        immutable: manifest.immutable,
        redirects: manifest.redirects,
        ...(manifest.htmlHandling ? { htmlHandling: manifest.htmlHandling } : {}),
        ...(entry ? { server: { entry, inject: [fetchModule] } } : {}),
      });
      for (const warning of warnings) builder.log.warn(warning);
      builder.log.minor(`Wrote ${outputDirectory}`);
    },
    supports: {
      read: () => true,
      instrumentation: () => true,
    },
  };
}
