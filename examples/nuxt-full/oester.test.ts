import { describe, expect, test } from "vitest";
import { get } from "../../e2e/get.ts";

const text = async (path: string, init?: RequestInit) => (await get(path, init)).text();

describe("prerendered pages and files", () => {
  test("the home page is prerendered, with the app's own script", async () => {
    const res = await get("/");
    const html = await res.text();
    expect(html).toContain("nuxt-full home");
    const script = html.match(/<script[^>]+src="(\/_nuxt\/[^"]+\.js)"/)?.[1];
    expect(script).toBeTruthy();
    expect((await get(script!)).status).toBe(200);
  });

  test("a prerendered page carries its route rule headers, with and without a trailing slash", async () => {
    for (const path of ["/about", "/about/"]) {
      const res = await get(path);
      expect(await res.text()).toContain("nuxt-full about");
      expect(res.headers.get("x-page")).toBe("about");
    }
  });

  test("the payload of a prerendered page", async () => {
    expect((await get("/about/_payload.json")).status).toBe(200);
  });

  test("a public file", async () => {
    expect(await text("/robots.txt")).toBe("User-agent: *\nAllow: /\n");
  });
});

describe("pages rendered on request", () => {
  test("see the route, runtime config from variables, server data and state", async () => {
    const res = await get("/ssr?q=1");
    const html = await res.text();
    expect(html).toContain("path=/ssr q=1");
    expect(html).toContain("protocol=https:");
    expect(html).toContain("public=hallo");
    expect(html).toContain("secret=s3cret");
    expect(html).toContain("state=42");
    expect(res.headers.get("x-server-middleware")).toBe("ran");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("a dynamic route", async () => {
    expect(await text("/posts/oysters")).toContain("post oysters");
  });

  test("a cookie makes the response uncacheable", async () => {
    const res = await get("/cookie", { headers: { cookie: "visits=2" } });
    expect(await res.text()).toContain("visits=3");
    expect(res.headers.get("set-cookie")).toMatch(/^visits=3/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("swr and isr route rules cache at the edge instead of in one isolate", async () => {
    expect((await get("/swr")).headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=31536000",
    );
    expect((await get("/isr")).headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=31536000",
    );
  });

  test("a page with ssr off is sent as the app shell", async () => {
    const res = await get("/spa");
    expect(res.status).toBe(200);
    expect(await res.text()).not.toContain("spa page rendered in the browser");
  });

  test("route middleware redirects", async () => {
    const res = await get("/secret");
    expect([res.status, res.headers.get("location")]).toEqual([302, "/about"]);
    expect(await text("/secret", { headers: { cookie: "user=luuk" } })).toContain(
      "nuxt-full secret page",
    );
  });

  test("a server component island", async () => {
    expect(await text("/island")).toContain("island rendered on the server");
  });

  test("errors get the app's error page with their status", async () => {
    const html = { headers: { accept: "text/html" } };
    const missing = await get("/missing", html);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("nuxt-full error 404");
    const thrown = await get("/missing-post", html);
    expect(thrown.status).toBe(404);
  });
});

describe("server routes", () => {
  test("API routes by method", async () => {
    expect(await (await get("/api/hello")).json()).toEqual({ hello: "world" });
    const echo = await get("/api/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    expect(await echo.json()).toEqual({ body: { a: 1 }, method: "POST" });
    // Nitro answers a method a route has no handler for as a route it cannot find.
    expect((await get("/api/echo")).status).toBe(404);
  });

  test("a cors route rule", async () => {
    expect((await get("/api/cors")).headers.get("access-control-allow-origin")).toBe("*");
  });

  test("a cache-control the handler sets is kept", async () => {
    expect((await get("/api/cached")).headers.get("cache-control")).toBe("public, s-maxage=30");
  });

  test("storage, plugins and the request context", async () => {
    expect((await (await get("/api/storage")).json()).hits).toBeGreaterThan(0);
    const context = await (await get("/api/context")).json();
    expect(context.hasWaitUntil).toBe(true);
    expect(context.deployment).toBeTruthy();
    expect(context.plugin).toBe("loaded");
    expect(context.ip).toBe("127.0.0.1");
  });

  test("a route importing a Node builtin, and a streamed body", async () => {
    expect(await text("/node")).toBe(
      "bb9e9dcd1f374e18c92cccd52f768b9e10e19ec3bdfddeffe07aedb3078c7c84",
    );
    expect(await text("/stream")).toBe("one\ntwo\nthree\n");
  });

  test("redirects from route rules, with their own statuses and the rest of the path", async () => {
    const old = await get("/old?q=1");
    expect([old.status, old.headers.get("location")]).toEqual([307, "/about?q=1"]);
    const moved = await get("/moved");
    expect([moved.status, moved.headers.get("location")]).toEqual([302, "/about"]);
    const blog = await get("/blog/a/b");
    expect([blog.status, blog.headers.get("location")]).toEqual([307, "/posts/a/b"]);
  });
});
