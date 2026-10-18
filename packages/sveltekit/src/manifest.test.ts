import { describe, expect, test } from "vitest";
import { oesterManifest, type SvelteKitBuild } from "./manifest.ts";

const build = (overrides: Partial<SvelteKitBuild> = {}): SvelteKitBuild => ({
  base: "",
  appDir: "_app",
  routes: [{ id: "/", prerender: true }],
  remoteFunctions: false,
  pages: new Map([["/", { file: "index.html" }]]),
  redirects: new Map(),
  ...overrides,
});

describe("routes", () => {
  test("a fully prerendered app is served without a server", () => {
    const result = oesterManifest(build());
    expect(result.server).toBe(false);
    expect(result.routes).toEqual([{ match: "/*", type: "static" }]);
  });

  test("a route that is not prerendered, or only when reachable, needs the server", () => {
    for (const prerender of [false, "auto"] as const) {
      const result = oesterManifest(
        build({
          routes: [
            { id: "/", prerender: true },
            { id: "/blog/[slug]", prerender },
          ],
        }),
      );
      expect(result.server).toBe(true);
      expect(result.routes).toEqual([
        { match: "/_app/immutable/*", type: "static" },
        { match: "/*", type: "static-or-server" },
      ]);
    }
  });

  test("hashed assets stay static under a custom app directory", () => {
    const result = oesterManifest(
      build({ appDir: "assets", routes: [{ id: "/", prerender: false }] }),
    );
    expect(result.routes[0]).toEqual({ match: "/assets/immutable/*", type: "static" });
  });

  test("remote functions need the server even when every page is prerendered", () => {
    expect(oesterManifest(build({ remoteFunctions: true })).server).toBe(true);
  });
});

describe("htmlHandling", () => {
  test("pages prerendered as name.html drop the trailing slash, as trailingSlash 'never' does", () => {
    const pages = new Map([
      ["/", { file: "index.html" }],
      ["/about", { file: "about.html" }],
      ["/blog/hello", { file: "blog/hello.html" }],
    ]);
    expect(oesterManifest(build({ pages })).htmlHandling).toBe("drop-trailing-slash");
  });

  test("pages prerendered as name/index.html force the trailing slash, as trailingSlash 'always' does", () => {
    const pages = new Map([
      ["/", { file: "index.html" }],
      ["/about/", { file: "about/index.html" }],
    ]);
    expect(oesterManifest(build({ pages })).htmlHandling).toBe("force-trailing-slash");
  });

  test("without prerendered pages beyond the root, Oester's default applies", () => {
    const result = oesterManifest(build());
    expect(result.htmlHandling).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  test("a mix of both falls back to Oester's default, with a warning", () => {
    const pages = new Map([
      ["/about", { file: "about.html" }],
      ["/docs/", { file: "docs/index.html" }],
    ]);
    const result = oesterManifest(build({ pages }));
    expect(result.htmlHandling).toBeUndefined();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("/about");
    expect(result.warnings[0]).toContain("/docs/");
  });

  test("the base path does not count as a trailing slash", () => {
    const pages = new Map([
      ["/docs", { file: "index.html" }],
      ["/docs/about", { file: "about.html" }],
    ]);
    expect(oesterManifest(build({ base: "/docs", pages })).htmlHandling).toBe(
      "drop-trailing-slash",
    );
  });
});

describe("redirects", () => {
  test("redirects met while prerendering become manifest redirects, relative to the base", () => {
    const redirects = new Map([
      ["/docs/old", { status: 301, location: "/docs/new" }],
      ["/docs/moved", { status: 307, location: "https://example.com/" }],
    ]);
    expect(oesterManifest(build({ base: "/docs", redirects })).redirects).toEqual([
      { source: "/old", destination: "/docs/new", status: 301 },
      { source: "/moved", destination: "https://example.com/", status: 307 },
    ]);
  });

  test("a status or a path the manifest cannot carry is left to the prerendered page, with a warning", () => {
    const redirects = new Map([
      ["/see-other", { status: 303, location: "/" }],
      ["/:literal", { status: 301, location: "/" }],
      ["/old", { status: 308, location: "/new" }],
    ]);
    const result = oesterManifest(build({ redirects }));
    expect(result.redirects).toEqual([{ source: "/old", destination: "/new", status: 308 }]);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain("/see-other");
    expect(result.warnings[1]).toContain("/:literal");
  });
});
