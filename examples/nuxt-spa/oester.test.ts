import { describe, expect, test } from "vitest";
import { get } from "../../e2e/get.ts";

describe("a Nuxt single page app under a base, with server routes", () => {
  test("the root redirects to the base", async () => {
    const res = await get("/");
    expect([res.status, res.headers.get("location")]).toEqual([307, "/app/"]);
  });

  test("every page gets the shell, with its script under the base", async () => {
    for (const path of ["/app/", "/app/settings"]) {
      const html = await (await get(path)).text();
      expect(html).toContain('id="__nuxt"');
      const script = html.match(/src="(\/app\/_nuxt\/[^"]+\.js)"/)?.[1];
      expect(script).toBeTruthy();
      expect((await get(script!)).status).toBe(200);
    }
  });

  test("a server route under the base", async () => {
    expect(await (await get("/app/api/info")).json()).toEqual({ base: "/app/" });
  });

  test("outside the base is not found", async () => {
    expect((await get("/elsewhere")).status).toBe(404);
  });
});
