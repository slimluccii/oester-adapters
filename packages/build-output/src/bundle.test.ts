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

describe("bundleServer", () => {
  test("keeps import() boundaries as separate modules", async () => {
    const root = await sources({
      "entry.mjs": `export default { fetch: async () => new Response((await import("./page.mjs")).text) };\n`,
      "page.mjs": `export const text = "page";\n`,
    });
    const outDir = join(root, "out");
    await bundleServer({ entry: join(root, "entry.mjs"), outDir });
    const files = await readdir(outDir, { recursive: true });
    expect(files).toContain("index.mjs");
    expect(files.filter((f) => f.endsWith(".mjs")).length).toBeGreaterThan(1);
    expect(await readFile(join(outDir, "index.mjs"), "utf8")).toMatch(/import\(/);
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
});
