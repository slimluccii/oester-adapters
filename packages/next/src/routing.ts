import {
  isPattern,
  isRefusedHeader,
  redirectStatuses,
  type HeaderRule,
  type Redirect,
} from "@oester/build-output";

/** A route as Next.js hands it to adapters in `routing`. */
export type NextRoute = {
  source?: string;
  sourceRegex: string;
  destination?: string;
  headers?: Record<string, string>;
  has?: unknown[];
  missing?: unknown[];
  status?: number;
  priority?: boolean;
};

/**
 * Translates a Next.js source (path-to-regexp syntax, including the base path) into a manifest pattern relative to the
 * base, with its parameter names in order. Null when the manifest would not match exactly the same paths.
 */
export function toPattern(
  source: string,
  basePath: string,
): { pattern: string; params: string[] } | null {
  if (basePath) {
    if (source !== basePath && !source.startsWith(`${basePath}/`)) return null;
    source = source.slice(basePath.length) || "/";
  }
  const segments = source.split("/").slice(1);
  const out: string[] = [];
  const params: string[] = [];
  for (const [index, segment] of segments.entries()) {
    const parameter = /^:([A-Za-z_][A-Za-z0-9_]*)(\*)?$/.exec(segment);
    if (parameter) {
      if (parameter[2]) {
        if (index !== segments.length - 1) return null;
        out.push("*");
        params.push("splat");
      } else {
        out.push(`:${parameter[1]}`);
        params.push(parameter[1]!);
      }
    } else if (/[:*+?()[\]{}\\]/.test(segment)) return null;
    else out.push(segment);
  }
  const pattern = `/${out.join("/")}`;
  return isPattern(pattern) ? { pattern, params } : null;
}

const hasConditions = (route: NextRoute) => Boolean(route.has?.length || route.missing?.length);

/** The redirects of `routing.beforeMiddleware` the manifest can carry; the server applies every one of them anyway. */
export function manifestRedirects(
  routes: NextRoute[],
  basePath: string,
): { redirects: Redirect[]; skipped: string[] } {
  const redirects: Redirect[] = [];
  const skipped: string[] = [];
  for (const route of routes) {
    const location = route.headers?.Location ?? route.headers?.location;
    if (!route.status || !location || route.priority) continue;
    const source = route.source && toPattern(route.source, basePath);
    if (
      !source ||
      hasConditions(route) ||
      !redirectStatuses.has(route.status) ||
      location.includes("?")
    ) {
      skipped.push(route.source ?? route.sourceRegex);
      continue;
    }
    const destination = location.replace(/\$(\d+)/g, (whole, n: string) => {
      const name = source.params[Number(n) - 1];
      return name ? `:${name}` : whole;
    });
    if (/\$\d/.test(destination)) {
      skipped.push(route.source!);
      continue;
    }
    redirects.push({
      source: source.pattern,
      destination,
      status: route.status as Redirect["status"],
    });
  }
  return { redirects, skipped };
}

/** The header rules of `routing.beforeMiddleware` as manifest headers, which Oester adds to static files. */
export function manifestHeaders(
  routes: NextRoute[],
  basePath: string,
): { headers: HeaderRule[]; skipped: string[] } {
  const headers: HeaderRule[] = [];
  const skipped: string[] = [];
  for (const route of routes) {
    if (route.status || !route.headers) continue;
    const label = route.source ?? route.sourceRegex;
    const source = route.source && !hasConditions(route) && toPattern(route.source, basePath);
    if (!source) {
      skipped.push(label);
      continue;
    }
    const kept: Record<string, string> = {};
    for (const [name, value] of Object.entries(route.headers)) {
      if (isRefusedHeader(name)) skipped.push(`${name} on ${label}`);
      else kept[name.toLowerCase()] = value;
    }
    if (Object.keys(kept).length) headers.push({ source: source.pattern, headers: kept });
  }
  return { headers, skipped };
}

/**
 * The manifest's middleware field: the static files a middleware matcher covers, which must reach the server so the
 * middleware runs for them. Paths the server answers anyway need no pattern.
 */
export function middlewarePatterns(
  matchers: NextRoute[] | undefined,
  files: { pathname: string; file: string }[],
  basePath: string,
): { include: string[] } | undefined {
  if (!matchers) return undefined;
  const regexes = matchers.map((m) => new RegExp(m.sourceRegex, "i"));
  const include = new Set<string>();
  let nextAssets = false;
  for (const { pathname, file } of files) {
    if (!regexes.some((regex) => regex.test(pathname))) continue;
    if (file.startsWith("_next/static/")) {
      nextAssets = true;
      continue;
    }
    for (const path of [pathname.slice(basePath.length) || "/", `/${file}`]) {
      if (!isPattern(path) || path.split("/").some((s) => s.startsWith(":") || s === "*"))
        return { include: ["/*"] };
      include.add(path);
    }
  }
  const patterns = [...(nextAssets ? ["/_next/static/*"] : []), ...include];
  return patterns.length ? { include: patterns } : undefined;
}
