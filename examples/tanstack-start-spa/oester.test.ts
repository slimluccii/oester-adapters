import { describe, expect, test } from "vitest";
import { get } from "../../e2e/get.ts";

const shellOf = async (path: string) => {
  const response = await get(path);
  return { status: response.status, html: await response.text(), response };
};

describe("the shell", () => {
  test("every screen path gets the prerendered shell with status 200, from a static file", async () => {
    for (const path of ["/", "/settings/profile", "/no/such/screen"]) {
      const { status, html, response } = await shellOf(path);
      expect(status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(response.headers.get("cache-control")).not.toBe("no-store");
      expect(html).toContain("SPA shell header");
      expect(html).toContain("Loading the app");
      expect(html).not.toContain("Home screen");
      expect(html).not.toContain("Profile screen");
    }
  });

  test("the shell's scripts are served", async () => {
    const { html } = await shellOf("/");
    const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
    expect(script).toBeDefined();
    expect((await get(script!)).status).toBe(200);
  });

  test("a missing asset is not answered with the shell", async () => {
    expect((await get("/assets/missing.js")).status).toBe(404);
  });
});

describe("the server", () => {
  test("server functions still run on the server", async () => {
    const response = await get("/_serverFn/getVersion", {
      headers: { "x-tsr-serverfn": "true", "sec-fetch-site": "same-origin" },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("api version 7");
  });

  test("server routes under /api answer", async () => {
    const response = await get("/api/ping");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ pong: true });
  });

  test("an unknown /api path is the server's 404, not the shell", async () => {
    const response = await get("/api/nope");
    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("Loading the app");
  });

  test("server routes under a path named in serverPaths answer, with their cookies and redirects", async () => {
    const response = await get("/auth/callback?code=abc");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/settings/profile");
    expect(response.headers.get("set-cookie")).toBe("session=abc; Path=/");
  });
});
