import { describe, expect, test } from "vitest";
import { get } from "../../e2e/get.ts";

describe("middleware at the edge", () => {
  test("runs before a prerendered page", async () => {
    const res = await get("/");
    expect(await res.text()).toContain("astro-edge home");
    expect(res.headers.get("x-edge-middleware")).toBe("ran");
  });

  test("runs before a public file", async () => {
    const res = await get("/hello.txt");
    expect(await res.text()).toBe("hello\n");
    expect(res.headers.get("x-edge-middleware")).toBe("ran");
  });

  test("guards a prerendered page", async () => {
    expect((await get("/private/report")).status).toBe(401);
    const res = await get("/private/report", { headers: { cookie: "user=luuk" } });
    expect(await res.text()).toContain("astro-edge private prerendered");
  });

  test("hands its locals to a page rendered on request", async () => {
    expect((await get("/private/me")).status).toBe(401);
    const res = await get("/private/me", { headers: { cookie: "user=luuk" } });
    expect(await res.text()).toContain("astro-edge private for luuk");
  });

  test("rewrites to a prerendered page", async () => {
    const res = await get("/legacy");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("astro-edge about");
  });

  test("a missing page still gets a 404", async () => {
    expect((await get("/missing")).status).toBe(404);
  });
});
