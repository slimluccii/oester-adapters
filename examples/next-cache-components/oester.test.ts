import { describe, expect, test } from "vitest";
import { get } from "../../e2e/get.ts";

async function html(path: string, init?: RequestInit): Promise<string> {
  const response = await get(path, init);
  expect(response.status).toBe(200);
  return response.text();
}

describe("partial prerendering", () => {
  test("the static shell arrives first, the dynamic part streams in after it", async () => {
    const response = await get("/ppr", { headers: { cookie: "name=pearl" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-nextjs-postponed")).toBe("1");
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let received = "";
    let shellFirst = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += decoder.decode(value, { stream: true });
      if (received.includes("static shell") && !received.includes("hello <!-- -->pearl"))
        shellFirst = true;
    }
    expect(shellFirst).toBe(true);
    expect(received).toContain("hello <!-- -->pearl");
  });

  test("a client navigation gets the RSC payload", async () => {
    const response = await get("/ppr?_rsc=a", { headers: { rsc: "1" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/x-component");
  });
});

describe("use cache", () => {
  const read = async () => {
    const page = await html("/cached");
    return {
      cached: Number(/cached (?:<!-- -->)?(\d+)/.exec(page)![1]),
      fresh: Number(/fresh (?:<!-- -->)?(\d+)/.exec(page)![1]),
    };
  };

  test("a cached function keeps its value across requests in this isolate", async () => {
    const first = await read();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const second = await read();
    expect(second.cached).toBe(first.cached);
    expect(second.fresh).toBeGreaterThan(first.fresh);
  });

  test("revalidateTag drops the cached value", async () => {
    const before = await read();
    expect(await (await get("/api/refresh", { method: "POST" })).json()).toEqual({
      refreshed: true,
    });
    expect((await read()).cached).toBeGreaterThan(before.cached);
  });
});
