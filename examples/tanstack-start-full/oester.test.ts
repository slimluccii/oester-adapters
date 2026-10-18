import { describe, expect, test } from "vitest";
import { get } from "../../e2e/get.ts";

const browser = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36",
};
// What TanStack Start's client sends with a server function call; same-origin passes the CSRF middleware.
const serverFnHeaders = { "x-tsr-serverfn": "true", "sec-fetch-site": "same-origin" };
// Seroval's JSON for `{ data }`, the payload format of TanStack Start's client.
const payload = (data: unknown) =>
  JSON.stringify({
    t: { t: 10, i: 0, p: { k: ["data"], v: [data] }, o: 0 },
    f: 127,
    m: [],
  });
const text = (s: string) => ({ t: 1, s });
const callResult = async (response: Response) => JSON.parse(await response.text()).p.v[0];

describe("server-side rendering", () => {
  test("a page renders on request with its loader's server function data", async () => {
    const response = await get("/");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const html = await response.text();
    expect(html).toMatch(/Greeting: (<!-- -->)?Hallo Oester/);
    expect(html).toMatch(/Visitor: (<!-- -->)?anonymous/);
  });

  test("global request middleware runs on pages and server routes", async () => {
    expect((await get("/")).headers.get("x-request-middleware")).toBe("ran");
    expect((await get("/api/hello")).headers.get("x-request-middleware")).toBe("ran");
  });

  test("the client assets the page loads are served as static files, without the server", async () => {
    const html = await (await get("/")).text();
    const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
    expect(script).toBeDefined();
    const response = await get(script!);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("javascript");
    expect(response.headers.get("x-request-middleware")).toBeNull();
  });

  test("a file from public/ is served as it is", async () => {
    const response = await get("/favicon.svg");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/svg+xml");
  });

  test("a missing asset is a plain 404 that never reaches the server", async () => {
    const response = await get("/assets/missing.js");
    expect(response.status).toBe(404);
    expect(response.headers.get("x-request-middleware")).toBeNull();
  });

  test("deferred loader data streams: the shell arrives before the slow promise resolves", async () => {
    const started = Date.now();
    const response = await get("/deferred", { headers: browser });
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const first = decoder.decode((await reader.read()).value);
    const firstAfter = Date.now() - started;
    let rest = "";
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read())
      rest += decoder.decode(chunk.value);
    expect(first).toContain("fast data");
    expect(first).toContain("loading slow data");
    expect(firstAfter).toBeLessThan(250);
    expect(first + rest).toContain("slow data");
  });

  test("redirect() in beforeLoad answers 307 with the target", async () => {
    const response = await get("/redirect-me");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/deferred");
  });

  test("a dynamic route renders its param's data", async () => {
    const response = await get("/posts/first");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("The first post");
  });

  test("notFound() from a loader renders the not-found component with 404", async () => {
    const response = await get("/posts/missing");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Nothing lives here");
  });

  test("a path no route matches renders the not-found component with 404", async () => {
    const response = await get("/no/such/page");
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("Nothing lives here");
  });

  test("a loader that throws renders the error component with 500", async () => {
    const response = await get("/boom");
    expect(response.status).toBe(500);
    expect(await response.text()).toMatch(/Something broke: (<!-- -->)?the loader failed/);
  });
});

describe("server routes", () => {
  test("GET answers with the handler's response, stored as no-store without cache-control", async () => {
    const response = await get("/api/hello");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("Hello from a server route");
  });

  test("POST reads the request body", async () => {
    const response = await get("/api/hello", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    expect(await response.json()).toEqual({ received: { a: 1 } });
  });

  test("a cache-control the handler sets is kept", async () => {
    const response = await get("/api/cached");
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
  });

  test("route middleware can refuse a request, and params reach the handler", async () => {
    expect((await get("/api/users/42")).status).toBe(401);
    const response = await get("/api/users/42", { headers: { authorization: "Bearer letmein" } });
    expect(await response.json()).toEqual({ id: "42" });
  });

  test("a splat route gets the rest of the path", async () => {
    expect(await (await get("/api/files/a/b.txt")).text()).toBe("file: a/b.txt");
  });

  test("the request carries the visitor's URL and address, and process.env the deployment's variables", async () => {
    const body = await (await get("/api/request")).json();
    const origin = new URL(process.env.OESTER_URL!);
    expect(new URL(body.url).pathname).toBe("/api/request");
    expect(new URL(body.url).host).toBe(origin.host);
    expect(body.requestUrl).toBe(body.url);
    expect(body.host).toBe(origin.host);
    expect(body.ip).toBeTruthy();
    expect(body.env).toEqual({ greeting: "Hallo Oester", secret: true });
    expect(body.nodeEnv).toBe("production");
  });
});

describe("server functions", () => {
  test("a GET server function runs its middleware and handler", async () => {
    const response = await get("/_serverFn/getGreeting", {
      headers: { ...serverFnHeaders, "x-visitor": "luuk" },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await callResult(response))).toContain('"s":"luuk"');
  });

  test("a POST server function validates and answers its input", async () => {
    const response = await get("/_serverFn/echo", {
      method: "POST",
      headers: { ...serverFnHeaders, "content-type": "application/json" },
      body: payload({ t: 10, i: 1, p: { k: ["message"], v: [text("hi")] }, o: 0 }),
    });
    expect(response.status).toBe(200);
    expect(JSON.stringify(await callResult(response))).toContain('"s":"HI"');
  });

  test("a server function called with the wrong method is refused with 405", async () => {
    const response = await get("/_serverFn/echo", { headers: serverFnHeaders });
    expect(response.status).toBe(405);
  });

  test("the CSRF middleware refuses a cross-site call", async () => {
    const response = await get("/_serverFn/echo", {
      method: "POST",
      headers: { "x-tsr-serverfn": "true", "sec-fetch-site": "cross-site" },
    });
    expect(response.status).toBe(403);
  });

  test("setCookie in a server function sets the cookie, and getCookie reads it back", async () => {
    const response = await get("/_serverFn/setTheme", {
      method: "POST",
      headers: { ...serverFnHeaders, "content-type": "application/json" },
      body: payload(text("dark")),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBe("theme=dark; Path=/; HttpOnly; SameSite=Lax");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await (await get("/cookies", { headers: { cookie: "theme=dark" } })).text()).toMatch(
      /Theme: (<!-- -->)?dark/,
    );
    expect(await (await get("/cookies")).text()).toMatch(/Theme: (<!-- -->)?light/);
  });
});
