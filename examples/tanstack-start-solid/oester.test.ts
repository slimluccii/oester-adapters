import { expect, test } from "vitest";
import { get } from "../../e2e/get.ts";

test("a Solid page renders on the server with its loader's server function data", async () => {
  const response = await get("/");
  expect(response.status).toBe(200);
  expect(await response.text()).toMatch(/Flavor: (<!--[^>]*-->)?solid/);
});

test("a Solid app's client assets are static", async () => {
  const html = await (await get("/")).text();
  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)?.[1];
  expect(script).toBeDefined();
  expect((await get(script!)).status).toBe(200);
});

test("a server route answers", async () => {
  expect(await (await get("/api/hello")).text()).toBe("hello from solid");
});

test("a server function answers", async () => {
  const response = await get("/_serverFn/getFlavor", {
    headers: { "x-tsr-serverfn": "true", "sec-fetch-site": "same-origin" },
  });
  expect(await response.text()).toContain('"s":"solid"');
});

test("an unknown path renders the not-found component with 404", async () => {
  const response = await get("/nope");
  expect(response.status).toBe(404);
  expect(await response.text()).toContain("Not here");
});
