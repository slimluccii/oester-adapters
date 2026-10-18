import { describe, expect, test } from "vitest";
import { expectStaticCaching, get } from "../../e2e/get.ts";

// Oester serves every site over https, so a browser on it sends an https origin.
const origin = `https://${new URL(process.env.OESTER_URL!).host}`;

const text = async (path: string, init?: RequestInit) => (await get(path, init)).text();

describe("prerendered pages and files", () => {
  test("the home page is served from the static files, with its island's script", async () => {
    const res = await get("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    const html = await res.text();
    expect(html).toContain("astro-server home");
    const script = html.match(/<astro-island[^>]+component-url="([^"]+)"/)?.[1];
    expect(script).toBeTruthy();
    expect((await get(script!)).status).toBe(200);
  });

  test("an image on a prerendered page is optimized at build", async () => {
    const html = await text("/");
    const src = html.match(/<img[^>]+src="([^"]+)"/)?.[1];
    expect(src).toMatch(/^\/_astro\/oyster\.[^"]+\.webp$/);
    const res = await get(src!);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
  });

  test("a prerendered page is found with and without a trailing slash", async () => {
    expect(await text("/about")).toContain("astro-server about");
    expect(await text("/about/")).toContain("astro-server about");
  });

  test("a prerendered page carries the CSP header Astro computed for it", async () => {
    const res = await get("/about");
    expect(res.headers.get("content-security-policy")).toMatch(/script-src 'self'/);
  });

  test("dynamic prerendered routes and content collections", async () => {
    expect(await text("/blog/hello")).toContain("blog hello");
    const doc = await text("/docs/getting-started");
    expect(doc).toContain("<strong>delicious</strong>");
  });

  test("a public file", async () => {
    expect(await text("/robots.txt")).toBe("User-agent: *\nAllow: /\n");
  });

  test("i18n: a translated page, and the fallback to the default locale", async () => {
    expect(await text("/nl/")).toContain("astro-server thuis");
    const fallback = await get("/nl/about");
    expect([200, 301, 302, 307, 308]).toContain(fallback.status);
  });
});

describe("pages rendered on request", () => {
  test("see the visitor's URL, the secret and public variables, the client and the middleware's locals", async () => {
    const res = await get("/ssr?q=1");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("path=/ssr q=1");
    expect(html).toContain("secret=s3cret getSecret=s3cret");
    expect(html).toContain("protocol=https:");
    expect(html).toContain("client=known");
    expect(html).toContain("request=has id");
    expect(res.headers.get("x-middleware")).toBe("ran");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("a dynamic route rendered on request", async () => {
    expect(await text("/posts/oysters")).toContain("post oysters rendered on request");
  });

  test("a cookie makes the response uncacheable, whatever it asks for", async () => {
    const res = await get("/cookie", { headers: { cookie: "visits=4" } });
    expect(await res.text()).toContain("visits=5");
    expect(res.headers.get("set-cookie")).toMatch(/^visits=5; Path=\/; HttpOnly; SameSite=Lax/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("route caching through the Oester provider caches at the edge only", async () => {
    expect((await get("/cached")).headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=10",
    );
    expect((await get("/cached-rule")).headers.get("cache-control")).toBe(
      "public, max-age=0, s-maxage=120, stale-while-revalidate=30",
    );
    expect((await get("/manual-cache")).headers.get("cache-control")).toBe("public, s-maxage=30");
  });

  test("a session keeps its value between requests through its cookie", async () => {
    const first = await get("/session");
    expect(await first.text()).toContain("session count=1");
    const cookie = first.headers.get("set-cookie")!.split(";")[0]!;
    // The in-memory driver keeps sessions per isolate, which the local preview has one of.
    const second = await get("/session", { headers: { cookie } });
    expect(await second.text()).toContain("session count=2");
  });

  // Astro rewrites only to routes in its server bundle; edge middleware can also rewrite to prerendered pages.
  test("Astro.redirect, Astro.rewrite and a thrown error", async () => {
    const redirect = await get("/go");
    expect(redirect.status).toBe(307);
    expect(redirect.headers.get("location")).toBe("/about?from=go");
    expect(await text("/rewrite")).toContain("post rewritten rendered on request");
    const error = await get("/boom");
    expect(error.status).toBe(500);
    expect(await error.text()).toContain("astro-server error");
  });

  test("async components stream in order", async () => {
    const html = await text("/stream");
    expect(html.indexOf("first chunk")).toBeGreaterThan(html.indexOf("stream start"));
    expect(html.indexOf("second chunk")).toBeGreaterThan(html.indexOf("first chunk"));
  });

  test("a server island renders through its own endpoint", async () => {
    const html = await text("/island");
    expect(html).toContain("loading island");
    const src = html.match(/\/_server-islands\/[^"'`\s]+/)?.[0];
    expect(src).toBeTruthy();
    const island = await get(src!.replace(/&amp;/g, "&"));
    expect(island.status).toBe(200);
    expect(await island.text()).toContain("island rendered at request");
  });

  test("an image on a page rendered on request is served as it is through the image endpoint", async () => {
    const html = await text("/image");
    const src = html.match(/<img[^>]+src="([^"]+)"/)?.[1]?.replace(/&#38;|&amp;/g, "&");
    expect(src).toMatch(/^\/_image\?/);
    const res = await get(src!);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^image\//);
  });
});

describe("endpoints and actions", () => {
  test("JSON endpoints, GET and POST", async () => {
    expect(await (await get("/api/hello")).json()).toEqual({ hello: "world" });
    const echo = await get("/api/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    expect(await echo.json()).toEqual({ method: "POST", body: { a: 1 }, type: "application/json" });
  });

  test("an endpoint importing Node builtins", async () => {
    expect(await text("/api/node")).toBe(
      "bb9e9dcd1f374e18c92cccd52f768b9e10e19ec3bdfddeffe07aedb3078c7c84",
    );
  });

  test("a streamed endpoint body", async () => {
    expect(await text("/api/stream")).toBe("one\ntwo\nthree\n");
  });

  test("an action called with JSON", async () => {
    const res = await get("/_actions/add", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", origin },
      body: JSON.stringify({ a: 2, b: 3 }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("5");
  });

  test("a form action posts back to its page", async () => {
    const res = await get("/form?_action=greet", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin },
      body: "name=Luuk",
    });
    expect(await res.text()).toContain("Hello, Luuk!");
  });

  test("a cross-site form post is refused by Astro's origin check", async () => {
    const res = await get("/form?_action=greet", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        origin: "https://evil.example",
      },
      body: "name=Luuk",
    });
    expect(res.status).toBe(403);
  });
});

describe("routing", () => {
  test("redirects from the configuration, with their own statuses and parameters", async () => {
    const old = await get("/old?q=1");
    expect([old.status, old.headers.get("location")]).toEqual([301, "/about?q=1"]);
    const moved = await get("/moved");
    expect([moved.status, moved.headers.get("location")]).toEqual([302, "/about"]);
    const blog = await get("/blog-old/hello");
    expect([blog.status, blog.headers.get("location")]).toEqual([301, "/blog/hello"]);
  });

  test("a missing page gets the site's own 404", async () => {
    const res = await get("/missing");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("astro-server not found");
  });
});

test("hashed assets are cached for a year, and pages revalidate by their etag", async () => {
  await expectStaticCaching("/", /\/_astro\/[^"\s]+\.js/);
});
