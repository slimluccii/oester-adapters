import { expect, test } from "vitest";
import { astroRedirects, type RedirectRoute } from "./redirects.ts";

const part = (content: string, dynamic = false, spread = false) => ({ content, dynamic, spread });
const route = (
  segments: RedirectRoute["segments"],
  redirect: RedirectRoute["redirect"],
): RedirectRoute => ({ type: "redirect", segments, redirect });

test("a static redirect keeps Astro's status: 301 for a string, the given one for an object", () => {
  const result = astroRedirects([
    route([[part("old")]], "/about"),
    route([[part("moved")]], { status: 302, destination: "/about" }),
  ]);
  expect(result.redirects).toEqual([
    { source: "/old", destination: "/about", status: 301 },
    { source: "/moved", destination: "/about", status: 302 },
  ]);
  expect(result.skipped).toEqual([]);
});

test("dynamic segments and a rest parameter become :name and *, in source and destination", () => {
  const result = astroRedirects([
    route([[part("blog")], [part("slug", true)]], "/posts/[slug]"),
    route([[part("docs")], [part("path", true, true)]], "/guide/[...path]"),
  ]);
  expect(result.redirects).toEqual([
    { source: "/blog/:slug", destination: "/posts/:slug", status: 301 },
    { source: "/docs/*", destination: "/guide/:splat", status: 301 },
  ]);
});

test("an external destination is kept as written", () => {
  expect(astroRedirects([route([[part("x")]], "https://example.com/y")]).redirects).toEqual([
    { source: "/x", destination: "https://example.com/y", status: 301 },
  ]);
});

test("a segment mixing text and a parameter, or a status the manifest cannot carry, is left to the server with a note", () => {
  const result = astroRedirects([
    route([[part("post-"), part("id", true)]], "/p/[id]"),
    route([[part("gone")]], { status: 300, destination: "/" }),
    route([[part("old")]], "/about"),
  ]);
  expect(result.redirects).toEqual([{ source: "/old", destination: "/about", status: 301 }]);
  expect(result.skipped).toEqual(["/post-[id]", "/gone"]);
});

test("routes that are not redirects are ignored", () => {
  expect(astroRedirects([{ type: "page", segments: [[part("about")]] }])).toEqual({
    redirects: [],
    skipped: [],
  });
});
