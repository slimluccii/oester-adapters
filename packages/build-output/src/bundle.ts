import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { build, type Plugin } from "esbuild";
import { nodeBuiltins } from "./contract.ts";

export type BundleOptions = {
  /** The module whose default export is `{ fetch(request, env, ctx) }`. */
  entry: string;
  outDir: string;
  /** Modules to use in place of others, by specifier: for a builtin the framework imports on a path the edge never takes. */
  alias?: Record<string, string>;
  /** Package export conditions, before the defaults `workerd`, `worker`, `edge-light` and `import`. */
  conditions?: string[];
  define?: Record<string, string>;
};

const allBuiltins = new Set([
  "fs",
  "fs/promises",
  "net",
  "tls",
  "http",
  "https",
  "http2",
  "os",
  "child_process",
  "worker_threads",
  "cluster",
  "dgram",
  "dns",
  "dns/promises",
  "module",
  "readline",
  "repl",
  "tty",
  "v8",
  "vm",
  "inspector",
  "sqlite",
  "test",
  "wasi",
  "trace_events",
  "punycode",
  "domain",
  "constants",
  "sys",
  ...nodeBuiltins,
]);

function builtins(alias: Record<string, string>): Plugin {
  return {
    name: "oester-builtins",
    setup(build) {
      build.onResolve({ filter: /^(node:)?[a-z_/]+$/ }, (args) => {
        const name = args.path.replace(/^node:/, "");
        if (!args.path.startsWith("node:") && !allBuiltins.has(name)) return undefined;
        const replacement = alias[args.path] ?? alias[`node:${name}`] ?? alias[name];
        if (replacement) return { path: replacement };
        if (!nodeBuiltins.has(name))
          return {
            errors: [
              {
                text: `node:${name} is not available on the Oester edge, imported by ${args.importer}`,
              },
            ],
          };
        // ES modules have no require, so a require() gets the builtin through a module that imports it.
        if (args.kind === "require-call")
          return { path: name, namespace: "oester-required-builtin" };
        return { path: `node:${name}`, external: true };
      });
      build.onLoad({ filter: /.*/, namespace: "oester-required-builtin" }, (args) => ({
        contents: `module.exports = require("oester-imported-builtin:${args.path}").default;`,
        loader: "js",
      }));
      build.onResolve({ filter: /^oester-imported-builtin:/ }, (args) => ({
        path: args.path.slice("oester-imported-builtin:".length),
        namespace: "oester-imported-builtin",
      }));
      // A builtin's default export is what require() returns in Node, so a callable module such as events stays callable.
      build.onLoad({ filter: /.*/, namespace: "oester-imported-builtin" }, (args) => ({
        contents: `import m from "node:${args.path}"; export default m;`,
        loader: "js",
      }));
    },
  };
}

/**
 * Bundles a server entry into `index.mjs` and the chunks it loads with import(), as ES modules that import nothing but
 * each other and the Node builtins Oester provides. Kept import() boundaries let Oester fetch a part only when a request reaches it.
 */
export async function bundleServer(options: BundleOptions): Promise<{ warnings: string[] }> {
  const alias = options.alias ?? {};
  const result = await build({
    entryPoints: { index: options.entry },
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    target: "es2024",
    minify: true,
    splitting: true,
    outdir: options.outDir,
    chunkNames: "chunks/[name]-[hash]",
    outExtension: { ".js": ".mjs" },
    mainFields: ["module", "main"],
    conditions: [...(options.conditions ?? []), "workerd", "worker", "edge-light", "import"],
    define: { "process.env.NODE_ENV": '"production"', ...options.define },
    logLevel: "silent",
    plugins: [builtins(alias)],
  }).catch((error: { errors?: { text: string }[]; message: string }) => {
    throw new Error(
      error.errors?.length ? error.errors.map((e) => e.text).join("\n") : error.message,
    );
  });
  await rm(options.outDir, { recursive: true, force: true });
  for (const file of result.outputFiles) {
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.contents);
  }
  return { warnings: result.warnings.map((w) => w.text) };
}
