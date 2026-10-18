import { describe, expect, test } from "vitest";
import provider from "./cache.ts";

const cache = provider(undefined);
const request = new Request("https://site.example/");

describe("the Oester cache provider", () => {
  test("a max age caches the response at the edge only, so visitors always ask Oester again", () => {
    const headers = cache.setHeaders!({ maxAge: 300 }, request);
    expect(headers.get("cache-control")).toBe("public, max-age=0, s-maxage=300");
  });

  test("stale-while-revalidate is passed on", () => {
    const headers = cache.setHeaders!({ maxAge: 60, swr: 30 }, request);
    expect(headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=30",
    );
  });

  test("last-modified and etag are set for revalidation", () => {
    const lastModified = new Date("2026-10-01T00:00:00Z");
    const headers = cache.setHeaders!({ lastModified, etag: '"v1"' }, request);
    expect(headers.get("last-modified")).toBe(lastModified.toUTCString());
    expect(headers.get("etag")).toBe('"v1"');
    expect(headers.has("cache-control")).toBe(false);
  });

  test("invalidating explains that Oester purges on every deploy instead", async () => {
    await expect(cache.invalidate({ tags: ["products"] })).rejects.toThrow(/every deploy/);
  });
});
