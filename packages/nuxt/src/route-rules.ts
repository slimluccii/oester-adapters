import { isRefusedHeader, type HeaderRule, type Redirect } from "@oester/build-output";

type RouteRule = {
  redirect?: string | { to: string; statusCode?: number };
  headers?: Record<string, string>;
  [other: string]: unknown;
};

const statuses = new Set([301, 302, 307, 308]);

/** Translates Nitro route rules into manifest redirects and headers; what the manifest cannot express stays with Nitro. */
export function nuxtRouteRules(rules: Record<string, RouteRule>): {
  redirects: Redirect[];
  headers: HeaderRule[];
  skipped: string[];
} {
  const redirects: Redirect[] = [];
  const headers: HeaderRule[] = [];
  const skipped: string[] = [];

  for (const [path, rule] of Object.entries(rules)) {
    const source = sourcePattern(path);
    if (rule.redirect) {
      const to = typeof rule.redirect === "string" ? rule.redirect : rule.redirect.to;
      const status = typeof rule.redirect === "string" ? 307 : (rule.redirect.statusCode ?? 307);
      if (!source || !statuses.has(status)) skipped.push(path);
      else
        redirects.push({
          source,
          destination: path.endsWith("/**") && to.endsWith("/**") ? `${to.slice(0, -2)}:splat` : to,
          status: status as Redirect["status"],
        });
    }
    if (rule.headers) {
      const kept: Record<string, string> = {};
      for (const [name, value] of Object.entries(rule.headers)) {
        // Browser cache times come from the platform's edge rules (0033), and Nuxt sets cache-control on its own assets on every build.
        if (name.toLowerCase() === "cache-control") continue;
        if (isRefusedHeader(name)) skipped.push(`${name} on ${path}`);
        else kept[name.toLowerCase()] = value;
      }
      if (!Object.keys(kept).length) continue;
      if (!source) skipped.push(path);
      else headers.push({ source, headers: kept });
    }
  }
  return { redirects, headers, skipped };
}

function sourcePattern(path: string): string | null {
  const segments = path.split("/").filter(Boolean);
  let wildcards = 0;
  const out: string[] = [];
  for (const [index, segment] of segments.entries()) {
    if (segment === "**") {
      if (index !== segments.length - 1) return null;
      out.push("*");
    } else if (segment === "*") out.push(`:segment${++wildcards}`);
    else if (segment.includes("*")) return null;
    else out.push(segment);
  }
  return `/${out.join("/")}`;
}
