import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { get, live } from "../../e2e/get.ts";

const text = async (path: string) => (await get(path)).text();

describe("a static Astro site under a base, with trailing slashes always", () => {
  test.skipIf(live)("needs no server", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("./.oester/output/manifest.json", import.meta.url), "utf8"),
    );
    expect(manifest.server).toBeUndefined();
    expect(manifest.base).toBe("/docs/");
    expect(manifest.htmlHandling).toBe("force-trailing-slash");
  });

  test("the root of the host redirects to the base", async () => {
    const res = await get("/");
    expect([res.status, res.headers.get("location")]).toEqual([307, "/docs/"]);
  });

  test("the base redirects to the default locale, as Astro's i18n asks", async () => {
    const html = await text("/docs/");
    expect(html).toMatch(/\/docs\/en\//);
  });

  test("pages under the base, with the trailing slash enforced", async () => {
    expect(await text("/docs/en/")).toContain("astro-static en home");
    expect(await text("/docs/nl/")).toContain("astro-static nl home");
    const res = await get("/docs/guide/intro");
    expect([res.status, res.headers.get("location")]).toEqual([308, "/docs/guide/intro/"]);
    expect(await text("/docs/guide/deep/nested/page/")).toContain(
      "astro-static guide deep/nested/page",
    );
  });

  test("a public file under the base", async () => {
    expect(await text("/docs/style.css")).toBe("h1 {\n  color: teal;\n}\n");
  });

  test("redirects under the base, with their own statuses, with or without a trailing slash", async () => {
    for (const path of ["/docs/start", "/docs/start/"]) {
      const start = await get(path);
      expect([start.status, start.headers.get("location")]).toEqual([301, "/docs/guide/intro/"]);
    }
    const moved = await get("/docs/moved/");
    expect([moved.status, moved.headers.get("location")]).toEqual([308, "/docs/en/"]);
  });

  test("outside the base and missing pages get the site's 404", async () => {
    expect((await get("/elsewhere")).status).toBe(404);
    const res = await get("/docs/missing/");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("astro-static not found");
  });
});
