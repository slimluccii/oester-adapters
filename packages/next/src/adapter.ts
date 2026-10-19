import { copyFile, lstat, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { writeOutput } from "@oester/build-output";
import type { NextAdapter } from "next";
import { oesterConfig, type ConfigSubset } from "./config.ts";
import { groupParts, virtualPath } from "./parts.ts";
import {
  manifestHeaders,
  manifestRedirects,
  middlewarePatterns,
  withTrailingSlashes,
} from "./routing.ts";
import type { FileContent } from "./runtime/modules.ts";
import type { Entry, ServerConfig } from "./runtime/server.ts";
import { filesBelow, isDirectory, isNativeCode, serverFile } from "./server-files.ts";
import { staticTarget } from "./static-files.ts";

type BuildContext = Parameters<NonNullable<NextAdapter["onBuildComplete"]>>[0];
type Outputs = BuildContext["outputs"];
type Output =
  | Outputs["pages"][number]
  | Outputs["pagesApi"][number]
  | Outputs["appPages"][number]
  | Outputs["appRoutes"][number];
type StaticFile = { pathname: string; file: string };

const runtimeEntry = fileURLToPath(new URL("./runtime/server.js", import.meta.url));

function warn(message: string): void {
  console.warn(`[oester] ${message}`);
}

/** The route-cache directory a prerendered file sits in, holding every variant Next wrote for its route. */
function routeCacheDirectory(file: string): string | undefined {
  return /^(.*[/\\]route-cache[/\\][^/\\]+[/\\][^/\\]+)[/\\]/.exec(file)?.[1];
}

async function onBuildComplete(ctx: BuildContext): Promise<void> {
  const { outputs, routing, config, projectDir, distDir, nextVersion } = ctx;
  const basePath = config.basePath ?? "";
  const trailingSlash = Boolean(config.trailingSlash);
  const staging = join(distDir, "oester");
  await rm(staging, { recursive: true, force: true });
  const staticDir = join(staging, "static");
  const common = {
    root: projectDir,
    framework: { name: "next", version: nextVersion },
    staticDir,
    base: basePath || undefined,
    htmlHandling: trailingSlash
      ? ("force-trailing-slash" as const)
      : ("drop-trailing-slash" as const),
    // Next names everything under _next/static by its content or build id.
    immutable: ["/_next/static/*"],
  };

  // A static export is the files Next wrote to its out directory, as they are; public/ is among them already.
  if (config.output === "export") {
    for (const file of outputs.staticFiles) {
      await mkdir(dirname(join(staticDir, file.id)), { recursive: true });
      await copyFile(file.filePath, join(staticDir, file.id));
    }
    // Without a notFound field Oester answers with 404.html, which the export writes.
    const { warnings } = await writeOutput({
      ...common,
      routes: [{ match: "/*", type: "static" }],
    });
    for (const warning of warnings) warn(warning);
    return;
  }

  const server = [...outputs.pages, ...outputs.pagesApi, ...outputs.appPages, ...outputs.appRoutes];
  const byId = new Map<string, Output>(server.map((output) => [output.id, output]));
  const staticFiles = await copyStaticFiles(ctx, staticDir, byId);
  const serverEntry = await writeServer(ctx, join(staging, "server"), server, byId, staticFiles);

  const { redirects, skipped: skippedRedirects } = manifestRedirects(
    routing.beforeMiddleware,
    basePath,
  );
  for (const source of skippedRedirects)
    warn(
      `The redirect from ${source} is answered by the server, so it does not apply to static files`,
    );
  const { headers, skipped: skippedHeaders } = manifestHeaders(routing.beforeMiddleware, basePath);
  for (const rule of skippedHeaders)
    warn(
      `The headers of ${rule} apply to server responses only: the manifest cannot carry them for static files`,
    );

  const { warnings } = await writeOutput({
    ...common,
    routes: [
      { match: "/_next/static/*", type: "static" },
      { match: "/*", type: "static-or-server" },
    ],
    redirects,
    headers,
    notFound: { type: "server" },
    middleware: outputs.middleware
      ? middlewarePatterns(routing.middlewareMatchers, staticFiles, basePath)
      : undefined,
    // @next/routing is bundled by ncc, which reads __dirname when it loads.
    server: { entry: serverEntry, define: { __dirname: JSON.stringify("/") } },
  });
  for (const warning of warnings) warn(warning);
}

/**
 * Copies what is served as it is: Next's static files, public/, and Pages Router pages prerendered for good, whose HTML
 * and data need no server. App Router prerenders are not among them: a client navigation asks for the same path with
 * an RSC header, which only the server can tell apart.
 */
async function copyStaticFiles(
  { outputs, config, projectDir }: BuildContext,
  staticDir: string,
  byId: Map<string, Output>,
): Promise<StaticFile[]> {
  const basePath = config.basePath ?? "";
  const staticFiles: StaticFile[] = [];
  async function add(pathname: string, filePath: string): Promise<void> {
    const file = staticTarget(pathname, filePath, basePath, Boolean(config.trailingSlash));
    if (!file) return warn(`${pathname} is outside the base path ${basePath}, so it is not served`);
    await mkdir(dirname(join(staticDir, file)), { recursive: true });
    await copyFile(filePath, join(staticDir, file));
    staticFiles.push({ pathname, file });
  }
  for (const file of outputs.staticFiles) await add(file.pathname, file.filePath);
  // Next leaves public/ to the platform: its files are served at their path under the base path.
  const publicDir = join(projectDir, "public");
  if (await isDirectory(publicDir))
    for (const file of await filesBelow(publicDir))
      await add(`${basePath}/${relative(publicDir, file).split(sep).join("/")}`, file);
  for (const prerender of outputs.prerenders) {
    const parent = byId.get(prerender.parentOutputId);
    const file = prerender.fallback?.filePath;
    if (
      parent &&
      file &&
      String(parent.type) === "PAGES" &&
      prerender.fallback?.initialRevalidate === false
    )
      await add(prerender.pathname, file);
  }
  return staticFiles;
}

/**
 * Writes the server: an entry with the routing Next resolved and the entries behind each pathname, and the files the
 * entries need as a virtual file system, split into parts that load when an entry first runs.
 */
async function writeServer(
  ctx: BuildContext,
  serverDir: string,
  server: Output[],
  byId: Map<string, Output>,
  staticFiles: StaticFile[],
): Promise<string> {
  const { outputs, routing, config, projectDir, repoRoot, buildId } = ctx;
  const basePath = config.basePath ?? "";
  const staticPaths = new Set(staticFiles.map((file) => file.pathname));

  // A prerendered page the server answers needs the files Next prerendered for its route.
  const prerenderedFiles = new Map<string, string[]>();
  for (const prerender of outputs.prerenders) {
    const parent = byId.get(prerender.parentOutputId);
    const file = prerender.fallback?.filePath;
    if (!parent || !file || staticPaths.has(prerender.pathname)) continue;
    const directory = routeCacheDirectory(file);
    const list = prerenderedFiles.get(parent.filePath) ?? [];
    list.push(...(directory ? await filesBelow(directory) : [file]));
    prerenderedFiles.set(parent.filePath, list);
  }

  const entries: Record<string, Entry> = {};
  const filesOf = new Map<string, Set<string>>();
  function addEntry(output: Output | NonNullable<Outputs["middleware"]>): string {
    const id = virtualPath(output.filePath, repoRoot);
    const files = filesOf.get(id) ?? new Set([output.filePath]);
    for (const asset of Object.values(output.assets)) files.add(asset);
    for (const file of prerenderedFiles.get(output.filePath) ?? []) files.add(file);
    filesOf.set(id, files);
    if (output.runtime === "edge") {
      const wasm = Object.entries(output.wasmAssets ?? {});
      for (const [, file] of wasm) files.add(file);
      entries[id] ??= {
        runtime: "edge",
        id,
        files: [...files].map((file) => virtualPath(file, repoRoot)),
        entry: virtualPath(output.edgeRuntime?.modulePath ?? output.filePath, repoRoot),
        entryKey: output.edgeRuntime?.entryKey ?? `middleware_${output.sourcePage}`,
        handlerExport: output.edgeRuntime?.handlerExport,
        env: output.config.env ?? {},
        wasm: Object.fromEntries(wasm.map(([name, file]) => [name, virtualPath(file, repoRoot)])),
      };
    } else entries[id] ??= { runtime: "nodejs", id, file: id };
    return id;
  }

  const pathnames: ServerConfig["pathnames"] = {};
  for (const output of server) pathnames[output.pathname] = { entry: addEntry(output) };
  for (const pathname of staticPaths) pathnames[pathname] ??= { file: true };
  // Routing resolves a prerendered path to itself, not to its dynamic route, when the route has no fallback.
  for (const prerender of outputs.prerenders) {
    const parent = byId.get(prerender.parentOutputId);
    if (parent) pathnames[prerender.pathname] ??= pathnames[parent.pathname]!;
  }
  const middleware = outputs.middleware && addEntry(outputs.middleware);

  const appNotFound = outputs.appPages.find((o) => o.pathname === `${basePath}/_not-found`);
  const errorPage = outputs.pages.find((o) => o.pathname === `${basePath}/_error`);
  const notFound: ServerConfig["notFound"] = appNotFound
    ? { entry: virtualPath(appNotFound.filePath, repoRoot) }
    : staticPaths.has(`${basePath}/404`)
      ? { file: `${basePath}/404` }
      : errorPage && { entry: virtualPath(errorPage.filePath, repoRoot) };

  // Every traced file once, symbolic links as links.
  const links: Record<string, string> = {};
  const contents = new Map<string, FileContent>();
  const skipped = new Set<string>();
  const virtualFiles: { id: string; files: string[] }[] = [];
  for (const [id, files] of filesOf) {
    const list: string[] = [];
    for (const file of files) {
      const virtual = virtualPath(file, repoRoot);
      const stats = await lstat(file);
      if (stats.isSymbolicLink()) {
        links[virtual] = virtualPath(await realpath(file), repoRoot);
        continue;
      }
      if (stats.isDirectory()) continue;
      if (!contents.has(virtual)) {
        const content = await serverFile(file, virtual);
        if (content === undefined) {
          if (isNativeCode(file)) skipped.add(virtual);
          continue;
        }
        contents.set(virtual, content);
      }
      list.push(virtual);
    }
    virtualFiles.push({ id, files: list });
  }
  if (skipped.size)
    warn(
      `Native code is left out, since the edge cannot load it; a route that needs it fails when it runs:\n  ${[...skipped].join("\n  ")}`,
    );

  const { parts, partsOf } = groupParts(virtualFiles);
  await mkdir(join(serverDir, "parts"), { recursive: true });
  for (const [index, part] of parts.entries()) {
    const record = Object.fromEntries(part.map((file) => [file, contents.get(file)]));
    await writeFile(
      join(serverDir, "parts", `${index}.mjs`),
      `export default ${JSON.stringify(record)};\n`,
    );
  }

  const serverConfig: ServerConfig = {
    buildId,
    basePath,
    projectDir: virtualPath(projectDir, repoRoot),
    links,
    builtAt: new Date().toISOString(),
    routing: { ...routing, caseSensitive: Boolean(config.experimental?.caseSensitiveRoutes) },
    pathnames: withTrailingSlashes(pathnames, Boolean(config.trailingSlash)),
    entries,
    middleware,
    notFound,
    partsOf,
  };
  await writeFile(join(serverDir, "config.json"), JSON.stringify(serverConfig));
  const entry = join(serverDir, "entry.mjs");
  await writeFile(
    entry,
    [
      `import { createServer } from ${JSON.stringify(runtimeEntry)};`,
      `import config from "./config.json";`,
      `export default createServer(config, [${parts.map((_, i) => `() => import("./parts/${i}.mjs")`).join(", ")}]);`,
      "",
    ].join("\n"),
  );
  return entry;
}

export const adapter: NextAdapter = {
  name: "oester",
  modifyConfig(config, { phase }) {
    if (phase !== "phase-production-build") return config;
    const result = oesterConfig(config as unknown as ConfigSubset);
    for (const warning of result.warnings) warn(warning);
    return result.config as unknown as typeof config;
  },
  onBuildComplete,
};
