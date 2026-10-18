import { describe, expect, test } from "vitest";
import { get } from "../../e2e/get.ts";

const renderedAt = async (path: string) =>
  (await (await get(path)).text()).match(/rendered at (?:<!-- -->)?([\d:.TZ-]+)/)?.[1];

describe("base", () => {
  test("Vite's base is the site's base: the root redirects into it", async () => {
    const response = await get("/");
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!, "https://x").pathname).toBe("/docs/");
  });

  test("a path outside the base is not found", async () => {
    expect((await get("/about")).status).toBe(404);
  });

  test("client assets are served under the base", async () => {
    const html = await (await get("/docs/")).text();
    const script = html.match(/src="(\/docs\/assets\/[^"]+\.js)"/)?.[1];
    expect(script).toBeDefined();
    expect((await get(script!)).status).toBe(200);
  });
});

describe("prerendered pages", () => {
  test("are served as static files, with and without a trailing slash", async () => {
    const bare = await get("/docs");
    expect([bare.status, bare.headers.get("location")]).toEqual([308, "/docs/"]);
    for (const path of ["/docs/", "/docs/about", "/docs/about/"]) {
      const response = await get(path);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).not.toBe("no-store");
    }
    expect(await (await get("/docs/about")).text()).toContain("About these docs");
  });

  test("keep the time they were rendered at build", async () => {
    const first = await renderedAt("/docs/guides/intro");
    expect(first).toBeDefined();
    await new Promise((wait) => setTimeout(wait, 20));
    expect(await renderedAt("/docs/guides/intro")).toBe(first);
  });

  test("include pages listed in `pages` that no link reaches", async () => {
    expect(await (await get("/docs/guides/hidden")).text()).toMatch(/Guide (<!-- -->)?hidden/);
  });

  test("the sitemap and files from public/ are static", async () => {
    const sitemap = await get("/docs/sitemap.xml");
    expect(sitemap.status).toBe(200);
    expect(await sitemap.text()).toContain("<loc>https://example.com/about</loc>");
    expect(await (await get("/docs/robots.txt")).text()).toContain("User-agent");
  });
});

describe("pages rendered on request", () => {
  test("a dynamic path that was not prerendered is rendered by the server each time", async () => {
    const response = await get("/docs/guides/other");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const first = await renderedAt("/docs/guides/other");
    await new Promise((wait) => setTimeout(wait, 20));
    expect(await renderedAt("/docs/guides/other")).not.toBe(first);
  });

  test("a server function reads the deployment's variables", async () => {
    expect(await (await get("/docs/live")).text()).toMatch(/Live from (<!-- -->)?ams/);
  });

  test("a server route under the base answers", async () => {
    expect(await (await get("/docs/api/region")).json()).toEqual({ region: "ams" });
  });

  test("ssr: false renders only the pending component on the server", async () => {
    const html = await (await get("/docs/client-only")).text();
    expect(html).toContain("Client-only page loading");
    expect(html).not.toContain("Loaded in the");
  });

  test("ssr: 'data-only' runs the loader on the server but leaves rendering to the browser", async () => {
    const html = await (await get("/docs/data-only")).text();
    expect(html).toContain("Data-only page loading");
    expect(html).toMatch(/answer:42/);
  });

  test("an unknown page under the base renders the not-found component with 404", async () => {
    const response = await get("/docs/nope");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("No such page");
  });
});
