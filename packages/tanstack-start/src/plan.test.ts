import { describe, expect, test } from "vitest";
import { planManifest } from "./plan.ts";

const defaults = {
  publicBase: "/",
  routerBasepath: "",
  serverFnBase: "/_serverFn/",
  assetsDir: "assets",
};

describe("planManifest", () => {
  test("a server-rendered app serves its files and sends every other path to the server", () => {
    expect(planManifest(defaults)).toEqual({
      routes: [
        { match: "/assets/*", type: "static" },
        { match: "/*", type: "static-or-server" },
      ],
      immutable: ["/assets/*"],
    });
  });

  test("a nested assets directory keeps its own static route", () => {
    expect(planManifest({ ...defaults, assetsDir: "/static/build/" }).routes[0]).toEqual({
      match: "/static/build/*",
      type: "static",
    });
  });

  test("Vite's base becomes the manifest base when the router basepath follows it", () => {
    expect(
      planManifest({
        ...defaults,
        publicBase: "/docs/",
        routerBasepath: "docs",
        serverFnBase: "/docs/_serverFn/",
      }).base,
    ).toBe("/docs/");
    expect(planManifest({ ...defaults, publicBase: "/docs/", routerBasepath: "/docs/" }).base).toBe(
      "/docs/",
    );
  });

  test("a router basepath that differs from Vite's base is refused, since assets and pages would sit under different bases", () => {
    expect(() => planManifest({ ...defaults, routerBasepath: "app" })).toThrow(/base: "\/app\/"/);
    expect(() =>
      planManifest({ ...defaults, publicBase: "/docs/", routerBasepath: "docs/v2" }),
    ).toThrow(/router basepath/);
  });

  test("with assets on another origin the router basepath alone sets the base", () => {
    expect(
      planManifest({ ...defaults, publicBase: "https://cdn.example.com/", routerBasepath: "app" }),
    ).toEqual({ base: "/app/", routes: [{ match: "/*", type: "static-or-server" }] });
  });

  test("a single page app falls back to its shell, with server functions and API paths kept on the server", () => {
    expect(planManifest({ ...defaults, shell: "_shell.html" })).toEqual({
      routes: [
        { match: "/assets/*", type: "static" },
        { match: "/_serverFn/*", type: "server" },
        { match: "/api/*", type: "server" },
        { match: "/*", type: "static", fallback: "_shell.html" },
      ],
      immutable: ["/assets/*"],
    });
  });

  test("the server function path of a single page app is relative to the base", () => {
    const { routes } = planManifest({
      ...defaults,
      publicBase: "/docs/",
      routerBasepath: "docs",
      serverFnBase: "/docs/rpc/",
      shell: "/custom-shell.html",
    });
    expect(routes.slice(1)).toEqual([
      { match: "/rpc/*", type: "server" },
      { match: "/api/*", type: "server" },
      { match: "/*", type: "static", fallback: "custom-shell.html" },
    ]);
  });

  test("a single page app can name the paths its server routes live under", () => {
    const { routes } = planManifest({
      ...defaults,
      shell: "_shell.html",
      serverPaths: ["/auth/*", "/webhooks/:provider"],
    });
    expect(routes.map((r) => r.match)).toEqual([
      "/assets/*",
      "/_serverFn/*",
      "/auth/*",
      "/webhooks/:provider",
      "/*",
    ]);
  });
});
