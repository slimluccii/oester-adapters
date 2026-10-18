import { describe, expect, it } from "vitest";
import { get } from "../../e2e/get.ts";

describe("wald-base on Oester", () => {
  it("redirects the root of the hostname to the base", async () => {
    const response = await get("/");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toMatch(/\/docs\/$/);
  });

  it("serves the home page at the base, and redirects the base without its slash there", async () => {
    const response = await get("/docs/");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("<title>Hello Wald</title>");
    const bare = await get("/docs");
    expect([bare.status, bare.headers.get("location")]).toEqual([308, "/docs/"]);
  });

  it("serves pages and assets below the base", async () => {
    expect((await get("/docs/blog/hello-world")).status).toBe(200);
    const css = await get("/docs/assets/css/global.css");
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toMatch(/^text\/css/);
  });

  it("loads the canopy island from below the base", async () => {
    const page = await (await get("/docs/")).text();
    const paths = [...page.matchAll(/(?:data-src|src)="(\/docs\/assets\/[^"]+\.js)"/g)].map(
      (match) => match[1]!,
    );
    expect(paths).toHaveLength(2);
    for (const path of paths) expect((await get(path)).status, path).toBe(200);
  });

  it("answers paths outside the base with 404", async () => {
    expect((await get("/blog")).status).toBe(404);
    expect((await get("/assets/css/global.css")).status).toBe(404);
  });
});
