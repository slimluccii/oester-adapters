import { describe, expect, test } from "vitest";
import { loadEdgeEntry } from "./edge.ts";

const sources: Record<string, string> = {
  "/app/.next/server/middleware-build-manifest.js": `self.__BUILD_MANIFEST = { pages: {} };`,
  "/app/.next/server/edge/chunks/entry.js": `(globalThis.TURBOPACK ||= []).push("entry"); self._ENTRIES ||= {}; self._ENTRIES.middleware_x = Promise.resolve({ handler: async (request) => new Response([globalThis.TURBOPACK.join(","), typeof self.__BUILD_MANIFEST, process.env.KEY, process.env.SHARED, typeof AsyncLocalStorage].join(" ")) });`,
  "/app/.next/server/edge/chunks/other.js": `(globalThis.TURBOPACK ||= []).push("other");`,
};

const load = (env: Record<string, string> = {}) =>
  loadEdgeEntry(
    {
      files: Object.keys(sources),
      entry: "/app/.next/server/edge/chunks/entry.js",
      entryKey: "middleware_x",
      env: { KEY: "build", ...env },
    },
    { read: (path) => sources[path]!, builtins: {}, process: { env: { SHARED: "deployment" } } },
  );

describe("loadEdgeEntry", () => {
  test("evaluates manifests, then chunks, then the entry, and gives the registered handler", async () => {
    const handler = await load();
    const response = await handler(new Request("https://example.com/"), {});
    expect(await response.text()).toBe("other,entry object build deployment function");
  });

  test("keeps what the entry registers off the real global object, so deployments do not collide", async () => {
    await load();
    expect((globalThis as Record<string, unknown>)._ENTRIES).toBeUndefined();
    expect((globalThis as Record<string, unknown>).TURBOPACK).toBeUndefined();
  });

  test("own sandbox globals shadow accessors on the real global object, such as Deno's self", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "self");
    Object.defineProperty(globalThis, "self", {
      get: () => globalThis,
      set: () => {},
      configurable: true,
    });
    try {
      const handler = await load();
      expect((await handler(new Request("https://example.com/"), {})).status).toBe(200);
      expect((globalThis as Record<string, unknown>)._ENTRIES).toBeUndefined();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "self", descriptor);
      else delete (globalThis as Record<string, unknown>).self;
    }
  });

  test("the deployment's variables win over the values Next.js recorded at build time", async () => {
    const handler = await loadEdgeEntry(
      {
        files: Object.keys(sources),
        entry: "/app/.next/server/edge/chunks/entry.js",
        entryKey: "middleware_x",
        env: { SHARED: "build" },
      },
      { read: (path) => sources[path]!, builtins: {}, process: { env: { SHARED: "deployment" } } },
    );
    const text = await (await handler(new Request("https://example.com/"), {})).text();
    expect(text).toContain("deployment");
  });

  test("the entry registry is also a free variable, as Next's instrumentation lookup expects", async () => {
    const files = {
      "/app/e.js": `self._ENTRIES ||= {}; self._ENTRIES.middleware_e = { handler: async () => new Response(String("_ENTRIES" in globalThis && _ENTRIES === self._ENTRIES)) };`,
    };
    const handler = await loadEdgeEntry(
      { files: ["/app/e.js"], entry: "/app/e.js", entryKey: "middleware_e", env: {} },
      { read: (path) => files[path as keyof typeof files], builtins: {}, process: { env: {} } },
    );
    expect(await (await handler(new Request("https://example.com/"), {})).text()).toBe("true");
  });

  test("require() gives the scripts the builtins they may load, and refuses others", async () => {
    const files = {
      "/app/e.js": `self._ENTRIES = { middleware_e: { handler: async () => new Response(require("node:buffer").name + require("buffer").name) } }; try { require("fs") } catch (error) { self.refused = error.message }`,
    };
    const handler = await loadEdgeEntry(
      { files: ["/app/e.js"], entry: "/app/e.js", entryKey: "middleware_e", env: {} },
      {
        read: (path) => files[path as keyof typeof files],
        builtins: { "node:buffer": { name: "buffer" } },
        process: { env: {} },
      },
    );
    expect(await (await handler(new Request("https://example.com/"), {})).text()).toBe(
      "bufferbuffer",
    );
  });
});
