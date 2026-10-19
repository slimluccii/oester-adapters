import { expect, test } from "vitest";
import { nitroRouteRules } from "./route-rules.ts";

test("redirects keep Nitro's status: 307 for a string, the given one for an object", () => {
  const result = nitroRouteRules({
    "/old": { redirect: "/about" },
    "/moved": { redirect: { to: "/about", statusCode: 302 } },
  });
  expect(result.redirects).toEqual([
    { source: "/old", destination: "/about", status: 307 },
    { source: "/moved", destination: "/about", status: 302 },
  ]);
  expect(result.skipped).toEqual([]);
});

test("** at the end becomes * in the source and :splat in a destination that also ends in **", () => {
  const result = nitroRouteRules({
    "/blog/**": { redirect: "/posts/**" },
    "/shop/**": { redirect: "/store" },
  });
  expect(result.redirects).toEqual([
    { source: "/blog/*", destination: "/posts/:splat", status: 307 },
    { source: "/shop/*", destination: "/store", status: 307 },
  ]);
});

test("a single * and :name each match one segment", () => {
  const result = nitroRouteRules({
    "/a/*/b": { redirect: "/c" },
    "/u/:id": { redirect: "/users/:id" },
  });
  expect(result.redirects).toEqual([
    { source: "/a/:segment1/b", destination: "/c", status: 307 },
    { source: "/u/:id", destination: "/users/:id", status: 307 },
  ]);
});

test("headers become manifest headers, without the ones Oester refuses", () => {
  const result = nitroRouteRules({
    "/about": { headers: { "x-fixture": "about", "set-cookie": "a=1" } },
  });
  expect(result.headers).toEqual([{ source: "/about", headers: { "x-fixture": "about" } }]);
  expect(result.skipped).toEqual(["set-cookie on /about"]);
});

test("0033: cache-control is dropped without a note, since edge rules set browser cache times", () => {
  const result = nitroRouteRules({
    "/about": { headers: { "cache-control": "public, max-age=60" } },
    "/_nuxt/**": { headers: { "cache-control": "immutable" } },
  });
  expect(result).toEqual({ redirects: [], headers: [], skipped: [] });
});

test("a pattern the manifest cannot express, or an unsupported status, is left to the server with a note", () => {
  const result = nitroRouteRules({
    "/a/**/b": { redirect: "/c" },
    "/x": { redirect: { to: "/y", statusCode: 303 } },
    "/ok": { redirect: "/fine" },
  });
  expect(result.redirects).toEqual([{ source: "/ok", destination: "/fine", status: 307 }]);
  expect(result.skipped).toEqual(["/a/**/b", "/x"]);
});

test("rules without a redirect or headers add nothing", () => {
  expect(nitroRouteRules({ "/": { prerender: true }, "/api/**": { cors: true } })).toEqual({
    redirects: [],
    headers: [],
    skipped: [],
  });
});
