import { describe, expect, test } from "vitest";
import { get } from "../../e2e/get.ts";

async function html(path: string, init?: RequestInit): Promise<string> {
  const response = await get(path, init);
  expect(response.status).toBe(200);
  return response.text();
}

const buildId = async () => /"buildId":"([^"]+)"/.exec(await html("/"))![1]!;

describe("static pages", () => {
  test("an automatically static page is served with the custom _app and _document", async () => {
    const page = await html("/");
    expect(page).toContain("<h1>Pages home</h1>");
    expect(page).toContain('data-document="custom"');
    expect(page).toContain('id="app-shell"');
  });

  test("the client assets the page references load", async () => {
    const page = await html("/");
    const scripts = [...page.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]!);
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) expect((await get(script)).status).toBe(200);
  });

  test("a getStaticProps page and its data are files", async () => {
    expect(await html("/about")).toContain("about, built at");
    const data = await get(`/_next/data/${await buildId()}/about.json`);
    expect(data.status).toBe(200);
    expect(await data.json()).toMatchObject({ pageProps: { builtAt: expect.any(Number) } });
  });

  test("getStaticPaths paths are prerendered; with fallback false any other is the custom 404", async () => {
    expect(await html("/posts/1")).toContain("Post <!-- -->1");
    const missing = await get("/posts/2");
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("Custom pages 404");
  });

  test("with fallback blocking an unlisted path renders on request", async () => {
    expect(await html("/products/known")).toContain("Product <!-- -->known");
    expect(await html("/products/fresh-one")).toContain("Product <!-- -->fresh-one");
    expect((await get("/products/hidden")).status).toBe(404);
  });

  test("res.revalidate in an API route regenerates a page in this isolate", async () => {
    const pattern = /stamp (?:<!-- -->)?(\d+)/;
    const before = Number(pattern.exec(await html("/stale"))![1]);
    expect(await (await get("/api/revalidate-stale")).json()).toEqual({ revalidated: true });
    expect(Number(pattern.exec(await html("/stale"))![1])).toBeGreaterThan(before);
  });

  test("a page with revalidate is regenerated once stale", async () => {
    const pattern = /rendered at (?:<!-- -->)?(\d+)/;
    const first = Number(pattern.exec(await html("/fresh"))![1]);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await get("/fresh").then((r) => r.text());
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(Number(pattern.exec(await html("/fresh"))![1])).toBeGreaterThan(first);
  });

  test("an unknown path gets the custom 404 page with status 404", async () => {
    const response = await get("/nope");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Custom pages 404");
  });
});

describe("server-rendered pages", () => {
  test("getServerSideProps sees the request, the variables and the query, and sets cookies", async () => {
    const response = await get("/server?q=oyster", { headers: { "user-agent": "oester-e2e" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBe("visited=yes; Path=/");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const page = await response.text();
    expect(page).toContain("agent: <!-- -->oester-e2e");
    expect(page).toContain("secret: <!-- -->pearl");
    expect(page).toContain("query: <!-- -->oyster");
  });

  test("the page's data route answers JSON for client-side navigation", async () => {
    const response = await get(`/_next/data/${await buildId()}/server.json?q=pearl`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ pageProps: { query: "pearl" } });
  });

  test("a redirect from getServerSideProps", async () => {
    const response = await get("/go-away");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/about");
  });

  test("notFound from getServerSideProps renders the custom 404", async () => {
    const response = await get("/gone");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Custom pages 404");
  });
});

describe("API routes", () => {
  test("GET sees the query and cookies and keeps its cache-control", async () => {
    const response = await get("/api/echo?a=1", { headers: { cookie: "c=2" } });
    expect(response.headers.get("cache-control")).toBe("public, max-age=30");
    expect(await response.json()).toEqual({
      method: "GET",
      query: { a: "1" },
      cookies: { c: "2" },
    });
  });

  test("POST gets its JSON body parsed", async () => {
    const response = await get("/api/echo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shell: "oyster" }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      received: { shell: "oyster" },
      type: "application/json",
    });
  });

  test("a dynamic API route gets its param", async () => {
    expect(await (await get("/api/items/7")).json()).toEqual({ id: "7" });
  });

  test("res.write streams", async () => {
    const response = await get("/api/stream");
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("one\n");
    let rest = "";
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
      rest += new TextDecoder().decode(chunk.value);
    expect(rest).toBe("two\n");
  });
});

describe("middleware on the edge runtime", () => {
  test("runs for a server-rendered page", async () => {
    expect((await get("/server")).headers.get("x-middleware")).toBe("edge");
  });

  test("runs for a prerendered page, which is otherwise a static file", async () => {
    expect((await get("/about")).headers.get("x-middleware")).toBe("edge");
  });

  test("does not run where its matcher does not reach", async () => {
    expect((await get("/")).headers.get("x-middleware")).toBeNull();
  });

  test("can answer on its own", async () => {
    const response = await get("/blocked");
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("blocked by middleware");
  });
});

describe("next.config and public", () => {
  test("a redirect", async () => {
    const response = await get("/legacy");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/about");
  });

  test("a public file", async () => {
    expect(await html("/note.txt")).toBe("pages public file\n");
  });
});
