import { describe, expect, it } from "vitest";
import { get } from "../../e2e/get.ts";

describe("wald-minimal on Oester", () => {
  it("serves the home page", async () => {
    const response = await get("/");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/html/);
    expect(await response.text()).toContain("<title>Hello Wald</title>");
  });

  it("serves a page with and without a trailing slash", async () => {
    for (const path of ["/blog", "/blog/"]) {
      const response = await get(path);
      expect(response.status, path).toBe(200);
      expect(await response.text()).toContain("1 posts");
    }
  });

  it("serves a page that getStaticPaths() rendered from the content collection", async () => {
    const response = await get("/blog/hello-world");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Welcome to your first post.");
  });

  it("serves the stylesheet from src/assets without long-lived cache headers", async () => {
    const response = await get("/assets/css/global.css");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/css/);
    expect(response.headers.get("cache-control") ?? "").not.toContain("immutable");
  });

  it("answers a missing page with 404", async () => {
    const response = await get("/missing");
    expect(response.status).toBe(404);
  });
});
