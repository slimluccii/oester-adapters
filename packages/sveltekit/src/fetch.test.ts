import { afterEach, expect, test, vi } from "vitest";
import { fetch, withAssets } from "./fetch.ts";

const network = vi.fn(
  async (input: RequestInfo | URL) =>
    new Response(`network ${String(input instanceof Request ? input.url : input)}`),
);
const assets = {
  fetch: vi.fn(async (path: string | Request) =>
    path === "/robots.txt"
      ? new Response("from assets")
      : new Response("Not found", { status: 404 }),
  ),
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const inRequest = <T>(fn: () => Promise<T>) =>
  withAssets({ origin: "https://site.example", assets }, fn);

test("a static file of the deployment's own origin is read through env.ASSETS", async () => {
  vi.stubGlobal("fetch", network);
  const response = await inRequest(() => fetch("https://site.example/robots.txt"));
  expect(await response.text()).toBe("from assets");
  expect(assets.fetch).toHaveBeenCalledWith("/robots.txt");
  expect(network).not.toHaveBeenCalled();
});

test("a path without a static file, another origin or another method goes to the network", async () => {
  vi.stubGlobal("fetch", network);
  const urls = await inRequest(() =>
    Promise.all([
      fetch("https://site.example/api/x").then((r) => r.text()),
      fetch("https://other.example/robots.txt").then((r) => r.text()),
      fetch(new Request("https://site.example/robots.txt", { method: "POST", body: "x" })).then(
        (r) => r.text(),
      ),
    ]),
  );
  expect(urls).toEqual([
    "network https://site.example/api/x",
    "network https://other.example/robots.txt",
    "network https://site.example/robots.txt",
  ]);
});

test("outside a request, fetch is the runtime's own", async () => {
  vi.stubGlobal("fetch", network);
  expect(await (await fetch("https://site.example/robots.txt")).text()).toBe(
    "network https://site.example/robots.txt",
  );
  expect(assets.fetch).not.toHaveBeenCalled();
});
