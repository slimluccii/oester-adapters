import { describe, expect, test } from "vitest";
import { astroManifest, type ManifestInput } from "./manifest.ts";

const page = (prerendered: boolean, type = "page", origin = "project") => ({
  type,
  isPrerendered: prerendered,
  origin,
});
const input = (overrides: Partial<ManifestInput> = {}): ManifestInput => ({
  routes: [page(true)],
  base: "/",
  trailingSlash: "ignore",
  assetsDir: "_astro",
  middlewareMode: "classic",
  usesServerIslands: false,
  ...overrides,
});

describe("astroManifest", () => {
  test("a site of prerendered pages only is served without a server", () => {
    const manifest = astroManifest(input());
    expect(manifest.routes).toEqual([{ match: "/*", type: "static" }]);
    expect(manifest.needsServer).toBe(false);
  });

  test("a page or endpoint rendered on request sends what no file answers to the server", () => {
    for (const type of ["page", "endpoint"]) {
      const manifest = astroManifest(input({ routes: [page(true), page(false, type)] }));
      expect(manifest.routes.at(-1)).toEqual({ match: "/*", type: "static-or-server" });
      expect(manifest.needsServer).toBe(true);
    }
  });

  test("Astro's internal routes for server islands and images alone need no server", () => {
    const manifest = astroManifest(
      input({
        routes: [page(true), page(false, "page", "internal"), page(false, "endpoint", "internal")],
      }),
    );
    expect(manifest.needsServer).toBe(false);
  });

  test("a server island on a prerendered page needs the server", () => {
    const manifest = astroManifest(
      input({ routes: [page(true), page(false, "page", "internal")], usesServerIslands: true }),
    );
    expect(manifest.needsServer).toBe(true);
    expect(manifest.routes.at(-1)).toEqual({ match: "/*", type: "static-or-server" });
  });

  test("Astro's own endpoints for actions, server islands and images never look for a file first", () => {
    const manifest = astroManifest(input({ routes: [page(false)] }));
    expect(manifest.routes.slice(0, 3)).toEqual([
      { match: "/_actions/*", type: "server" },
      { match: "/_server-islands/*", type: "server" },
      { match: "/_image", type: "server" },
    ]);
  });

  test("trailingSlash becomes htmlHandling", () => {
    expect(astroManifest(input({ trailingSlash: "always" })).htmlHandling).toBe(
      "force-trailing-slash",
    );
    expect(astroManifest(input({ trailingSlash: "never" })).htmlHandling).toBe(
      "drop-trailing-slash",
    );
    expect(astroManifest(input({ trailingSlash: "ignore" })).htmlHandling).toBe("auto");
  });

  test("the base is passed on, and / means none", () => {
    expect(astroManifest(input({ base: "/docs" })).base).toBe("/docs/");
    expect(astroManifest(input({ base: "/" })).base).toBeUndefined();
  });

  test("edge middleware runs for every path but the built assets, so prerendered pages pass through it too", () => {
    const manifest = astroManifest(input({ middlewareMode: "edge", assetsDir: "assets" }));
    expect(manifest.middleware).toEqual({ include: ["/*"], exclude: ["/assets/*"] });
    expect(manifest.needsServer).toBe(true);
  });

  test("Astro's built assets are hashed, so they never change under their name", () => {
    expect(astroManifest(input({ assetsDir: "assets" })).immutable).toEqual(["/assets/*"]);
  });

  test("classic middleware adds no middleware to the manifest", () => {
    expect(astroManifest(input({ routes: [page(false)] })).middleware).toBeUndefined();
  });
});
