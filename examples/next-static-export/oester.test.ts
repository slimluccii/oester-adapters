import { describe, expect, test } from "vitest";
import { expectStaticCaching, get } from "../../e2e/get.ts";

async function html(path: string): Promise<string> {
  const response = await get(path);
  expect(response.status).toBe(200);
  return response.text();
}

describe("a static export", () => {
  test("pages are files, with their client assets", async () => {
    const page = await html("/");
    expect(page).toContain("<h1>Exported home</h1>");
    const scripts = [...page.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map((m) => m[1]!);
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) expect((await get(script)).status).toBe(200);
    expect(await html("/about")).toContain("Exported about");
    expect(await html("/posts/2")).toContain("Exported post <!-- -->2");
  });

  test("the RSC payload the client router fetches for a navigation is a file too", async () => {
    const response = await get("/about.txt");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Exported about");
  });

  test("a static route handler, public files and unoptimized images", async () => {
    expect(JSON.parse(await html("/feed.json"))).toEqual({ posts: [1, 2] });
    expect(await html("/")).toContain('src="/pearl.svg"');
    expect((await get("/pearl.svg")).status).toBe(200);
  });

  test("an unknown path gets the exported not-found page with status 404", async () => {
    const response = await get("/nowhere");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Exported not found");
  });

  test("there is no server", async () => {
    expect((await get("/")).headers.get("cdn-tag")).toBeNull();
  });
});

test("hashed assets are cached for a year, and pages revalidate by their etag", async () => {
  await expectStaticCaching("/", /\/_next\/static\/[^"\s]+\.js/);
});
