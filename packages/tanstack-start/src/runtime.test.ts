import { describe, expect, test } from "vitest";
import { createHandler } from "./runtime.ts";

const env = { ASSETS: { fetch: async () => new Response(null, { status: 404 }) } };
const context = (clientAddress?: string) => ({
  waitUntil: () => {},
  oester: { deploymentId: "d1", ...(clientAddress ? { clientAddress } : {}) },
});

describe("createHandler", () => {
  test("answers with what the server entry returns for the request", async () => {
    const seen: Request[] = [];
    const handler = createHandler({
      fetch: (request) => {
        seen.push(request);
        return new Response("from start", { status: 201 });
      },
    });
    const request = new Request("https://example.com/a?b=1", { method: "POST", body: "x" });
    const response = await handler.fetch(request, env, context());
    expect(response.status).toBe(201);
    expect(await response.text()).toBe("from start");
    expect(seen).toEqual([request]);
  });

  test("hands the visitor's address to getRequestIP, which reads request.ip", async () => {
    let ip: unknown;
    const handler = createHandler({
      fetch: (request) => {
        ip = (request as Request & { ip?: string }).ip;
        return new Response();
      },
    });
    await handler.fetch(new Request("https://example.com/"), env, context("203.0.113.7"));
    expect(ip).toBe("203.0.113.7");
  });

  test("leaves request.ip unset when Oester knows no address", async () => {
    let hasIp = true;
    const handler = createHandler({
      fetch: (request) => {
        hasIp = "ip" in request;
        return new Response();
      },
    });
    await handler.fetch(new Request("https://example.com/"), env, context());
    expect(hasIp).toBe(false);
  });
});
