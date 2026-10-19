// Copied from slimluccii/oester serving/route.ts at 9d3a23e, with non-null assertions for this repository's stricter tsconfig; keep it in step with that file.
export type Pattern = string;

export type Route =
  | { match: Pattern; type: "static"; fallback?: string }
  | { match: Pattern; type: "server" }
  | { match: Pattern; type: "static-or-server" };

export type Manifest = {
  version: 3;
  compatibilityDate: string;
  base?: string;
  routes: Route[];
  middleware?: { include: Pattern[]; exclude?: Pattern[] };
  redirects?: { source: Pattern; destination: string; status: 301 | 302 | 307 | 308 }[];
  headers?: { source: Pattern; headers: Record<string, string> }[];
  immutable?: Pattern[];
  htmlHandling?: "auto" | "force-trailing-slash" | "drop-trailing-slash" | "none";
  notFound?: { type: "static"; file: string } | { type: "server" };
  server?: { entry: string };
};

export type Decision =
  | { kind: "file"; file: string; status: 200 | 404; headers: Record<string, string> }
  | { kind: "redirect"; location: string; status: 301 | 302 | 307 | 308 }
  | { kind: "server"; notFound: boolean }
  | { kind: "plain-not-found" }
  | { kind: "bad-request" };

type Lookup = { file: string } | { redirectTo: string } | null;

export function route(manifest: Manifest, files: ReadonlySet<string>, url: string): Decision {
  const raw = url.match(/^[a-z]+:\/\/[^/?#]*([^?#]*)(\?[^#]*)?/i);
  const query = raw?.[2] ?? "";
  const path = normalize(raw?.[1] || "/");
  if (path === null) return { kind: "bad-request" };

  const base = normalizeBase(manifest.base);
  let relative = path;
  if (base !== "/") {
    if (path === "/") return { kind: "redirect", location: base + query, status: 307 };
    // Relative links on the base's own page resolve below the base only with its trailing slash.
    if (path === base.slice(0, -1) && manifest.htmlHandling !== "none")
      return { kind: "redirect", location: base + query, status: 308 };
    if (path === base.slice(0, -1) || path === base) relative = "/";
    else if (path.startsWith(base)) relative = path.slice(base.length - 1);
    else return notFound(manifest, files, relative);
  }

  for (const redirect of manifest.redirects ?? []) {
    const params = match(redirect.source, relative);
    if (params) {
      const destination = substitute(redirect.destination, params);
      return {
        kind: "redirect",
        location: destination.includes("?") ? destination : destination + query,
        status: redirect.status,
      };
    }
  }

  const middleware = manifest.middleware;
  if (
    middleware &&
    middleware.include.some((p) => match(p, relative)) &&
    !(middleware.exclude ?? []).some((p) => match(p, relative))
  ) {
    return { kind: "server", notFound: false };
  }

  for (const r of manifest.routes) {
    if (!match(r.match, relative)) continue;
    if (r.type === "server") return { kind: "server", notFound: false };
    const found = lookup(relative, files, manifest.htmlHandling ?? "auto");
    if (found && "redirectTo" in found)
      return { kind: "redirect", location: prefix(base, found.redirectTo) + query, status: 308 };
    if (found) return serveFile(manifest, relative, found.file, 200);
    if (r.type === "static-or-server") return { kind: "server", notFound: false };
    if (r.fallback && files.has(r.fallback)) return serveFile(manifest, relative, r.fallback, 200);
    return notFound(manifest, files, relative);
  }
  return notFound(manifest, files, relative);
}

function normalize(rawPath: string): string | null {
  const segments = rawPath.split("/").map((s) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return null;
    }
  });
  if (segments.some((s) => s === null || s === ".." || s === ".")) return null;
  const trailing = rawPath.endsWith("/");
  const kept = (segments as string[]).filter((s) => s !== "");
  if (kept.length === 0) return "/";
  return "/" + kept.join("/") + (trailing ? "/" : "");
}

function normalizeBase(base: string | undefined): string {
  if (!base || base === "/") return "/";
  return "/" + base.replace(/^\/+|\/+$/g, "") + "/";
}

function prefix(base: string, relative: string): string {
  return base === "/" ? relative : base.slice(0, -1) + relative;
}

function match(pattern: Pattern, path: string): Record<string, string> | null {
  const want = pattern.split("/").filter((s) => s !== "");
  const have = path.split("/").filter((s) => s !== "");
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    const w = want[i]!;
    if (w === "*" && i === want.length - 1) {
      params.splat = have.slice(i).join("/");
      return params;
    }
    const h = have[i];
    if (h === undefined) return null;
    if (w.startsWith(":")) params[w.slice(1)] = h;
    else if (w !== h) return null;
  }
  return have.length === want.length ? params : null;
}

function substitute(destination: string, params: Record<string, string>): string {
  return destination.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (token, name) => params[name] ?? token);
}

function lookup(
  path: string,
  files: ReadonlySet<string>,
  mode: NonNullable<Manifest["htmlHandling"]>,
): Lookup {
  const key = path.slice(1);
  const has = (f: string) => files.has(f);
  if (mode === "none") return key && has(key) ? { file: key } : null;
  if (path === "/") return has("index.html") ? { file: "index.html" } : null;

  // A file's own name is not its URL when the site picked a trailing slash style, so it redirects to that URL.
  if (mode !== "auto" && has(key)) {
    if (key === "index.html" || key.endsWith("/index.html")) {
      const directory = `/${key.slice(0, -"index.html".length)}`;
      return {
        redirectTo:
          mode === "drop-trailing-slash" && directory !== "/" ? directory.slice(0, -1) : directory,
      };
    }
    if (mode === "drop-trailing-slash" && key.endsWith(".html"))
      return { redirectTo: `/${key.slice(0, -".html".length)}` };
  }

  const trailing = path.endsWith("/");
  const bare = trailing ? key.slice(0, -1) : key;
  const dotted = (bare.split("/").pop() ?? "").includes(".");
  if (!trailing && dotted) return has(key) ? { file: key } : null;

  const index = `${bare}/index.html`;
  const html = `${bare}.html`;
  if (mode === "force-trailing-slash") {
    if (trailing) return has(index) ? { file: index } : null;
    if (has(index)) return { redirectTo: `/${bare}/` };
    return has(key) ? { file: key } : null;
  }
  if (mode === "drop-trailing-slash") {
    if (trailing) return has(html) || has(index) ? { redirectTo: `/${bare}` } : null;
    for (const f of [html, index, key]) if (has(f)) return { file: f };
    return null;
  }
  const candidates = trailing ? [index, html] : [index, html, key];
  for (const f of candidates) if (has(f)) return { file: f };
  return null;
}

function serveFile(manifest: Manifest, path: string, file: string, status: 200 | 404): Decision {
  const headers: Record<string, string> = {};
  for (const rule of manifest.headers ?? []) {
    if (!match(rule.source, path)) continue;
    for (const [name, value] of Object.entries(rule.headers)) headers[name.toLowerCase()] = value;
  }
  if ((manifest.immutable ?? []).some((pattern) => match(pattern, path)))
    headers["cache-control"] = "public, max-age=31536000, immutable";
  // The not-found page found at its own path is still the not-found page.
  const notFoundFile =
    manifest.notFound === undefined
      ? "404.html"
      : manifest.notFound.type === "static"
        ? manifest.notFound.file
        : undefined;
  return { kind: "file", file, status: file === notFoundFile ? 404 : status, headers };
}

function notFound(manifest: Manifest, files: ReadonlySet<string>, path: string): Decision {
  if (manifest.notFound?.type === "server") return { kind: "server", notFound: true };
  const file = manifest.notFound?.type === "static" ? manifest.notFound.file : "404.html";
  if (files.has(file)) return serveFile(manifest, path, file, 404);
  return { kind: "plain-not-found" };
}
