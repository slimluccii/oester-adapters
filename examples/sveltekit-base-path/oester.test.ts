import { describe, expect, test } from "vitest";
import { get, live } from "../../e2e/get.ts";

const target = new URL(process.env.OESTER_URL ?? "http://localhost");
const origin = live ? target.origin : `https://${target.host}`;
const fromServer = (response: Response) => response.headers.get("cache-control") === "no-store";

describe("base path", () => {
  test("the root of the host redirects to the base", async () => {
    const response = await get("/?x=1");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/docs/?x=1");
  });

  test("a path outside the base is not found", async () => {
    expect((await get("/other/")).status).toBe(404);
    expect((await get("/_app/version.json")).status).toBe(404);
  });

  test("the base with its slash is the prerendered home page", async () => {
    const response = await get("/docs/");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Docs home");
  });

  test("assets referenced by a page resolve under the base", async () => {
    const page = new URL("/docs/guide/", target);
    const html = await (await get(page.pathname)).text();
    const href = html.match(/href="([^"]*_app\/immutable\/entry\/start\.[^"]+\.js)"/)?.[1];
    expect(href).toBeDefined();
    const asset = await get(new URL(href!, page).pathname);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toMatch(/javascript/);
  });

  test("files from static/ are under the base", async () => {
    expect(await (await get("/docs/robots.txt")).text()).toContain("User-agent: *");
  });
});

describe("trailingSlash 'always'", () => {
  test("a prerendered page without its slash redirects to it", async () => {
    const response = await get("/docs/guide");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("/docs/guide/");
    const page = await get("/docs/guide/");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("The guide");
  });

  test("a rendered page without its slash is redirected by SvelteKit", async () => {
    const response = await get("/docs/live");
    expect(response.status).toBe(308);
    expect(new URL(response.headers.get("location")!, target.origin + "/docs/live").pathname).toBe(
      "/docs/live/",
    );
  });

  test("a prerendered redirect under the base", async () => {
    const response = await get("/docs/old/");
    expect(response.status).toBe(301);
    expect(response.headers.get("location")).toBe("/docs/guide");
  });
});

describe("the server under a base path", () => {
  test("SvelteKit sees the full URL, base included", async () => {
    const response = await get("/docs/live/");
    expect(response.status).toBe(200);
    expect(fromServer(response)).toBe(true);
    const html = await response.text();
    expect(html).toContain('id="path">/docs/live/<');
    expect(html).toContain("Disallow:");
  });

  test("read() finds an asset under the base", async () => {
    const response = await get("/docs/api/notes");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Read under the base path.\n");
  });

  test("a form action under the base", async () => {
    const response = await get("/docs/live/?/go", {
      method: "POST",
      body: "",
      headers: {
        origin,
        accept: "text/html",
        "content-type": "application/x-www-form-urlencoded",
      },
    });
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!, target.origin + "/docs/live/").pathname).toBe(
      "/docs/guide",
    );
  });

  test("an unknown path under the base gets SvelteKit's 404", async () => {
    const response = await get("/docs/nope/");
    expect(response.status).toBe(404);
    expect(fromServer(response)).toBe(true);
  });
});
