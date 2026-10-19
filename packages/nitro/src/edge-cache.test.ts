import { describe, expect, test } from "vitest";
import { edgeCacheRule } from "./edge-cache.ts";

describe("edgeCacheRule", () => {
  test("swr with a number caches at the edge for that long and serves stale while it renders again", () => {
    expect(edgeCacheRule({ cache: { swr: true, maxAge: 60 } })).toEqual({
      cache: false,
      headers: {
        "cache-control": "public, max-age=0, s-maxage=60, stale-while-revalidate=31536000",
      },
    });
  });

  test("swr: true keeps Nitro's default of one second", () => {
    expect(edgeCacheRule({ cache: { swr: true } })?.headers?.["cache-control"]).toBe(
      "public, max-age=0, s-maxage=1, stale-while-revalidate=31536000",
    );
  });

  test("a cache without swr, and a stale max age", () => {
    expect(edgeCacheRule({ cache: { maxAge: 30, swr: false } })?.headers?.["cache-control"]).toBe(
      "public, max-age=0, s-maxage=30",
    );
    expect(
      edgeCacheRule({ cache: { maxAge: 30, staleMaxAge: 120 } })?.headers?.["cache-control"],
    ).toBe("public, max-age=0, s-maxage=30, stale-while-revalidate=120");
  });

  test("isr with a number revalidates after it, isr: true keeps the page until the next deploy purges it", () => {
    expect(edgeCacheRule({ isr: 120 })?.headers?.["cache-control"]).toBe(
      "public, max-age=0, s-maxage=120, stale-while-revalidate=31536000",
    );
    expect(edgeCacheRule({ isr: true })?.headers?.["cache-control"]).toBe(
      "public, max-age=0, s-maxage=31536000",
    );
  });

  test("a cache-control the rule sets itself wins, and other headers stay", () => {
    expect(
      edgeCacheRule({ isr: 60, headers: { "Cache-Control": "public, s-maxage=5", "x-a": "1" } }),
    ).toEqual({
      cache: false,
      headers: { "Cache-Control": "public, s-maxage=5", "x-a": "1" },
    });
    expect(
      edgeCacheRule({ swr: 10, cache: { swr: true, maxAge: 10 }, headers: { "x-a": "1" } })
        ?.headers,
    ).toEqual({
      "x-a": "1",
      "cache-control": "public, max-age=0, s-maxage=10, stale-while-revalidate=31536000",
    });
  });

  test("a rule without caching is left alone", () => {
    expect(edgeCacheRule({ prerender: true })).toBeUndefined();
    expect(edgeCacheRule({ cache: false })).toBeUndefined();
    expect(edgeCacheRule({ isr: false })).toBeUndefined();
  });
});
