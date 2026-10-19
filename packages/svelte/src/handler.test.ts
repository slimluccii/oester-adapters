import type { Server, ServerInitOptions } from "@sveltejs/kit";
import { expect, test, vi } from "vitest";
import { createHandler, type Context, type Env } from "./handler.ts";

type Respond = Server["respond"];

function fakeServer(respond: Respond = async () => new Response("ok")) {
  const init = vi.fn<(options: ServerInitOptions) => Promise<void>>(async () => {});
  return { server: { init, respond: vi.fn(respond) }, init };
}

const assets = (files: Record<string, string>): Env["ASSETS"] => ({
  fetch: vi.fn(async (path: string) =>
    path in files ? new Response(files[path]) : new Response("Not found", { status: 404 }),
  ),
});

const context = (clientAddress?: string): Context => ({
  waitUntil: () => {},
  oester: { deploymentId: "d1", ...(clientAddress ? { clientAddress } : {}) },
});

test("the server starts once, with the deployment's variables and not the bindings", async () => {
  const { server, init } = fakeServer();
  const handler = createHandler(server, { base: "" });
  const env = { API_KEY: "secret", ASSETS: assets({}) };
  await Promise.all([
    handler.fetch(new Request("https://example.com/"), env, context()),
    handler.fetch(new Request("https://example.com/a"), env, context()),
  ]);
  expect(init).toHaveBeenCalledTimes(1);
  expect(init.mock.calls[0]![0].env).toEqual({ API_KEY: "secret" });
});

test("a request reaches SvelteKit with the visitor's address and the platform", async () => {
  let seen: { address: string; platform: unknown; url: string } | undefined;
  const { server } = fakeServer(async (request, options) => {
    seen = { address: options.getClientAddress(), platform: options.platform, url: request.url };
    return new Response("rendered", { status: 201 });
  });
  const env = { ASSETS: assets({}) };
  const ctx = context("203.0.113.7");
  const response = await createHandler(server, { base: "" }).fetch(
    new Request("https://example.com/docs/x?y=1"),
    env,
    ctx,
  );
  expect(response.status).toBe(201);
  expect(await response.text()).toBe("rendered");
  expect(seen).toEqual({
    address: "203.0.113.7",
    platform: { env, ctx },
    url: "https://example.com/docs/x?y=1",
  });
});

test("asking for the visitor's address when Oester has none is an error", async () => {
  const { server } = fakeServer(
    async (_request, options) => new Response(options.getClientAddress()),
  );
  const handler = createHandler(server, { base: "" });
  await expect(
    handler.fetch(new Request("https://example.com/"), { ASSETS: assets({}) }, context()),
  ).rejects.toThrow(/client address/);
});

test("read from $app/server fetches the asset under the base through env.ASSETS", async () => {
  for (const base of ["", "/docs"]) {
    const { server, init } = fakeServer();
    const env = { ASSETS: assets({ [`${base}/_app/immutable/assets/data.txt`]: "contents" }) };
    await createHandler(server, { base }).fetch(
      new Request("https://example.com/"),
      env,
      context(),
    );
    const read = init.mock.calls[0]![0].read!;
    const stream = (await read("_app/immutable/assets/data.txt")) as ReadableStream;
    expect(await new Response(stream).text()).toBe("contents");
    await expect(async () => read("missing.txt")).rejects.toThrow(/missing\.txt/);
  }
});
