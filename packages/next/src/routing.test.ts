import { describe, expect, test } from "vitest";
import { manifestHeaders, manifestRedirects, middlewarePatterns, toPattern } from "./routing.ts";

describe("toPattern", () => {
  test("literal segments and plain parameters carry over, relative to the base path", () => {
    expect(toPattern("/old/:slug", "")).toEqual({ pattern: "/old/:slug", params: ["slug"] });
    expect(toPattern("/docs/old/:slug", "/docs")).toEqual({
      pattern: "/old/:slug",
      params: ["slug"],
    });
    expect(toPattern("/docs", "/docs")).toEqual({ pattern: "/", params: [] });
    expect(toPattern("/", "")).toEqual({ pattern: "/", params: [] });
  });

  test("a zero-or-more parameter at the end becomes *, bound as splat", () => {
    expect(toPattern("/:path*", "")).toEqual({ pattern: "/*", params: ["splat"] });
    expect(toPattern("/docs/a/:path*", "/docs")).toEqual({ pattern: "/a/*", params: ["splat"] });
  });

  test("what the manifest cannot match exactly the same is refused", () => {
    expect(toPattern("/plus/:p+", "")).toBeNull();
    expect(toPattern("/opt/:p?", "")).toBeNull();
    expect(toPattern("/re/:id(\\d+)", "")).toBeNull();
    expect(toPattern("/post-:id", "")).toBeNull();
    expect(toPattern("/a/(.*)", "")).toBeNull();
    expect(toPattern("/:path*/edit", "")).toBeNull();
    expect(toPattern("/nobase", "/docs")).toBeNull();
    expect(toPattern("/docsx/a", "/docs")).toBeNull();
  });
});

const redirect = (source: string, location: string, status = 308, extra = {}) => ({
  source,
  sourceRegex: "^unused$",
  headers: { Location: location },
  status,
  ...extra,
});

describe("manifestRedirects", () => {
  test("numbered captures in the destination become the source's parameter names", () => {
    const { redirects, skipped } = manifestRedirects(
      [
        redirect("/docs/old/:slug", "/docs/blog/$1"),
        redirect("/docs/a/:path*", "/docs/b/$1", 307),
        redirect("/docs/c/:x/:y", "/docs/d/$2/$1", 301),
        redirect("/docs/ext/:p", "https://example.com/$1"),
      ],
      "/docs",
    );
    expect(redirects).toEqual([
      { source: "/old/:slug", destination: "/docs/blog/:slug", status: 308 },
      { source: "/a/*", destination: "/docs/b/:splat", status: 307 },
      { source: "/c/:x/:y", destination: "/docs/d/:y/:x", status: 301 },
      { source: "/ext/:p", destination: "https://example.com/:p", status: 308 },
    ]);
    expect(skipped).toEqual([]);
  });

  test("routes that are not redirects, and the trailing slash redirects htmlHandling covers, are left out silently", () => {
    const { redirects, skipped } = manifestRedirects(
      [
        { source: "/:path*", sourceRegex: "", headers: { "x-a": "1" } },
        redirect("/:path+/", "/$1", 308, { priority: true }),
      ],
      "",
    );
    expect(redirects).toEqual([]);
    expect(skipped).toEqual([]);
  });

  test("conditions, a status the manifest lacks, a query in the destination or an inexpressible source stay with the server", () => {
    const { redirects, skipped } = manifestRedirects(
      [
        redirect("/cond", "/static", 307, { has: [{ type: "query", key: "go" }] }),
        redirect("/see", "/static", 303),
        redirect("/c/:x", "/d?q=$1", 307),
        redirect("/re/:id(\\d+)", "/static", 307),
        redirect("/nobase", "/docs/static", 307),
        redirect("/docs/ok", "/docs/static", 307),
      ],
      "/docs",
    );
    expect(redirects).toEqual([{ source: "/ok", destination: "/docs/static", status: 307 }]);
    expect(skipped).toEqual(["/cond", "/see", "/c/:x", "/re/:id(\\d+)", "/nobase"]);
  });
});

describe("manifestHeaders", () => {
  test("header rules become manifest headers for static files, names lowercased", () => {
    const { headers, skipped } = manifestHeaders(
      [
        { source: "/docs/:path*", sourceRegex: "", headers: { "X-Probe": "1" } },
        redirect("/docs/old", "/docs/new"),
      ],
      "/docs",
    );
    expect(headers).toEqual([{ source: "/*", headers: { "x-probe": "1" } }]);
    expect(skipped).toEqual([]);
  });

  test("headers Oester sets itself are dropped with a note, and inexpressible rules are noted", () => {
    const { headers, skipped } = manifestHeaders(
      [
        {
          source: "/static",
          sourceRegex: "",
          headers: { "Cache-Control": "max-age=1", "x-s": "s" },
        },
        { source: "/api/:p+", sourceRegex: "", headers: { "x-api": "1" } },
        {
          source: "/c",
          sourceRegex: "",
          headers: { "x-c": "1" },
          has: [{ type: "cookie", key: "a" }],
        },
      ],
      "",
    );
    expect(headers).toEqual([{ source: "/static", headers: { "x-s": "s" } }]);
    expect(skipped).toEqual(["Cache-Control on /static", "/api/:p+", "/c"]);
  });
});

const matcher = (sourceRegex: string, extra = {}) => ({ sourceRegex, ...extra });
const revalidate = { missing: [{ type: "header", key: "x-prerender-revalidate", value: "x" }] };

describe("middlewarePatterns", () => {
  const file = (pathname: string, path = pathname.slice(1)) => ({ pathname, file: path });
  const files = [
    file("/_next/static/chunks/a.js"),
    file("/_next/static/b/c.css"),
    file("/favicon.ico"),
    file("/pg", "pg.html"),
  ];

  test("without middleware no static file reaches the server", () => {
    expect(middlewarePatterns(undefined, files, "")).toBeUndefined();
  });

  test("a matcher that no static file matches needs no middleware field", () => {
    expect(middlewarePatterns([matcher("^\\/dyn$", revalidate)], files, "")).toBeUndefined();
  });

  test("the static files a matcher covers go to the server, Next's own assets as one pattern", () => {
    expect(middlewarePatterns([matcher("^/.*$")], files, "")).toEqual({
      include: ["/_next/static/*", "/favicon.ico", "/pg", "/pg.html"],
    });
  });

  test("a matcher excluding Next's assets keeps them static", () => {
    const excluding = matcher("^(?:\\/((?!_next\\/static|favicon.ico).*))$");
    expect(middlewarePatterns([excluding], files, "")).toEqual({ include: ["/pg", "/pg.html"] });
  });

  test("with a base path the files are matched in full and the patterns are relative to the base", () => {
    expect(
      middlewarePatterns(
        [matcher("^\\/docs\\/pg$")],
        [file("/docs/pg", "pg/index.html"), file("/docs/_next/static/a.js", "_next/static/a.js")],
        "/docs",
      ),
    ).toEqual({ include: ["/pg", "/pg/index.html"] });
  });

  test("matching ignores case, as Next does by default", () => {
    expect(middlewarePatterns([matcher("^\\/PG$")], [file("/pg", "pg.html")], "")).toEqual({
      include: ["/pg", "/pg.html"],
    });
  });

  test("a file whose name the pattern syntax cannot hold sends every path to the server", () => {
    expect(middlewarePatterns([matcher("^/.*$")], [file("/:odd.txt")], "")).toEqual({
      include: ["/*"],
    });
  });
});
