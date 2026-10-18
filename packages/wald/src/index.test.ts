import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { WaldAdapterContext } from "@waldjs/cli";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { oester, type OesterOptions } from "./index.ts";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "oester-wald-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function write(path: string, contents = ""): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), contents);
}

async function build(
  files: Record<string, string>,
  context: Partial<WaldAdapterContext> = {},
  options?: OesterOptions,
) {
  for (const [path, contents] of Object.entries(files)) await write(join("dist", path), contents);
  const outDir = context.outDir ?? join(root, "dist");
  await oester(options).adapt?.({
    rootDir: root,
    outDir,
    outDirRelative: outDir,
    base: "/",
    staticRoutes: 1,
    dynamicRoutes: 0,
    dynamicPages: 0,
    canopyEntries: 0,
    ...context,
  });
  return JSON.parse(await readFile(join(root, ".oester/output/manifest.json"), "utf8"));
}

describe("oester()", () => {
  it("is a WaldJS adapter that keeps the project's own outDir", () => {
    const adapter = oester();
    expect(adapter.name).toBe("oester");
    expect(adapter.outDir).toBeUndefined();
  });

  it("serves the built site as static files, without a server", async () => {
    const manifest = await build({ "index.html": "home", "blog/hello/index.html": "post" });

    expect(manifest).toMatchObject({
      version: 3,
      framework: { name: "wald" },
      routes: [{ match: "/*", type: "static" }],
    });
    expect(manifest.server).toBeUndefined();
    expect(await readFile(join(root, ".oester/output/static/blog/hello/index.html"), "utf8")).toBe(
      "post",
    );
    expect(await readdir(join(root, ".oester/output"))).not.toContain("server");
  });

  it("carries _headers and _redirects from public/ over for Oester to translate", async () => {
    await build({ "index.html": "", _headers: "/*\n  x-frame-options: DENY\n" });

    expect(await readFile(join(root, ".oester/output/static/_headers"), "utf8")).toContain(
      "x-frame-options",
    );
  });

  it("sends no header rules of its own, since Oester sets cache times itself", async () => {
    const manifest = await build({ "index.html": "", "assets/site.css": "" });

    expect(manifest.headers).toBeUndefined();
  });

  it("serves the site under the configured base", async () => {
    expect((await build({ "index.html": "" }, { base: "/docs/" })).base).toBe("/docs/");
    expect((await build({ "index.html": "" }, { base: "/docs" })).base).toBe("/docs/");
    expect((await build({ "index.html": "" }, { base: "/" })).base).toBeUndefined();
  });

  describe("not-found page", () => {
    it("uses the page that src/pages/404.wald renders", async () => {
      const manifest = await build({ "index.html": "", "404/index.html": "lost" });

      expect(manifest.notFound).toEqual({ type: "static", file: "404/index.html" });
    });

    it("prefers a 404.html from public/", async () => {
      const manifest = await build({ "index.html": "", "404.html": "", "404/index.html": "" });

      expect(manifest.notFound).toEqual({ type: "static", file: "404.html" });
    });

    it("leaves Oester's plain 404 when the site has no such page", async () => {
      const manifest = await build({ "index.html": "" });

      expect(manifest.notFound).toBeUndefined();
    });
  });

  describe("trailingSlash", () => {
    it.each([
      [undefined, undefined],
      ["ignore", undefined],
      ["always", "force-trailing-slash"],
      ["never", "drop-trailing-slash"],
    ] as const)("%s sets htmlHandling to %s", async (trailingSlash, htmlHandling) => {
      const manifest = await build({ "index.html": "" }, {}, { trailingSlash });

      expect(manifest.htmlHandling).toBe(htmlHandling);
    });
  });

  it("names the installed WaldJS version", async () => {
    await write(
      "node_modules/@waldjs/cli/package.json",
      '{"name":"@waldjs/cli","version":"9.8.7","type":"module","exports":{".":"./dist/index.js"}}',
    );
    await write("node_modules/@waldjs/cli/dist/index.js", "export {}");

    const manifest = await build({ "index.html": "" });

    expect(manifest.framework).toEqual({ name: "wald", version: "9.8.7" });
  });

  it("refuses an outDir inside the Oester output, which it replaces on every build", async () => {
    await write(".oester/output/static/index.html");

    await expect(
      oester().adapt?.({
        rootDir: root,
        outDir: join(root, ".oester/output/static"),
        outDirRelative: ".oester/output/static",
        base: "/",
        staticRoutes: 1,
        dynamicRoutes: 0,
        dynamicPages: 0,
        canopyEntries: 0,
      }),
    ).rejects.toThrow(/outDir/);
  });
});
