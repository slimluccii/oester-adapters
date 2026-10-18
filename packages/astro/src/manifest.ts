import type { HtmlHandling, Route } from "@oester/build-output";

export type ManifestInput = {
  routes: { type: string; isPrerendered: boolean; origin: string }[];
  base: string;
  trailingSlash: "always" | "never" | "ignore";
  assetsDir: string;
  middlewareMode: "classic" | "edge";
  /** Whether a prerendered page defers a server island, which only the server can render. */
  usesServerIslands: boolean;
};

const htmlHandling: Record<ManifestInput["trailingSlash"], HtmlHandling> = {
  always: "force-trailing-slash",
  never: "drop-trailing-slash",
  ignore: "auto",
};

/** The parts of the Oester manifest that follow from Astro's routes and configuration. */
export function astroManifest(input: ManifestInput) {
  // Astro always adds its internal routes for server islands and images, used or not.
  const rendersOnRequest =
    input.usesServerIslands ||
    input.routes.some(
      (r) =>
        !r.isPrerendered && r.origin !== "internal" && (r.type === "page" || r.type === "endpoint"),
    );
  const edge = input.middlewareMode === "edge";
  const needsServer = rendersOnRequest || edge;
  const base = input.base.replace(/^\/+|\/+$/g, "");
  const routes: Route[] = rendersOnRequest
    ? [
        { match: "/_actions/*", type: "server" },
        { match: "/_server-islands/*", type: "server" },
        { match: "/_image", type: "server" },
        { match: "/*", type: "static-or-server" },
      ]
    : [{ match: "/*", type: "static" }];
  return {
    ...(base ? { base: `/${base}/` } : {}),
    htmlHandling: htmlHandling[input.trailingSlash],
    routes,
    ...(edge
      ? {
          middleware: {
            include: ["/*"],
            exclude: [`/${input.assetsDir.replace(/^\/+|\/+$/g, "")}/*`],
          },
        }
      : {}),
    immutable: [`/${input.assetsDir.replace(/^\/+|\/+$/g, "")}/*`],
    needsServer,
  };
}
