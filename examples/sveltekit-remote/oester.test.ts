import { beforeAll, describe, expect, test } from "vitest";
import { get, live } from "../../e2e/get.ts";

const target = new URL(process.env.OESTER_URL ?? "http://localhost");
const origin = live ? target.origin : `https://${target.host}`;
// Remote arguments travel as URL-safe base64 of devalue: 21 is "[21]".
const encode = (value: unknown) =>
  Buffer.from(JSON.stringify([value]))
    .toString("base64url")
    .replace(/=+$/, "");

let html: string;
let id: string;

beforeAll(async () => {
  html = await (await get("/", { headers: { cookie: "name=Ada" } })).text();
  id = html.match(/"(\w+)\/getGreeting\//)![1]!;
});

describe("server rendering with remote functions", () => {
  test("queries, a live query's first value and a prerendered function render on the server", () => {
    expect(html).toContain('id="greeting">hello, Ada<');
    expect(html).toContain('id="double">42<');
    expect(html).toContain('id="tick">1<');
    expect(html).toContain('id="build">computed at build time<');
  });
});

describe("remote function endpoints", () => {
  test("a query", async () => {
    const response = await get(`/_app/remote/${id}/getGreeting`, {
      headers: { cookie: "name=Grace" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toMatch(/no-store/);
    const result = await response.json();
    expect(result.type).toBe("result");
    expect(result.data).toContain("hello, Grace");
  });

  test("a query with an argument", async () => {
    const result = await (await get(`/_app/remote/${id}/double?payload=${encode(21)}`)).json();
    expect(result.data).toContain(",42,");
  });

  test("a command", async () => {
    const response = await get(`/_app/remote/${id}/increment`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ payload: encode(5), refreshes: [] }),
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.type).toBe("result");
    expect(result.data).toContain("6");
  });

  test("a live query streams server-sent events as they are produced", async () => {
    const started = Date.now();
    const response = await get(`/_app/remote/${id}/ticks`, {
      headers: { accept: "text/event-stream" },
    });
    expect(response.headers.get("content-type")).toMatch(/text\/event-stream/);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const arrivals: { at: number; text: string }[] = [];
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
      arrivals.push({ at: Date.now() - started, text: decoder.decode(chunk.value) });
    const body = arrivals.map((a) => a.text).join("");
    expect(body.match(/^data:/gm)?.length).toBeGreaterThanOrEqual(3);
    expect(arrivals[0]!.at).toBeLessThan(arrivals.at(-1)!.at - 400);
  });

  test("a form without JavaScript posts to the page and redirects", async () => {
    const action = html.match(/action="([^"]+)"/)![1]!.replaceAll("&amp;", "&");
    const field = html.match(/<input name="([^"]+)"/)![1]!;
    const response = await get(`/${action}`, {
      method: "POST",
      headers: {
        origin,
        accept: "text/html",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ [field]: "Linus" }).toString(),
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("set-cookie")).toMatch(/name=Linus/);
  });

  test("a prerendered remote function is a static file", async () => {
    const response = await get(`/_app/remote/${id}/buildInfo`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBeNull();
    expect((await response.json()).data).toContain("computed at build time");
  });
});
