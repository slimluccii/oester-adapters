import { expect, test } from "vitest";
import { get } from "../../e2e/get.ts";

test("every page is a prerendered file", async () => {
  for (const [path, content] of [
    ["/", "Static home"],
    ["/about", "About this static site"],
    ["/blog/hello-world", "Hello, world"],
    ["/blog/second-post", "A second post"],
    ["/blog/h%C3%A9llo-wereld", "Hallo, wereld"],
  ]) {
    const response = await get(path);
    expect(response.status, path).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/text\/html/);
    expect(await response.text()).toContain(content);
  }
});

test("a prerendered endpoint and a file from static/ are served", async () => {
  expect(await (await get("/feed.json")).json()).toEqual({ posts: ["hello-world", "second-post"] });
  expect(await (await get("/robots.txt")).text()).toContain("User-agent: *");
});

test("a trailing slash redirects to the page without it", async () => {
  const response = await get("/blog/hello-world/");
  expect(response.status).toBe(308);
  expect(response.headers.get("location")).toBe("/blog/hello-world");
});

test("a redirect met while prerendering is served by Oester", async () => {
  const response = await get("/moved");
  expect(response.status).toBe(308);
  expect(response.headers.get("location")).toBe("/about");
});

test("an unknown path gets the prerendered /404 page with status 404, without a server", async () => {
  for (const path of ["/nope", "/blog/unknown", "/api/anything", "/_app/immutable/missing.js"]) {
    const response = await get(path);
    expect(response.status, path).toBe(404);
    expect(await response.text()).toContain("This page does not exist");
  }
});

test("public variables are written at build time, as there is no server to answer /_app/env.js", async () => {
  expect(await (await get("/about")).text()).toContain("A static site");
  const html = await (await get("/")).text();
  const script = html.match(/(_app\/immutable\/entry\/start\.[^"]+\.js)/)?.[1];
  expect((await get(`/${script}`)).status).toBe(200);
  const env = await get("/_app/env.js");
  expect(env.status).toBe(200);
  expect(await env.text()).toContain("A static site");
});
