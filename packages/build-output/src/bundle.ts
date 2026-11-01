import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build, type Metafile, type Plugin } from "esbuild";
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
      build.onResolve({ filter: /^(node:)?[a-z0-9_/]+$/ }, (args) => {
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
        // ES modules have no require, and the one module no import(), so both get the builtin through a module that imports it.
        if (args.kind === "require-call" || args.kind === "dynamic-import")
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

// Packages with a workerd export import .wasm as a compiled module; server/ holds only ES modules, so the bytes go inside.
const wasm: Plugin = {
  name: "oester-wasm",
  setup(build) {
    build.onLoad({ filter: /\.wasm$/, namespace: "file" }, (args) => ({
      contents: `import bytes from ${JSON.stringify(`${args.path}?bytes`)}; export default new WebAssembly.Module(bytes);`,
      loader: "js",
    }));
    build.onResolve({ filter: /\.wasm\?bytes$/ }, (args) => ({
      path: args.path.slice(0, -"?bytes".length),
      namespace: "oester-wasm-bytes",
    }));
    build.onLoad({ filter: /.*/, namespace: "oester-wasm-bytes" }, async (args) => ({
      contents: await readFile(args.path),
      loader: "binary",
    }));
  },
};

const megabyte = 1024 * 1024;
const warnAbove = 7 * megabyte;
const refuseAbove = 10 * megabyte;

/**
 * Bundles a server entry into `index.mjs`, one ES module that imports nothing but the Node builtins Oester provides:
 * a Bunny script is one file, and import() fails in it (0077).
 */
export async function bundleServer(options: BundleOptions): Promise<{ warnings: string[] }> {
  const alias = options.alias ?? {};
  const result = await build({
    entryPoints: { index: options.entry },
    bundle: true,
    write: false,
    metafile: true,
    format: "esm",
    platform: "neutral",
    target: "es2024",
    minify: true,
    outdir: options.outDir,
    outExtension: { ".js": ".mjs" },
    mainFields: ["module", "main"],
    conditions: [...(options.conditions ?? []), "workerd", "worker", "edge-light", "import"],
    // An import() of a bundled module becomes a call that evaluates it, and one of a computed name rejects when it runs.
    supported: { "dynamic-import": false },
    // Oester answers a deployment's fetch of its own static files from the deployment; globalThis.fetch would go around that.
    define: {
      "process.env.NODE_ENV": '"production"',
      "globalThis.fetch": "fetch",
      "import.meta": JSON.stringify({
        url: "file:///index.mjs",
        dirname: "/",
        filename: "/index.mjs",
      }),
      ...options.define,
    },
    // esbuild's require shim falls back to a global require; this one fails on every runtime, as the edge does.
    banner: {
      js: "var require=(n)=>{throw new Error(`cannot load ${n}: the Oester server module holds only what the build bundled`)};",
    },
    logLevel: "silent",
    plugins: [builtins(alias), wasm],
  }).catch((error: { errors?: { text: string }[]; message: string }) => {
    throw new Error(
      error.errors?.length ? error.errors.map((e) => e.text).join("\n") : error.message,
    );
  });
  const [file] = result.outputFiles;
  if (!file || result.outputFiles.length > 1)
    throw new Error(`the server bundle has ${result.outputFiles.length} files instead of one`);
  checkImports(result.metafile);
  const size = sizeWarning(file.contents.byteLength, result.metafile);
  await rm(options.outDir, { recursive: true, force: true });
  await mkdir(options.outDir, { recursive: true });
  await writeFile(join(options.outDir, "index.mjs"), file.contents);
  return { warnings: [...result.warnings.map((w) => w.text), ...(size ? [size] : [])] };
}

function checkImports(metafile: Metafile): void {
  for (const output of Object.values(metafile.outputs))
    for (const { path, kind } of output.imports) {
      const builtin = path.startsWith("node:") && nodeBuiltins.has(path.slice("node:".length));
      if (kind !== "import-statement" || !builtin)
        throw new Error(
          `the server bundle still imports ${path} (${kind}); it may import only the Node builtins Oester provides`,
        );
    }
}

function sizeWarning(bytes: number, metafile: Metafile): string | undefined {
  if (bytes <= warnAbove) return undefined;
  const largest = largestPackages(metafile)
    .map(([name, size]) => `${name} ${inMegabytes(size)}`)
    .join(", ");
  if (bytes > refuseAbove)
    throw new Error(
      `the server bundle is ${inMegabytes(bytes)}, above the 10 MB a Bunny script may be; its largest packages and files: ${largest}`,
    );
  return `the server bundle is ${inMegabytes(bytes)}, above the 7 MB a Bunny script reliably starts with; its largest packages and files: ${largest}`;
}

function largestPackages(metafile: Metafile): [string, number][] {
  const sizes = new Map<string, number>();
  for (const output of Object.values(metafile.outputs))
    for (const [input, { bytesInOutput }] of Object.entries(output.inputs)) {
      const name = packageOf(input);
      sizes.set(name, (sizes.get(name) ?? 0) + bytesInOutput);
    }
  return [...sizes].sort((a, b) => b[1] - a[1]).slice(0, 5);
}

function packageOf(input: string): string {
  const at = input.lastIndexOf("node_modules/");
  if (at === -1) return input;
  const [scope, name] = input.slice(at + "node_modules/".length).split("/");
  return scope!.startsWith("@") ? `${scope}/${name}` : scope!;
}

function inMegabytes(bytes: number): string {
  return `${(bytes / megabyte).toFixed(1)} MB`;
}
