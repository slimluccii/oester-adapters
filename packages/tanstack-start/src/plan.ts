import type { Route } from "@oester/build-output";

export type PlanInput = {
  /** Vite's `base`: where the client assets are served from. */
  publicBase: string;
  /** The router basepath TanStack Start built with, derived from `base` unless configured. */
  routerBasepath: string;
  /** The path server functions are called on, including the router basepath. */
  serverFnBase: string;
  /** Vite's `build.assetsDir`, relative to the client output. */
  assetsDir: string;
  /** The single page app shell, relative to the client output, when SPA mode is on. */
  shell?: string;
  /** Where a single page app's server routes live; TanStack's hosting guide allow-lists `/api`. */
  serverPaths?: string[];
};

const trim = (path: string) => path.replace(/^\/+|\/+$/g, "");

/** The manifest's base and routes for a TanStack Start build. */
export function planManifest(input: PlanInput): { base?: string; routes: Route[] } {
  const remoteAssets = URL.canParse(input.publicBase);
  const publicBase = remoteAssets ? "" : trim(input.publicBase);
  const routerBasepath = trim(input.routerBasepath);
  if (!remoteAssets && publicBase !== routerBasepath)
    throw new Error(
      `The router basepath "/${routerBasepath}" differs from Vite's base "/${publicBase}". ` +
        `Oester serves a site under one base, so set Vite's base: "/${routerBasepath ? `${routerBasepath}/` : ""}" and leave router.basepath to follow it.`,
    );
  const base = routerBasepath ? `/${routerBasepath}/` : undefined;
  const withinBase = (path: string) => {
    const relative = trim(path);
    return trim(
      routerBasepath && relative.startsWith(routerBasepath)
        ? relative.slice(routerBasepath.length)
        : relative,
    );
  };

  const routes: Route[] = remoteAssets
    ? []
    : [{ match: `/${trim(input.assetsDir)}/*`, type: "static" }];
  if (input.shell) {
    routes.push({ match: `/${withinBase(input.serverFnBase)}/*`, type: "server" });
    for (const match of input.serverPaths ?? ["/api/*"]) routes.push({ match, type: "server" });
    routes.push({ match: "/*", type: "static", fallback: trim(input.shell) });
  } else routes.push({ match: "/*", type: "static-or-server" });
  return { ...(base ? { base } : {}), routes };
}
