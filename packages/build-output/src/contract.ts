// The Oester build output, version 3: https://github.com/slimluccii/oester/blob/main/docs/build-output.md

export type RouteType = "static" | "server" | "static-or-server";
export type Route = { match: string; type: RouteType; fallback?: string };
export type Redirect = { source: string; destination: string; status: 301 | 302 | 307 | 308 };
export type HeaderRule = { source: string; headers: Record<string, string> };
export type HtmlHandling = "auto" | "force-trailing-slash" | "drop-trailing-slash" | "none";
export type NotFound = { type: "static"; file: string } | { type: "server" };

export type Manifest = {
  version: 3;
  framework: { name: string; version?: string };
  compatibilityDate: string;
  base?: string;
  routes: Route[];
  middleware?: { include: string[]; exclude?: string[] };
  redirects?: Redirect[];
  headers?: HeaderRule[];
  htmlHandling?: HtmlHandling;
  notFound?: NotFound;
  server?: { entry: string };
};

/** The runtime behavior the adapters in this release were written against. */
export const compatibilityDate = "2026-10-01";

export const redirectStatuses: ReadonlySet<number> = new Set([301, 302, 307, 308]);

const refusedHeaders = new Set([
  "set-cookie",
  "cache-control",
  "cdn-cache-control",
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "connection",
]);

/** Whether Oester refuses a header in the manifest's `headers`; cache times come from the platform, not from headers. */
export function isRefusedHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return refusedHeaders.has(lower) || lower.startsWith("cdn-") || lower.startsWith("x-oester-");
}

/** The Node builtins a server bundle may import, without their `node:` prefix. */
export const nodeBuiltins: ReadonlySet<string> = new Set([
  "assert",
  "assert/strict",
  "async_hooks",
  "buffer",
  "console",
  "crypto",
  "diagnostics_channel",
  "events",
  "path",
  "path/posix",
  "perf_hooks",
  "process",
  "querystring",
  "stream",
  "stream/consumers",
  "stream/promises",
  "stream/web",
  "string_decoder",
  "timers",
  "timers/promises",
  "url",
  "util",
  "util/types",
  "zlib",
]);

/** Whether a pattern is in the manifest's syntax: literal segments, `:name` segments, and `*` only as the last segment. */
export function isPattern(pattern: string): boolean {
  if (!pattern.startsWith("/")) return false;
  const segments = pattern.slice(1).split("/");
  return segments.every((segment, index) => {
    if (segment === "*") return index === segments.length - 1;
    if (segment.startsWith(":")) return /^:[A-Za-z_][A-Za-z0-9_]*$/.test(segment);
    return !segment.includes("*");
  });
}
