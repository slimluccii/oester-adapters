import { describe, expect, test } from "vitest";
import { get, live } from "../../e2e/get.ts";

// The handle hook marks every response SvelteKit's server produced; static files never carry it.
const fromServer = (response: Response) => response.headers.get("x-handled-by") === "hooks.server";
const text = (html: string, id: string) => html.match(new RegExp(`id="${id}">([^<]*)<`))?.[1];

// The loader hands SvelteKit the visitor's URL as https on the host it was asked for.
const target = new URL(process.env.OESTER_URL ?? "http://localhost");
const origin = live ? target.origin : `https://${target.host}`;
const form = (body: string, headers: Record<string, string> = {}) => ({
  method: "POST",
  body,
  headers: {
    origin,
    accept: "text/html",
    "content-type": "application/x-www-form-urlencoded",
    ...headers,
  },
});

describe("prerendered pages and static files", () => {
  test("a prerendered page is a static file", async () => {
    const response = await get("/about");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    expect(fromServer(response)).toBe(false);
    expect(await response.text()).toContain("A prerendered page.");
  });

  test("the root is the prerendered index.html", async () => {
    const response = await get("/");
    expect(fromServer(response)).toBe(false);
    expect(await response.text()).toContain("Prerendered at build time.");
  });

  test("a trailing slash on a prerendered page redirects, as trailingSlash 'never' does", async () => {
    const response = await get("/about/");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/about");
  });

  test("a redirect met while prerendering is served by Oester", async () => {
    const response = await get("/old?x=1");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/about?x=1");
  });

  test("a prerendered endpoint is a static file", async () => {
    const response = await get("/prerendered.json");
    expect(response.status).toBe(200);
    expect(fromServer(response)).toBe(false);
    expect(await response.json()).toEqual({ prerendered: true });
  });

  test("files from static/ are served as they are", async () => {
    const robots = await get("/robots.txt");
    expect(robots.status).toBe(200);
    expect(robots.headers.get("content-type")).toMatch(/text\/plain/);
    expect(await robots.text()).toContain("User-agent: *");
    expect((await get("/favicon.svg")).headers.get("content-type")).toMatch(/image\/svg\+xml/);
  });

  test("the client's hashed assets are static, and a missing one never reaches the server", async () => {
    const html = await (await get("/")).text();
    const script = html.match(/(_app\/immutable\/entry\/start\.[^"]+\.js)/)?.[1];
    expect(script).toBeDefined();
    const asset = await get(`/${script}`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toMatch(/javascript/);
    expect(fromServer(asset)).toBe(false);
    const missing = await get("/_app/immutable/entry/missing.js");
    expect(missing.status).toBe(404);
    expect(fromServer(missing)).toBe(false);
  });

  test("the version file and the service worker are static", async () => {
    const version = await get("/_app/version.json");
    expect(version.status).toBe(200);
    expect(await version.json()).toHaveProperty("version");
    const worker = await get("/service-worker.js");
    expect(worker.status).toBe(200);
    expect(worker.headers.get("content-type")).toMatch(/javascript/);
  });

  test("a page prerendered with prerender 'auto' is static, its other paths are rendered", async () => {
    const first = await get("/auto/first");
    expect(fromServer(first)).toBe(false);
    expect(text(await first.text(), "slug")).toBe("first");
    const second = await get("/auto/second");
    expect(second.status).toBe(200);
    expect(fromServer(second)).toBe(true);
    expect(text(await second.text(), "slug")).toBe("second");
  });
});

describe("server-rendered pages", () => {
  test("a load function sees cookies, the client address, the platform, locals and variables", async () => {
    const response = await get("/ssr", { headers: { cookie: "visits=2", "user-agent": "e2e" } });
    expect(response.status).toBe(200);
    expect(fromServer(response)).toBe(true);
    const html = await response.text();
    expect(text(html, "visits")).toBe("3");
    expect(text(html, "secret")).toBe("from the deployment");
    expect(text(html, "address")).toMatch(/\S/);
    expect(text(html, "deployment")).toMatch(/\S/);
    expect(text(html, "assets")).toBe("function");
    expect(text(html, "request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(text(html, "user-agent")).toBe("e2e");
    expect(html).toContain("transformed by handle");
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toMatch(/^visits=3;.*HttpOnly/);
    expect(cookies[1]).toMatch(/^theme=dark;/);
  });

  test("client-side navigation reads __data.json, from the server or prerendered", async () => {
    const rendered = await get("/ssr/__data.json");
    expect(rendered.status).toBe(200);
    expect(fromServer(rendered)).toBe(true);
    expect((await rendered.json()).type).toBe("data");
    const prerendered = await get("/auto/first/__data.json");
    expect(prerendered.status).toBe(200);
    expect(fromServer(prerendered)).toBe(false);
  });

  test("a response without cache-control, or with a cookie, is not stored", async () => {
    expect((await get("/ssr")).headers.get("cache-control")).toBe("no-store");
    expect((await get("/api/hello")).headers.get("cache-control")).toBe("no-store");
  });

  test("cache-control set by a load function or an endpoint is kept", async () => {
    expect((await get("/cached")).headers.get("cache-control")).toBe("public, max-age=60");
    expect((await get("/api/cached")).headers.get("cache-control")).toBe("public, max-age=300");
  });

  test("a trailing slash on a rendered page redirects through SvelteKit", async () => {
    const response = await get("/ssr/");
    expect(response.status).toBe(308);
    expect(new URL(response.headers.get("location")!, target.origin + "/ssr/").pathname).toBe(
      "/ssr",
    );
  });

  test("a HEAD request gets the headers without a body", async () => {
    const response = await get("/ssr", { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  test("dynamic variables: $app/env/public, the legacy $env/dynamic/private and /_app/env.js", async () => {
    const html = await (await get("/env")).text();
    expect(text(html, "public")).toBe("hello from oester");
    expect(text(html, "legacy")).toBe("from the deployment");
    const module = await get("/_app/env.js");
    expect(module.status).toBe(200);
    expect(await module.text()).toContain("hello from oester");
  });

  test("promises returned from load stream in after the first bytes", async () => {
    const started = Date.now();
    const response = await get("/streaming");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const first = decoder.decode((await reader.read()).value);
    const firstAfter = Date.now() - started;
    let rest = "";
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
      rest += decoder.decode(chunk.value);
    expect(first).toContain("fast value");
    expect(first).not.toContain("slow value");
    expect(firstAfter).toBeLessThan(1200);
    expect(rest).toContain("slow value");
  });

  test("ssr = false renders an empty shell, csr = false ships no scripts", async () => {
    const spa = await (await get("/spa")).text();
    expect(spa).not.toContain("rendered in the browser");
    expect(spa).toContain("_app/immutable/entry/start");
    const noJs = await (await get("/no-js")).text();
    expect(noJs).toContain("no JavaScript here");
    expect(noJs).not.toContain("<script");
  });

  test("param matchers decide which paths match", async () => {
    const item = await get("/items/12");
    expect(item.status).toBe(200);
    expect(text(await item.text(), "item")).toBe("item 12");
    expect((await get("/items/abc")).status).toBe(404);
  });

  test("the reroute hook renders another route under the same URL", async () => {
    const response = await get("/rerouted");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Server-rendered");
  });

  test("the handle hook can answer by itself", async () => {
    const response = await get("/custom");
    expect(await response.text()).toBe("answered by handle");
  });
});

describe("redirects and errors", () => {
  test("redirect() in a load function", async () => {
    const response = await get("/redirect");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/ssr");
  });

  test("an external redirect that was opted into", async () => {
    const response = await get("/external");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/");
  });

  test("error() renders the error page with its status", async () => {
    const response = await get("/teapot");
    expect(response.status).toBe(418);
    expect(fromServer(response)).toBe(true);
    const html = await response.text();
    expect(html).toContain("Error 418");
    expect(text(html, "message")).toBe("I'm a teapot");
  });

  test("an unexpected error goes through handleError and leaks nothing", async () => {
    const response = await get("/crash");
    expect(response.status).toBe(500);
    const html = await response.text();
    expect(text(html, "message")).toBe("Whoops");
    expect(text(html, "error-id")).toBe("E-1");
    expect(html).not.toContain("secret internals");
  });

  test("an unknown path gets SvelteKit's 404 page", async () => {
    const response = await get("/does/not/exist");
    expect(response.status).toBe(404);
    expect(fromServer(response)).toBe(true);
    expect(await response.text()).toContain("Error 404");
  });
});

describe("endpoints", () => {
  test("GET and POST handlers, and 405 for a method without one", async () => {
    expect(await (await get("/api/hello")).json()).toEqual({ message: "hello", via: null });
    const posted = await get("/api/hello", {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ a: 1 }),
    });
    expect(posted.status).toBe(201);
    expect(await posted.json()).toEqual({ received: { a: 1 } });
    const put = await get("/api/hello", { method: "PUT", headers: { origin } });
    expect(put.status).toBe(405);
    expect(put.headers.get("allow")).toMatch(/GET/);
  });

  test("a multipart upload arrives intact and binary comes back intact", async () => {
    const bytes = new Uint8Array(70_000).map((_, i) => (i * 31) % 256);
    const body = new FormData();
    body.append("file", new Blob([bytes]), "data.bin");
    const response = await get("/api/upload", { method: "POST", body, headers: { origin } });
    expect(response.status).toBe(200);
    const { createHash } = await import("node:crypto");
    expect(response.headers.get("x-sha256")).toBe(createHash("sha256").update(bytes).digest("hex"));
    expect(response.headers.get("x-name")).toBe("data.bin");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes.toReversed());
  });

  test("node:crypto and Buffer work on the edge", async () => {
    expect(await (await get("/api/crypto")).text()).toBe(
      "bb9e9dcd1f374e18c92cccd52f768b9e10e19ec3bdfddeffe07aedb3078c7c84 b2VzdGVy",
    );
  });

  test("read() from $app/server reads an imported asset through env.ASSETS", async () => {
    const response = await get("/api/read");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("This file is read on the server through env.ASSETS.\n");
  });

  test("getRequestEvent() works after an await, so AsyncLocalStorage is available", async () => {
    expect(await (await get("/api/request-event")).text()).toBe("/api/request-event");
  });

  test("the init hook and instrumentation.server.ts ran before the first request", async () => {
    expect(await (await get("/api/started")).json()).toEqual({
      init: true,
      instrumentation: true,
    });
  });
});

describe("fetch in load functions", () => {
  test("fetching an endpoint of the app runs it in place, through handleFetch", async () => {
    const html = await (await get("/fetch")).text();
    expect(text(html, "hello")).toBe("hello via handleFetch");
  });

  test("fetching a static file or a prerendered endpoint reads it from the deployment", async () => {
    const response = await get("/fetch-static");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(text(html, "robots")).toContain("User-agent: *");
    expect(text(html, "prerendered")).toBe("true");
  });
});

describe("form actions", () => {
  test("an action runs on a POST and sets a cookie", async () => {
    const response = await get("/form?/greet", form("name=Ada"));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/name=Ada/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(text(await response.text(), "greeting")).toBe("Hello, Ada");
  });

  test("fail() keeps its status and data", async () => {
    const response = await get("/form?/greet", form("name="));
    expect(response.status).toBe(400);
    expect(await response.text()).toContain('id="missing"');
  });

  test("a named action can redirect", async () => {
    const response = await get("/form?/leave", form(""));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/ssr");
  });

  test("an enhanced submission gets JSON", async () => {
    const response = await get(
      "/form?/greet",
      form("name=Grace", { accept: "application/json", "x-sveltekit-action": "true" }),
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.type).toBe("success");
    expect(result.data).toContain("Hello, Grace");
  });

  test("a submission from another origin is refused", async () => {
    const response = await get(
      "/form?/greet",
      form("name=Eve", { origin: "https://evil.example" }),
    );
    expect(response.status).toBe(403);
  });
});
