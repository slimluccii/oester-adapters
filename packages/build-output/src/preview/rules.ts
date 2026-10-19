// Copied from slimluccii/oester ingest/rules.ts at 9d3a23e, with non-null assertions for this repository's stricter tsconfig; keep it in step with that file.
import type { Manifest } from "./route.ts";

export type Warning = { file: "_headers" | "_redirects"; line: number; message: string };

type HeaderRule = NonNullable<Manifest["headers"]>[number];
type RedirectRule = NonNullable<Manifest["redirects"]>[number];

const refusedHeaders = new Set([
  "set-cookie",
  "cache-control",
  "cdn-cache-control",
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "connection",
]);
const redirectStatuses = new Set([301, 302, 307, 308]);

export function isRefusedHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return refusedHeaders.has(lower) || lower.startsWith("cdn-") || lower.startsWith("x-oester-");
}

/** Translates `_headers` and `_redirects` into manifest entries; the adapter's own entries win on conflicts. Throws when the manifest itself sets a refused header. */
export function mergeRuleFiles(
  manifest: Manifest,
  ruleFiles: { headers?: string; redirects?: string },
): { manifest: Manifest; warnings: Warning[] } {
  for (const rule of manifest.headers ?? []) {
    for (const name of Object.keys(rule.headers)) {
      if (isRefusedHeader(name))
        throw new Error(
          `the manifest sets the header ${name} for ${rule.source}, which Oester does not allow`,
        );
    }
  }
  if (ruleFiles.headers === undefined && ruleFiles.redirects === undefined)
    return { manifest, warnings: [] };

  const warnings: Warning[] = [];
  const merged = { ...manifest };
  if (ruleFiles.headers !== undefined) {
    const fromFile = parseHeaders(ruleFiles.headers, manifest.headers ?? [], warnings);
    const headers = [...fromFile, ...(manifest.headers ?? [])];
    if (headers.length) merged.headers = headers;
  }
  if (ruleFiles.redirects !== undefined) {
    const fromFile = parseRedirects(ruleFiles.redirects, manifest.redirects ?? [], warnings);
    const redirects = [...(manifest.redirects ?? []), ...fromFile];
    if (redirects.length) merged.redirects = redirects;
  }
  return { manifest: merged, warnings };
}

function parseHeaders(text: string, adapter: HeaderRule[], warnings: Warning[]): HeaderRule[] {
  const warn = (line: number, message: string) =>
    warnings.push({ file: "_headers", line, message });
  const rules: HeaderRule[] = [];
  let current: HeaderRule | null = null;

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    if (!/^\s/.test(raw)) {
      current = { source: trimmed, headers: {} };
      rules.push(current);
      return;
    }
    if (!current) return warn(line, "a header line before any path is ignored");
    if (trimmed.startsWith("!"))
      return warn(line, `removing a header (${trimmed}) is not supported and is ignored`);
    const colon = trimmed.indexOf(":");
    if (colon <= 0) return warn(line, `"${trimmed}" is not a "name: value" line and is ignored`);
    const name = trimmed.slice(0, colon).trim().toLowerCase();
    const value = trimmed.slice(colon + 1).trim();
    if (isRefusedHeader(name))
      return warn(line, `the header ${name} is not allowed and is ignored`);
    const source = current.source;
    if (
      adapter.some(
        (r) => r.source === source && Object.keys(r.headers).some((n) => n.toLowerCase() === name),
      )
    ) {
      warn(line, `the framework adapter already sets ${name} for ${source}; its value wins`);
    }
    current.headers[name] = current.headers[name] ? `${current.headers[name]}, ${value}` : value;
  });

  return rules.filter((r) => Object.keys(r.headers).length > 0);
}

function parseRedirects(
  text: string,
  adapter: RedirectRule[],
  warnings: Warning[],
): RedirectRule[] {
  const warn = (line: number, message: string) =>
    warnings.push({ file: "_redirects", line, message });
  const rules: RedirectRule[] = [];

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed.startsWith("#")) return;
    const [source, destination, statusToken, ...rest] = trimmed.split(/\s+/);
    if (!destination) return warn(line, "a redirect needs a source and a destination; ignored");
    if ([destination, statusToken, ...rest].some((t) => t?.includes("=")))
      return warn(line, "query, country and language conditions are not supported; ignored");
    if (rest.length) return warn(line, `unexpected "${rest.join(" ")}" after the status; ignored`);
    if (statusToken?.endsWith("!"))
      return warn(line, "forced redirects are not supported; ignored");
    const status = statusToken === undefined ? 301 : Number(statusToken);
    if (status === 200) return warn(line, "rewrites (status 200) are not supported; ignored");
    if (!redirectStatuses.has(status))
      return warn(
        line,
        `status ${statusToken} is not a redirect status (301, 302, 307, 308); ignored`,
      );
    if (adapter.some((r) => r.source === source))
      warn(line, `the framework adapter already redirects ${source}; its rule wins`);
    rules.push({ source: source!, destination, status: status as RedirectRule["status"] });
  });

  return rules;
}
