import { describe, expect, test } from "vitest";
import { get } from "../../e2e/get.ts";

async function html(path: string): Promise<string> {
  const response = await get(path);
  expect(response.status).toBe(200);
  return response.text();
}

describe("a base path with trailing slashes", () => {
  test("the root of the host redirects to the base path", async () => {
    const response = await get("/");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/docs/");
  });

  test("the home page is served at the base path, with assets under it", async () => {
    const page = await html("/docs/");
    expect(page).toContain("<h1>Docs home</h1>");
    const scripts = [...page.matchAll(/src="(\/docs\/_next\/static\/[^"]+\.js)"/g)].map(
      (m) => m[1]!,
    );
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) expect((await get(script)).status).toBe(200);
  });

  test("a path without its trailing slash redirects to it", async () => {
    const response = await get("/docs/about");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/docs/about/");
  });

  test("a prerendered page and a page from generateStaticParams are served", async () => {
    expect(await html("/docs/about/")).toContain("About the docs");
    expect(await html("/docs/docs/intro/")).toContain("Doc <!-- -->intro");
  });

  test("a dynamic page renders, and the proxy runs for it", async () => {
    const response = await get("/docs/now/");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-base-path-proxy")).toBe("/docs");
    expect(await response.text()).toContain("rendered for");
  });

  test("a route handler answers under the base path, seeing its URL without it as in next start", async () => {
    const response = await get("/docs/api/ping/");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ pong: true, path: "/api/ping/" });
  });

  test("a public file is served under the base path", async () => {
    expect(await html("/docs/file.txt")).toBe("under the base path\n");
  });

  test("a redirect from next.config, whose destination Next prefixes with the base path", async () => {
    const response = await get("/docs/old-about/");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/docs/about/");
  });

  test("an unknown path under the base path is a 404 from Next", async () => {
    expect((await get("/docs/missing/")).status).toBe(404);
  });

  test("a path outside the base path is a 404", async () => {
    expect((await get("/elsewhere")).status).toBe(404);
  });
});
