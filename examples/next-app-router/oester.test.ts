import { describe, expect, test } from "vitest";
import { get } from "../../e2e/get.ts";

async function html(path: string, init?: RequestInit): Promise<string> {
  const response = await get(path, init);
  expect(response.status).toBe(200);
  return response.text();
}

describe("pages", () => {
  test("a prerendered page is served with Next's cache headers and the configured headers", async () => {
    const response = await get("/");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("x-config-header")).toBe("yes");
    expect(await response.text()).toContain("<h1>Home</h1>");
  });

  test("the client assets the page references load", async () => {
    const page = await html("/");
    const scripts = [...page.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]!);
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      const response = await get(script);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("javascript");
      expect(response.headers.get("x-config-header")).toBe("yes");
    }
  });

  test("a client-side navigation gets the RSC payload, not the HTML", async () => {
    const response = await get("/?_rsc=abc", { headers: { rsc: "1" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/x-component");
  });

  test("a dynamic page renders per request, with request headers, cookies and variables", async () => {
    const page = await html("/dynamic", {
      headers: { "user-agent": "oester-e2e", cookie: "flavor=mint" },
    });
    expect(page).toContain("agent: <!-- -->oester-e2e");
    expect(page).toContain("flavor: <!-- -->mint");
    expect(page).toContain("greeting: <!-- -->hello from Oester");
  });

  test("a server response without cache-control is not cached", async () => {
    const response = await get("/dynamic");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("a page prerendered from generateStaticParams is served, an unlisted param is a 404", async () => {
    expect(await html("/blog/first")).toContain("Post <!-- -->first");
    const missing = await get("/blog/third");
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("Nothing here");
  });

  test("an unknown path renders the not-found page with status 404", async () => {
    const response = await get("/does-not-exist");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Nothing here");
  });

  test("notFound() in a page answers 404 with the not-found page", async () => {
    const response = await get("/missing-item");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Nothing here");
  });

  test("redirect() in a page answers with a redirect", async () => {
    const response = await get("/redirect-me");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/dynamic");
  });

  test("a page with revalidate is served from the prerender and regenerated once stale", async () => {
    const first = await html("/isr");
    const rendered = /rendered at (?:<!-- -->)?(\d+)/.exec(first)![1];
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await get("/isr").then((r) => r.text());
    await new Promise((resolve) => setTimeout(resolve, 300));
    const later = /rendered at (?:<!-- -->)?(\d+)/.exec(await html("/isr"))![1];
    expect(Number(later)).toBeGreaterThan(Number(rendered));
  });

  test("a Suspense boundary streams: the fallback arrives before the slow content", async () => {
    const response = await get("/streaming");
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let received = "";
    let sawFallbackFirst = false;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += decoder.decode(value, { stream: true });
      if (received.includes("loading slow content") && !received.includes("slow content arrived"))
        sawFallbackFirst = true;
    }
    expect(sawFallbackFirst).toBe(true);
    expect(received).toContain("slow content arrived");
  });

  test("next/image points at the image itself, which is served from public", async () => {
    const page = await html("/image");
    expect(page).toContain('src="/oester.svg"');
    const image = await get("/oester.svg");
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toContain("image/svg+xml");
  });

  test("a trailing slash is removed with a permanent redirect", async () => {
    const response = await get("/dynamic/");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/dynamic");
  });

  test("HEAD answers with the headers and no body", async () => {
    const response = await get("/dynamic", { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });
});

describe("the edge runtime", () => {
  test("a page with runtime edge renders per request, with the deployment's variables", async () => {
    const page = await html("/edge", { headers: { "user-agent": "oester-e2e" } });
    expect(page).toContain("rendered on the edge runtime for <!-- -->oester-e2e");
    expect(page).toContain("greeting: <!-- -->hello from Oester");
  });

  test("a route handler with runtime edge answers", async () => {
    expect(await (await get("/api/edge")).json()).toEqual({ runtime: "edge", path: "/api/edge" });
  });
});

describe("route handlers", () => {
  test("GET reads the deployment's variables at request time", async () => {
    const response = await get("/api/hello");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ greeting: "hello from Oester" });
  });

  test("POST reads the request body", async () => {
    const response = await get("/api/hello", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "oyster" }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ hello: "oyster" });
  });

  test("a dynamic segment arrives as a param", async () => {
    expect(await (await get("/api/items/42")).json()).toEqual({ id: "42" });
  });

  test("cache-control set by the handler is kept", async () => {
    const response = await get("/api/cached");
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
  });

  test("cookies().set adds a set-cookie header", async () => {
    const response = await get("/api/cookie");
    expect(response.headers.get("set-cookie")).toMatch(/^flavor=vanilla; Path=\/; HttpOnly/);
  });

  test("a streamed response arrives in parts", async () => {
    const response = await get("/api/stream");
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toBe("first\n");
    let rest = "";
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
      rest += new TextDecoder().decode(chunk.value);
    expect(rest).toBe("second\n");
  });

  test("a metadata route is served", async () => {
    const response = await get("/robots.txt");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("User-Agent: *");
  });
});

describe("server actions", () => {
  test("a form posted without JavaScript runs the action, which sets a cookie and redirects", async () => {
    const page = await html("/actions");
    const field = /name="(\$ACTION_ID_[0-9a-f]+)"/.exec(page)![1]!;
    const form = new FormData();
    form.set(field, "");
    form.set("value", "pearl");
    const response = await get("/actions", { method: "POST", body: form });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/actions");
    expect(response.headers.get("set-cookie")).toMatch(/^remembered=pearl/);
  });
});

describe("next.config", () => {
  test("a redirect is answered with its status and its parameters filled in", async () => {
    const response = await get("/old/first?x=1");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/blog/first?x=1");
  });

  test("a rewrite serves another route under the requested path", async () => {
    expect(await html("/rewritten")).toContain("agent:");
  });

  test("configured headers reach static files from public", async () => {
    const response = await get("/hello.txt");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("hello from public\n");
    expect(response.headers.get("x-config-header")).toBe("yes");
  });
});

describe("proxy", () => {
  test("runs before pages, adding response headers and request headers the page reads", async () => {
    const response = await get("/dynamic");
    expect(response.headers.get("x-proxy")).toBe("ran");
    expect(await response.text()).toContain("from proxy: <!-- -->hi");
  });

  test("runs for a prerendered page too", async () => {
    expect((await get("/")).headers.get("x-proxy")).toBe("ran");
  });

  test("runs for files from public, which its matcher covers", async () => {
    expect((await get("/hello.txt")).headers.get("x-proxy")).toBe("ran");
  });

  test("does not run for Next's own assets, which its matcher leaves out", async () => {
    const page = await html("/");
    const script = /src="(\/_next\/static\/[^"]+\.js)"/.exec(page)![1]!;
    expect((await get(script)).headers.get("x-proxy")).toBeNull();
  });

  test("can redirect", async () => {
    const response = await get("/proxy-redirect");
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!, "https://x").pathname).toBe("/");
  });

  test("can rewrite", async () => {
    expect(await html("/proxy-rewrite")).toContain("agent:");
  });

  test("can answer on its own", async () => {
    const response = await get("/proxy-response");
    expect(response.status).toBe(418);
    expect(await response.text()).toBe("answered by the proxy");
  });
});
