type Part = { content: string; dynamic: boolean; spread: boolean };
type Redirect = { source: string; destination: string; status: 301 | 302 | 307 | 308 };

export type RedirectRoute = {
  type: string;
  segments: Part[][];
  redirect?: string | { status: number; destination: string };
};

const statuses = new Set([301, 302, 307, 308]);

/** Translates Astro's redirect routes into manifest redirects; what the manifest cannot express stays with Astro's handler. */
export function astroRedirects(routes: RedirectRoute[]): {
  redirects: Redirect[];
  skipped: string[];
} {
  const redirects: Redirect[] = [];
  const skipped: string[] = [];
  for (const route of routes) {
    if (route.type !== "redirect" || !route.redirect) continue;
    const destination =
      typeof route.redirect === "string" ? route.redirect : route.redirect.destination;
    const status = typeof route.redirect === "string" ? 301 : route.redirect.status;
    const source = sourcePattern(route.segments);
    if (!source || !statuses.has(status)) {
      skipped.push(`/${route.segments.map((parts) => parts.map(written).join("")).join("/")}`);
      continue;
    }
    redirects.push({
      source,
      destination: destinationPattern(destination),
      status: status as Redirect["status"],
    });
  }
  return { redirects, skipped };
}

function sourcePattern(segments: Part[][]): string | null {
  const out: string[] = [];
  for (const [index, parts] of segments.entries()) {
    if (parts.length !== 1) return null;
    const part = parts[0]!;
    if (part.spread) {
      if (index !== segments.length - 1) return null;
      out.push("*");
    } else out.push(part.dynamic ? `:${part.content}` : part.content);
  }
  return `/${out.join("/")}`;
}

function destinationPattern(destination: string): string {
  return destination.replace(/\[\.\.\.[^\]]+\]/g, ":splat").replace(/\[([^\]]+)\]/g, ":$1");
}

function written(part: Part): string {
  return part.spread ? `[...${part.content}]` : part.dynamic ? `[${part.content}]` : part.content;
}
