import { describe, expect, test } from "vitest";
import { staticTarget } from "./static-files.ts";

describe("staticTarget", () => {
  test("assets keep their path, relative to the base path", () => {
    expect(staticTarget("/_next/static/chunks/a.js", "/x/a.js", "", false)).toBe(
      "_next/static/chunks/a.js",
    );
    expect(staticTarget("/docs/_next/static/a.css", "/x/a.css", "/docs", false)).toBe(
      "_next/static/a.css",
    );
    expect(staticTarget("/robots.txt", "/x/robots.txt", "", true)).toBe("robots.txt");
  });

  test("an HTML page sits where htmlHandling looks for it", () => {
    expect(staticTarget("/pg", "/x/server/pages/pg.html", "", false)).toBe("pg.html");
    expect(staticTarget("/pg", "/x/server/pages/pg.html", "", true)).toBe("pg/index.html");
    expect(staticTarget("/a/b", "/x/server/pages/a/b.html", "", false)).toBe("a/b.html");
    expect(staticTarget("/docs", "/x/server/pages/index.html", "/docs", false)).toBe("index.html");
    expect(staticTarget("/", "/x/server/pages/index.html", "", true)).toBe("index.html");
  });

  test("a path outside the base path has no place in the output", () => {
    expect(staticTarget("/other.txt", "/x/other.txt", "/docs", false)).toBeNull();
  });
});
