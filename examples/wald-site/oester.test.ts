import { describe, expect, it } from "vitest";
import { get } from "../../e2e/get.ts";

async function html(path: string): Promise<string> {
  const response = await get(path);
  expect(response.status, path).toBe(200);
  return response.text();
}

describe("wald-site on Oester", () => {
  it("serves the home page", async () => {
    expect(await html("/")).toContain("<title>Hello Wald</title>");
  });

  it("redirects a trailing slash away, as trailingSlash: never asks", async () => {
    const response = await get("/blog/?page=2");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toMatch(/\/blog\?page=2$/);
    expect(await html("/blog")).toContain("1 posts");
  });

  it("serves a page per locale from the content collection", async () => {
    expect(await html("/blog/hello-world")).toContain("Welcome to your first post.");
    expect(await html("/nl/blog/hello-world")).toContain("Welkom bij je eerste bericht.");
  });

  it("loads the canopy island's runtime and script", async () => {
    const page = await html("/");
    const island = page.match(/<wald-canopy data-src="([^"]+)"/)?.[1];
    const runtime = page.match(/<script type="module" src="([^"]+wald-canopy[^"]+)"/)?.[1];
    for (const path of [island, runtime]) {
      expect(path).toBeDefined();
      const response = await get(path!);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/javascript/);
    }
  });

  it("serves the images wald:image optimized", async () => {
    const srcset = (await html("/")).match(/srcset="([^"]+)"/)?.[1] ?? "";
    const images = srcset.split(", ").map((candidate) => candidate.split(" ")[0]!);
    expect(images).toHaveLength(2);
    for (const path of images) {
      const response = await get(path);
      expect(response.status, path).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/webp");
    }
  });

  it("serves files from public/", async () => {
    expect(await html("/robots.txt")).toContain("User-agent: *");
  });

  it("answers a missing page with the page src/pages/404.wald renders", async () => {
    const response = await get("/missing");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Lost in the forest");
  });

  it("follows the redirects in public/_redirects", async () => {
    const moved = await get("/old-blog/hello-world");
    expect(moved.status).toBe(301);
    expect(moved.headers.get("location")).toMatch(/\/blog\/hello-world$/);
    const found = await get("/feed");
    expect(found.status).toBe(302);
    expect(found.headers.get("location")).toMatch(/\/blog$/);
  });

  it("adds the headers in public/_headers, except the cache times Oester sets itself", async () => {
    const page = await get("/");
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    const asset = await get("/assets/css/global.css");
    expect(asset.status).toBe(200);
    expect(asset.headers.get("x-frame-options")).toBe("DENY");
    expect(asset.headers.get("cache-control") ?? "").not.toContain("immutable");
  });

  it("does not serve the rule files themselves", async () => {
    expect((await get("/_headers")).status).toBe(404);
    expect((await get("/_redirects")).status).toBe(404);
  });
});
