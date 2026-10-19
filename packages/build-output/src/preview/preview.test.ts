import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { outputDirectory, type Manifest } from "../contract.ts";
import { startPreview } from "./preview.ts";

type Output = { manifest: Omit<Manifest, "version" | "framework" | "compatibilityDate"> } & {
  files?: Record<string, string>;
};

const stops: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
  delete process.env.OESTER_PREVIEW_TEST;
});

async function preview({ manifest, files = {} }: Output, headers?: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "oester-preview-"));
  const outputDir = join(root, outputDirectory);
  await mkdir(outputDir, { recursive: true });
  const full = { version: 3, framework: { name: "test" }, compatibilityDate: "2026-10-01" };
  await writeFile(join(outputDir, "manifest.json"), JSON.stringify({ ...full, ...manifest }));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(outputDir, path, ".."), { recursive: true });
    await writeFile(join(outputDir, path), content);
  }
  const server = await startPreview({ root, host: "127.0.0.1", port: 0, headers });
  stops.push(server.stop);
  return (path: string, init?: RequestInit) =>
    fetch(new URL(path, server.url), { redirect: "manual", ...init });
}

const echo = `export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/asset") return env.ASSETS.fetch(url.searchParams.get("path"));
    if (url.pathname === "/throw") throw new Error("boom");
    if (url.pathname === "/cookies") {
      const headers = new Headers();
      headers.append("set-cookie", "a=1");
      headers.append("set-cookie", "b=2");
      return new Response("cookies", { headers });
    }
    return Response.json({
      method: request.method,
      path: url.pathname + url.search,
      body: await request.text(),
      header: request.headers.get("x-test"),
      variable: env.OESTER_PREVIEW_TEST,
      deploymentId: ctx.oester.deploymentId,
      clientAddress: ctx.oester.clientAddress,
      waitUntil: typeof ctx.waitUntil,
    });
  },
};
`;

describe("startPreview", () => {
  test("a static file is served with its content type and an etag, and 304 when it is unchanged", async () => {
    const get = await preview({
      manifest: { routes: [{ match: "/*", type: "static" }] },
      files: { "static/style.css": "body{}" },
    });
    const first = await get("/style.css");
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toBe("text/css; charset=utf-8");
    expect(await first.text()).toBe("body{}");
    const etag = first.headers.get("etag");
    expect(etag).toMatch(/^"[0-9a-f]+"$/);
    const second = await get("/style.css", { headers: { "if-none-match": etag! } });
    expect(second.status).toBe(304);
  });

  test("a page is found by its directory index, as Oester's loader finds it", async () => {
    const get = await preview({
      manifest: { routes: [{ match: "/*", type: "static" }] },
      files: { "static/index.html": "home", "static/about/index.html": "about" },
    });
    expect(await (await get("/")).text()).toBe("home");
    expect(await (await get("/about")).text()).toBe("about");
  });

  test("redirects, headers and immutable files of the manifest apply", async () => {
    const get = await preview({
      manifest: {
        routes: [{ match: "/*", type: "static" }],
        redirects: [{ source: "/old/:slug", destination: "/new/:slug", status: 301 }],
        headers: [{ source: "/*", headers: { "x-frame-options": "DENY" } }],
        immutable: ["/_astro/*"],
      },
      files: { "static/index.html": "home", "static/_astro/a.js": "js" },
    });
    const redirect = await get("/old/post?x=1");
    expect(redirect.status).toBe(301);
    expect(redirect.headers.get("location")).toBe("/new/post?x=1");
    expect((await get("/")).headers.get("x-frame-options")).toBe("DENY");
    expect((await get("/_astro/a.js")).headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  test("_headers and _redirects in the static files apply as Oester's ingest merges them, and are not served", async () => {
    const get = await preview({
      manifest: { routes: [{ match: "/*", type: "static" }] },
      files: {
        "static/index.html": "home",
        "static/_headers": "/*\n  X-Test: from-file\n",
        "static/_redirects": "/gone / 302\n",
      },
    });
    expect((await get("/")).headers.get("x-test")).toBe("from-file");
    expect((await get("/gone")).headers.get("location")).toBe("/");
    expect((await get("/_headers")).status).toBe(404);
  });

  test("the base moves the site below it", async () => {
    const get = await preview({
      manifest: { base: "/docs/", routes: [{ match: "/*", type: "static" }] },
      files: { "static/index.html": "docs home" },
    });
    expect((await get("/")).headers.get("location")).toBe("/docs/");
    expect(await (await get("/docs/")).text()).toBe("docs home");
  });

  test("an unknown path gets the 404 page with status 404, or a plain 404 without one", async () => {
    const withPage = await preview({
      manifest: { routes: [{ match: "/*", type: "static" }] },
      files: { "static/404.html": "lost" },
    });
    const notFound = await withPage("/nope");
    expect(notFound.status).toBe(404);
    expect(await notFound.text()).toBe("lost");

    const without = await preview({ manifest: { routes: [{ match: "/*", type: "static" }] } });
    const plain = await without("/nope");
    expect(plain.status).toBe(404);
    expect(plain.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });

  test("a path no file answers goes to the server bundle with the request, env and ctx Oester gives it", async () => {
    process.env.OESTER_PREVIEW_TEST = "from-env";
    const get = await preview({
      manifest: {
        routes: [{ match: "/*", type: "static-or-server" }],
        server: { entry: "server/index.mjs" },
      },
      files: { "static/index.html": "home", "server/index.mjs": echo },
    });
    expect(await (await get("/")).text()).toBe("home");
    const response = await get("/api?q=1", {
      method: "POST",
      body: "payload",
      headers: { "x-test": "yes" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      method: "POST",
      path: "/api?q=1",
      body: "payload",
      header: "yes",
      variable: "from-env",
      deploymentId: "preview",
      clientAddress: "127.0.0.1",
      waitUntil: "function",
    });
  });

  test("env.ASSETS serves the static files, and a plain 404 for what is not one", async () => {
    const get = await preview({
      manifest: {
        routes: [{ match: "/*", type: "static-or-server" }],
        server: { entry: "server/index.mjs" },
      },
      files: { "static/hello.txt": "hello", "server/index.mjs": echo },
    });
    const found = await get("/asset?path=/hello.txt");
    expect(found.status).toBe(200);
    expect(await found.text()).toBe("hello");
    expect((await get("/asset?path=/missing")).status).toBe(404);
  });

  test("middleware sends a path a file would answer to the server, but not an excluded one", async () => {
    const get = await preview({
      manifest: {
        routes: [{ match: "/*", type: "static" }],
        middleware: { include: ["/*"], exclude: ["/_astro/*"] },
        server: { entry: "server/index.mjs" },
      },
      files: { "static/index.html": "home", "static/_astro/a.js": "js", "server/index.mjs": echo },
    });
    expect((await (await get("/")).json()).path).toBe("/");
    expect(await (await get("/_astro/a.js")).text()).toBe("js");
  });

  test("every Set-Cookie of a server response reaches the browser", async () => {
    const get = await preview({
      manifest: {
        routes: [{ match: "/*", type: "server" }],
        server: { entry: "server/index.mjs" },
      },
      files: { "server/index.mjs": echo },
    });
    expect((await get("/cookies")).headers.getSetCookie()).toEqual(["a=1", "b=2"]);
  });

  test("a server response is not cached without its own cache-control, with a cookie, or when it varies", async () => {
    const server = `export default {
      fetch(request) {
        const kind = new URL(request.url).pathname.slice(1);
        const headers = new Headers(kind === "none" ? {} : { "cache-control": "public, s-maxage=60" });
        if (kind === "cookie") headers.set("set-cookie", "a=1");
        if (kind === "vary") headers.set("vary", "Accept-Encoding, Cookie");
        if (kind === "encoding") headers.set("vary", "Accept-Encoding");
        return new Response(kind, { headers });
      },
    };`;
    const get = await preview({
      manifest: {
        routes: [{ match: "/*", type: "server" }],
        server: { entry: "server/index.mjs" },
      },
      files: { "server/index.mjs": server },
    });
    const cacheControl = async (path: string) => (await get(path)).headers.get("cache-control");
    expect(await cacheControl("/none")).toBe("no-store");
    expect(await cacheControl("/cookie")).toBe("no-store");
    expect(await cacheControl("/vary")).toBe("no-store");
    expect(await cacheControl("/encoding")).toBe("public, s-maxage=60");
    expect(await cacheControl("/cached")).toBe("public, s-maxage=60");
  });

  test("a server bundle that throws answers a plain 500", async () => {
    const get = await preview({
      manifest: {
        routes: [{ match: "/*", type: "server" }],
        server: { entry: "server/index.mjs" },
      },
      files: { "server/index.mjs": echo },
    });
    const response = await get("/throw");
    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  });

  test("headers given to the preview are added to every response", async () => {
    const get = await preview(
      { manifest: { routes: [{ match: "/*", type: "static" }] } },
      { "x-preview": "1" },
    );
    expect((await get("/nope")).headers.get("x-preview")).toBe("1");
  });

  test("a project without a build output is refused with a hint to build first", async () => {
    const empty = await mkdtemp(join(tmpdir(), "oester-preview-"));
    await expect(startPreview({ root: empty, port: 0 })).rejects.toThrow(/build/);
  });
});
