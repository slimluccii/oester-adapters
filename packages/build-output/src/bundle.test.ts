import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { bundleServer } from "./bundle.ts";

async function sources(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "oester-bundle-"));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

async function answer(outDir: string): Promise<string> {
  const server = (await import(join(outDir, "index.mjs"))).default;
  return (await server.fetch(new Request("https://example.com/"))).text();
}

const megabytes = (size: number) => "x".repeat(Math.round(size * 1024 * 1024));

async function sizedPackages(sizes: Record<string, number>): Promise<string> {
  const names = Object.keys(sizes);
  const files: Record<string, string> = {
    "entry.mjs": `${names.map((name, i) => `import p${i} from "${name}";`).join("\n")}\nexport default { fetch: () => new Response(String(${names.map((_, i) => `p${i}.length`).join(" + ")})) };\n`,
  };
  for (const [name, size] of Object.entries(sizes)) {
    files[`node_modules/${name}/package.json`] = JSON.stringify({ name, main: "index.mjs" });
    files[`node_modules/${name}/index.mjs`] = `export default "${megabytes(size)}";\n`;
  }
  return sources(files);
}

describe("bundleServer", () => {
  test("0077: writes one module, with the modules import() loads inside it", async () => {
    const root = await sources({
      "entry.mjs": `export default { fetch: async () => new Response((await import("./page.mjs")).text) };\n`,
      "page.mjs": `export const text = "page";\n`,
    });
    const outDir = join(root, "out");
    await bundleServer({ entry: join(root, "entry.mjs"), outDir });
    expect(await readdir(outDir, { recursive: true })).toEqual(["index.mjs"]);
    const code = await readFile(join(outDir, "index.mjs"), "utf8");
    expect(code).not.toMatch(/\bimport\s*\(/);
    expect(await answer(outDir)).toBe("page");
  });

  test("0077: a module with top-level await that import() loads runs inside the one module", async () => {
    const root = await sources({
      "entry.mjs": `export default { fetch: async () => new Response((await import("./page.mjs")).text) };\n`,
      "page.mjs": `export const text = await Promise.resolve("awaited");\n`,
    });
    const outDir = join(root, "out");
    await bundleServer({ entry: join(root, "entry.mjs"), outDir });
    expect(await answer(outDir)).toBe("awaited");
  });

  test("0077: an import() of a builtin becomes a static node: import", async () => {
    const root = await sources({
      "entry.mjs": `export default { fetch: async () => new Response(typeof (await import("node:async_hooks")).AsyncLocalStorage) };\n`,
    });
    const outDir = join(root, "out");
    await bundleServer({ entry: join(root, "entry.mjs"), outDir });
    const code = await readFile(join(outDir, "index.mjs"), "utf8");
    expect(code).toMatch(/from\s*"node:async_hooks"/);
    expect(code).not.toMatch(/\bimport\s*\(/);
    expect(await answer(outDir)).toBe("function");
  });

  test("0077: an import() of a computed name fails when it runs, naming it", async () => {
    const root = await sources({
      "entry.mjs": `const load = (name) => import(name);\nexport default { fetch: () => load("node:crypto").then(() => new Response("loaded"), (error) => new Response(error.message)) };\n`,
    });
    const outDir = join(root, "out");
    await bundleServer({ entry: join(root, "entry.mjs"), outDir });
    expect(await readFile(join(outDir, "index.mjs"), "utf8")).not.toMatch(/\bimport\s*\(/);
    expect(await answer(outDir)).toMatch(/cannot load node:crypto/);
  });

  test("0077: import.meta is an object of the module's own, with a file URL as on Node", async () => {
    const root = await sources({
      "entry.mjs": `export default { fetch: () => new Response(new URL("page", import.meta.url).href + import.meta.dirname + (import.meta.env?.PROD ?? "")) };\n`,
    });
    const outDir = join(root, "out");
    await bundleServer({ entry: join(root, "entry.mjs"), outDir });
    expect(await readFile(join(outDir, "index.mjs"), "utf8")).not.toMatch(/import\.meta/);
    expect(await answer(outDir)).toBe("file:///page/");
  });

  test("writes a builtin without its prefix as node:", async () => {
    const root = await sources({
      "entry.mjs": `import { Buffer } from "buffer";\nexport default { fetch: () => new Response(Buffer.from("a").toString("hex")) };\n`,
    });
    const outDir = join(root, "out");
    await bundleServer({ entry: join(root, "entry.mjs"), outDir });
    const code = await readFile(join(outDir, "index.mjs"), "utf8");
    expect(code).toMatch(/from\s*"node:buffer"/);
  });

  test("a CommonJS package that requires a builtin gets it through an import, since ES modules have no require", async () => {
    const root = await sources({
      "entry.mjs": `import hash from "legacy";\nexport default { fetch: () => new Response(hash("x")) };\n`,
      "node_modules/legacy/package.json": JSON.stringify({ name: "legacy", main: "index.js" }),
      "node_modules/legacy/index.js": `const crypto = require("crypto");\nmodule.exports = (v) => crypto.createHash("sha256").update(v).digest("hex");\n`,
    });
    const outDir = join(root, "out");
    await bundleServer({ entry: join(root, "entry.mjs"), outDir });
    const code = await readFile(join(outDir, "index.mjs"), "utf8");
    expect(code).toMatch(/from\s*"node:crypto"/);
    expect(code).not.toMatch(/Dynamic require/);
  });

  test("globalThis.fetch is the module's own fetch, which Oester gives each deployment", async () => {
    const root = await sources({
      "entry.mjs": `const call = globalThis.fetch;\nexport default { fetch: () => globalThis.fetch("https://example.com/") ?? call };\n`,
    });
    const outDir = join(root, "out");
    await bundleServer({ entry: join(root, "entry.mjs"), outDir });
    expect(await readFile(join(outDir, "index.mjs"), "utf8")).not.toMatch(/globalThis\.fetch/);
  });

  test("a .wasm import gives a WebAssembly.Module, as on workerd, with the bytes inside the bundle", async () => {
    const root = await sources({
      "entry.mjs": `import eager from "./eager.wasm";\nexport const modules = async () => [eager, (await import("engine/onig.wasm")).default];\n`,
      "node_modules/engine/package.json": JSON.stringify({
        name: "engine",
        exports: { "./onig.wasm": "./onig.wasm" },
      }),
    });
    const empty = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    await writeFile(join(root, "eager.wasm"), empty);
    await writeFile(join(root, "node_modules/engine/onig.wasm"), empty);
    const outDir = join(root, "out");
    await bundleServer({ entry: join(root, "entry.mjs"), outDir });
    expect((await readdir(outDir, { recursive: true })).some((f) => f.endsWith(".wasm"))).toBe(
      false,
    );
    const { modules } = await import(join(outDir, "index.mjs"));
    for (const module of await modules()) expect(module).toBeInstanceOf(WebAssembly.Module);
  });

  test("a builtin the edge does not have fails the build, naming it and who imports it", async () => {
    const root = await sources({
      "entry.mjs": `import { readFileSync } from "node:fs";\nexport default { fetch: () => new Response(readFileSync("x")) };\n`,
    });
    await expect(
      bundleServer({ entry: join(root, "entry.mjs"), outDir: join(root, "out") }),
    ).rejects.toThrow(/node:fs.*entry\.mjs|entry\.mjs.*node:fs/s);
  });

  test("an adapter can stand in for a module the framework imports but the edge never runs", async () => {
    const root = await sources({
      "entry.mjs": `import { readFileSync } from "node:fs";\nexport default { fetch: () => new Response(typeof readFileSync) };\n`,
      "fs-stub.mjs": `export const readFileSync = () => { throw new Error("no file system"); };\n`,
    });
    const outDir = join(root, "out");
    await bundleServer({
      entry: join(root, "entry.mjs"),
      outDir,
      alias: { "node:fs": join(root, "fs-stub.mjs") },
    });
    expect(await readFile(join(outDir, "index.mjs"), "utf8")).not.toMatch(/node:fs/);
  });

  test("the build's environment conditions pick the package's edge export", async () => {
    const root = await sources({
      "entry.mjs": `import which from "dual";\nexport default { fetch: () => new Response(which) };\n`,
      "node_modules/dual/package.json": JSON.stringify({
        name: "dual",
        exports: { ".": { worker: "./worker.js", node: "./node.js" } },
      }),
      "node_modules/dual/worker.js": `export default "worker";\n`,
      "node_modules/dual/node.js": `export default "node";\n`,
    });
    const outDir = join(root, "out");
    await bundleServer({ entry: join(root, "entry.mjs"), outDir });
    const code = await readFile(join(outDir, "index.mjs"), "utf8");
    expect(code).toMatch(/"worker"/);
    expect(code).not.toMatch(/"node"/);
  });
  for (const builtin of [
    "node:child_process",
    "node:vm",
    "node:worker_threads",
    "node:constants",
    "node:path/win32",
  ])
    test(`0077: ${builtin}, which a Bunny script refuses to start with, fails the build`, async () => {
      const root = await sources({
        "entry.mjs": `import * as m from "${builtin}";\nexport default { fetch: () => new Response(typeof m) };\n`,
      });
      await expect(
        bundleServer({ entry: join(root, "entry.mjs"), outDir: join(root, "out") }),
      ).rejects.toThrow(new RegExp(`${builtin}.*not available on the Oester edge`));
    });

  test("0077: a package the bundle cannot resolve fails the build, naming it", async () => {
    const root = await sources({
      "entry.mjs": `import pad from "left-pad";\nexport default { fetch: () => new Response(pad("a", 2)) };\n`,
    });
    await expect(
      bundleServer({ entry: join(root, "entry.mjs"), outDir: join(root, "out") }),
    ).rejects.toThrow(/left-pad/);
  });

  test("0077: a module up to 7 MB is written without a warning", async () => {
    const root = await sizedPackages({ small: 6.5 });
    const { warnings } = await bundleServer({
      entry: join(root, "entry.mjs"),
      outDir: join(root, "out"),
    });
    expect(warnings).toEqual([]);
  });

  test("0077: a module above 7 MB is written with a warning naming its largest packages", async () => {
    const root = await sizedPackages({ big: 4, medium: 3.5 });
    const outDir = join(root, "out");
    const { warnings } = await bundleServer({ entry: join(root, "entry.mjs"), outDir });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/7\.5 MB.*7 MB/s);
    expect(warnings[0]).toMatch(/big 4\.0 MB, medium 3\.5 MB, \S*entry\.mjs 0\.0 MB/);
    expect(await readdir(outDir)).toEqual(["index.mjs"]);
  });

  test("0077: a module above 10 MB fails the build, naming its five largest packages", async () => {
    const root = await sizedPackages({ a: 2.4, b: 2.2, c: 2, d: 1.8, e: 1.6, f: 0.5 });
    const outDir = join(root, "out");
    const error = await bundleServer({ entry: join(root, "entry.mjs"), outDir }).then(
      () => undefined,
      (e: Error) => e,
    );
    expect(error?.message).toMatch(/10\.5 MB.*10 MB/s);
    expect(error?.message).toMatch(/a 2\.4 MB.*b 2\.2 MB.*c 2\.0 MB.*d 1\.8 MB.*e 1\.6 MB/s);
    expect(error?.message).not.toMatch(/\bf 0\.5 MB/);
    expect(existsSync(join(outDir, "index.mjs"))).toBe(false);
  });
});
