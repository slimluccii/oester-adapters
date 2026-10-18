import type { HtmlHandling, Redirect, Route } from "@oester/build-output";

/** What the manifest is derived from, as SvelteKit's builder reports it after the build. */
export type SvelteKitBuild = {
  /** `paths.base`: empty, or a path such as `/docs` without a trailing slash. */
  base: string;
  appDir: string;
  routes: { id: string; prerender: boolean | "auto" }[];
  remoteFunctions: boolean;
  /** Prerendered pages by path; `/about` is written as `about.html`, `/about/` as `about/index.html`. */
  pages: ReadonlyMap<string, { file: string }>;
  /** Redirects met while prerendering, by path including the base. */
  redirects: ReadonlyMap<string, { status: number; location: string }>;
};

export type OesterManifest = {
  server: boolean;
  routes: Route[];
  redirects: Redirect[];
  htmlHandling?: HtmlHandling;
  warnings: string[];
};

const redirectStatuses = new Set([301, 302, 307, 308]);

export function oesterManifest(build: SvelteKitBuild): OesterManifest {
  const warnings: string[] = [];
  const server = build.remoteFunctions || build.routes.some((route) => route.prerender !== true);
  const routes: Route[] = server
    ? [
        // Hashed assets are all in the file table, so a miss there never needs SvelteKit.
        { match: `/${build.appDir}/immutable/*`, type: "static" },
        { match: "/*", type: "static-or-server" },
      ]
    : [{ match: "/*", type: "static" }];

  const htmlHandling = trailingSlashOf(build, warnings);
  const redirects: Redirect[] = [];
  for (const [path, { status, location }] of build.redirects) {
    const source = path.slice(build.base.length) || "/";
    if (!redirectStatuses.has(status) || !isLiteral(source)) {
      warnings.push(
        `The prerendered redirect from ${path} (${status}) cannot be an Oester redirect, so its prerendered page answers instead.`,
      );
      continue;
    }
    redirects.push({ source, destination: location, status: status as Redirect["status"] });
  }

  return { server, routes, redirects, ...(htmlHandling ? { htmlHandling } : {}), warnings };
}

// SvelteKit's trailingSlash is a page option, so it is read back from how the pages were written.
function trailingSlashOf(build: SvelteKitBuild, warnings: string[]): HtmlHandling | undefined {
  const paths = [...build.pages.keys()]
    .map((path) => path.slice(build.base.length))
    .filter((path) => path !== "" && path !== "/");
  const slashed = paths.filter((path) => path.endsWith("/"));
  const bare = paths.filter((path) => !path.endsWith("/"));
  if (slashed.length && bare.length) {
    warnings.push(
      `Pages use both trailingSlash 'always' (${slashed[0]}) and 'never' (${bare[0]}); Oester serves each prerendered page with and without the slash.`,
    );
    return undefined;
  }
  if (slashed.length) return "force-trailing-slash";
  if (bare.length) return "drop-trailing-slash";
  return undefined;
}

function isLiteral(path: string): boolean {
  return path.startsWith("/") && !path.split("/").some((s) => s.startsWith(":") || s.includes("*"));
}
