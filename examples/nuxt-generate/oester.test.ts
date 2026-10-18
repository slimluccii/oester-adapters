import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { get, live } from "../../e2e/get.ts";

describe("nuxt generate", () => {
  test.skipIf(live)("needs no server", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("./.oester/output/manifest.json", import.meta.url), "utf8"),
    );
    expect(manifest.server).toBeUndefined();
    expect(manifest.routes).toEqual([{ match: "/*", type: "static", fallback: "200.html" }]);
  });

  test("prerendered pages", async () => {
    expect(await (await get("/")).text()).toContain("nuxt-generate home");
    expect(await (await get("/guide/intro")).text()).toContain("nuxt-generate guide intro");
    expect(await (await get("/guide/advanced/")).text()).toContain("nuxt-generate guide advanced");
  });

  test("a path no page was generated for gets the app shell, which renders it in the browser", async () => {
    const res = await get("/guide/unknown");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('id="__nuxt"');
  });

  test("a redirect from route rules", async () => {
    const res = await get("/old");
    expect([res.status, res.headers.get("location")]).toEqual([307, "/guide/intro"]);
  });
});
