import { AsyncLocalStorage } from "node:async_hooks";
import { isolatedGlobal } from "./global.ts";

/** An entry Next.js built for its edge runtime: scripts that register a handler on `self._ENTRIES`. */
export type EdgeEntry = {
  /** Every script and manifest the entry needs, by virtual path. */
  files: string[];
  /** The script that registers the entry; it runs last. */
  entry: string;
  entryKey: string;
  /** The export of the registered entry to call; `handler` unless Next.js says otherwise. */
  handlerExport?: string;
  /** The variables Next.js recorded for the entry at build time, such as the server actions key. */
  env: Record<string, string>;
  /** WebAssembly modules the entry expects as globals, by name and virtual path. */
  wasm?: Record<string, string>;
};

export type EdgeHandler = (request: Request, ctx: object) => Promise<Response>;

/**
 * Evaluates an edge entry's scripts against a global object of its own, which falls back to the real one: what they
 * register stays off the global the isolate shares with other deployments.
 */
export async function loadEdgeEntry(
  entry: EdgeEntry,
  host: {
    read(path: string): string;
    /** The builtins `require()` gives the scripts, which load the Node APIs Next's edge runtime has that way. */
    builtins: Readonly<Record<string, object>>;
    bytes?(path: string): Uint8Array;
    process: { env: Record<string, string | undefined> };
  },
): Promise<EdgeHandler> {
  const process = Object.create(host.process, {
    env: { value: { ...entry.env, ...host.process.env }, enumerable: true, writable: true },
  });
  const { sandbox, define } = isolatedGlobal();
  const require = (id: string) => {
    const builtin = host.builtins[id.startsWith("node:") ? id : `node:${id}`];
    if (!builtin) throw new Error(`${id} is not available in Next's edge runtime`);
    return builtin;
  };
  define("process", process);
  define("require", require);
  define("AsyncLocalStorage", AsyncLocalStorage);
  define("EdgeRuntime", "edge-runtime");
  define("_ENTRIES", {});
  define("self", sandbox);
  define("globalThis", sandbox);
  for (const [name, path] of Object.entries(entry.wasm ?? {}))
    define(name, await WebAssembly.compile(host.bytes!(path) as Uint8Array<ArrayBuffer>));

  const scripts = entry.files.filter((file) => file.endsWith(".js") && file !== entry.entry);
  const ordered = [
    ...scripts.filter((file) => !file.includes("/chunks/")),
    ...scripts.filter((file) => file.includes("/chunks/")),
    entry.entry,
  ];
  // The edge runtime's own globals are parameters too, for scripts that name them without globalThis.
  const parameters = [
    "globalThis",
    "self",
    "process",
    "require",
    "AsyncLocalStorage",
    "EdgeRuntime",
    "_ENTRIES",
  ];
  for (const file of ordered)
    new Function(...parameters, `${host.read(file)}\n//# sourceURL=${file}`)(
      ...parameters.map((name) => sandbox[name]),
    );
  const entries = sandbox._ENTRIES as
    Record<string, Promise<Record<string, EdgeHandler>>> | undefined;
  const registered = await entries?.[entry.entryKey];
  const handler = registered?.[entry.handlerExport ?? "handler"];
  if (!handler) throw new Error(`the edge entry ${entry.entryKey} did not register a handler`);
  return handler;
}
