import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { writeOutput } from "./output.ts";

async function project(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "oester-output-"));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

const read = (root: string, path: string) => readFile(join(root, ".oester/output", path), "utf8");
const manifestOf = async (root: string) => JSON.parse(await read(root, "manifest.json"));

describe("writeOutput", () => {
  test("a static site gets its files and a manifest without a server", async () => {
    const root = await project({ "dist/index.html": "home", "dist/a/b.css": "css" });
    await writeOutput({
      root,
      framework: { name: "test", version: "1.0.0" },
      staticDir: join(root, "dist"),
      routes: [{ match: "/*", type: "static" }],
    });
    expect(await read(root, "static/index.html")).toBe("home");
    expect(await read(root, "static/a/b.css")).toBe("css");
    expect(await manifestOf(root)).toEqual({
      version: 3,
      framework: { name: "test", version: "1.0.0" },
      compatibilityDate: "2026-10-01",
      routes: [{ match: "/*", type: "static" }],
    });
  });

  test("a server entry is bundled into server/index.mjs and named in the manifest", async () => {
    const root = await project({
      "dist/index.html": "home",
      "server.mjs": `import { createHash } from "node:crypto";\nexport default { fetch: () => new Response(createHash("sha256").update("x").digest("hex")) };\n`,
    });
    await writeOutput({
      root,
      framework: { name: "test" },
      staticDir: join(root, "dist"),
      routes: [{ match: "/*", type: "static-or-server" }],
      server: { entry: join(root, "server.mjs") },
    });
    expect((await manifestOf(root)).server).toEqual({ entry: "server/index.mjs" });
    const bundled = await read(root, "server/index.mjs");
    expect(bundled).toMatch(/from\s*"node:crypto"/);
  });

  test("the previous output is replaced, not merged", async () => {
    const root = await project({ "dist/new.html": "new", ".oester/output/static/old.html": "old" });
    await writeOutput({
      root,
      framework: { name: "test" },
      staticDir: join(root, "dist"),
      routes: [{ match: "/*", type: "static" }],
    });
    expect(await readdir(join(root, ".oester/output/static"))).toEqual(["new.html"]);
  });

  test("the base is normalized to slashes on both ends, and / means none", async () => {
    const root = await project({ "dist/index.html": "home" });
    await writeOutput({
      root,
      framework: { name: "test" },
      staticDir: join(root, "dist"),
      base: "docs",
      routes: [{ match: "/*", type: "static" }],
    });
    expect((await manifestOf(root)).base).toBe("/docs/");
    await writeOutput({
      root,
      framework: { name: "test" },
      staticDir: join(root, "dist"),
      base: "/",
      routes: [{ match: "/*", type: "static" }],
    });
    expect((await manifestOf(root)).base).toBeUndefined();
  });

  test("empty redirects and headers are left out", async () => {
    const root = await project({ "dist/index.html": "home" });
    await writeOutput({
      root,
      framework: { name: "test" },
      staticDir: join(root, "dist"),
      routes: [{ match: "/*", type: "static" }],
      redirects: [],
      headers: [],
    });
    const manifest = await manifestOf(root);
    expect(manifest).not.toHaveProperty("redirects");
    expect(manifest).not.toHaveProperty("headers");
  });

  test("a route that needs the server without a server entry is refused", async () => {
    const root = await project({ "dist/index.html": "home" });
    await expect(
      writeOutput({
        root,
        framework: { name: "test" },
        staticDir: join(root, "dist"),
        routes: [{ match: "/*", type: "server" }],
      }),
    ).rejects.toThrow(/server entry/);
  });

  test("a header Oester refuses fails the build, naming it", async () => {
    const root = await project({ "dist/index.html": "home" });
    await expect(
      writeOutput({
        root,
        framework: { name: "test" },
        staticDir: join(root, "dist"),
        routes: [{ match: "/*", type: "static" }],
        headers: [{ source: "/*", headers: { "Cache-Control": "max-age=1" } }],
      }),
    ).rejects.toThrow(/Cache-Control/);
  });

  test("a pattern outside the manifest's syntax fails the build, naming it", async () => {
    const root = await project({ "dist/index.html": "home" });
    await expect(
      writeOutput({
        root,
        framework: { name: "test" },
        staticDir: join(root, "dist"),
        routes: [{ match: "/a/*/b", type: "static" }],
      }),
    ).rejects.toThrow(/\/a\/\*\/b/);
    await expect(
      writeOutput({
        root,
        framework: { name: "test" },
        staticDir: join(root, "dist"),
        routes: [{ match: "/files/*.png", type: "static" }],
      }),
    ).rejects.toThrow(/\*\.png/);
  });
});
