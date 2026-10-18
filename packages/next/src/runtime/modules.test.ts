import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { createModules } from "./modules.ts";

function modules(files: Record<string, string>, links: Record<string, string> = {}) {
  const system = createModules({
    links,
    builtins: { "node:path": path },
    process: { env: { NODE_ENV: "production" }, cwd: () => "/app/web" },
  });
  system.add(files);
  return system;
}

describe("require", () => {
  test("a relative require finds the file with or without its extension, and modules are cached", () => {
    const system = modules({
      "/app/a.js": `exports.b = require("./lib/b"); exports.again = require("./lib/b.js"); exports.same = exports.b === exports.again;`,
      "/app/lib/b.js": `module.exports = { n: Math.random() };`,
    });
    const a = system.require("/app/a.js") as { same: boolean };
    expect(a.same).toBe(true);
  });

  test("a module sees its own __filename and __dirname, and the process it was given", () => {
    const system = modules({
      "/app/web/x.js": `module.exports = [__filename, __dirname, process.cwd(), process.env.NODE_ENV];`,
    });
    expect(system.require("/app/web/x.js")).toEqual([
      "/app/web/x.js",
      "/app/web",
      "/app/web",
      "production",
    ]);
  });

  test("JSON files are parsed, and a directory resolves through its package.json main or its index", () => {
    const system = modules({
      "/app/a.js": `module.exports = [require("./data.json").v, require("./pkg").v, require("./dir").v];`,
      "/app/data.json": `{ "v": 1 }`,
      "/app/pkg/package.json": `{ "main": "./main.js" }`,
      "/app/pkg/main.js": `exports.v = 2;`,
      "/app/dir/index.js": `exports.v = 3;`,
    });
    expect(system.require("/app/a.js")).toEqual([1, 2, 3]);
  });

  test("a bare specifier walks up the node_modules directories and follows package exports", () => {
    const system = modules({
      "/app/web/src/a.js": `module.exports = [require("lib").v, require("lib/sub").v, require("plain/x").v, require("lib/package.json").name];`,
      "/app/node_modules/lib/package.json": `{ "name": "lib", "exports": { ".": { "import": "./esm.js", "require": "./cjs.js" }, "./sub": { "node": { "default": "./sub-node.js" }, "default": "./sub.js" }, "./package.json": "./package.json" } }`,
      "/app/node_modules/lib/cjs.js": `exports.v = "cjs";`,
      "/app/node_modules/lib/esm.js": `exports.v = "esm";`,
      "/app/node_modules/lib/sub-node.js": `exports.v = "sub-node";`,
      "/app/web/node_modules/plain/x.js": `exports.v = "x";`,
    });
    expect(system.require("/app/web/src/a.js")).toEqual(["cjs", "sub-node", "x", "lib"]);
  });

  test("subpath patterns in exports are expanded", () => {
    const system = modules({
      "/app/a.js": `module.exports = require("lib/feature/one").v;`,
      "/app/node_modules/lib/package.json": `{ "exports": { "./feature/*": "./dist/*.js" } }`,
      "/app/node_modules/lib/dist/one.js": `exports.v = 1;`,
    });
    expect(system.require("/app/a.js")).toBe(1);
  });

  test("a symlinked package directory resolves to its target, so it loads once", () => {
    const system = modules(
      {
        "/app/web/a.js": `module.exports = require("lib") === require("../node_modules/.pnpm/lib@1/node_modules/lib");`,
        "/app/node_modules/.pnpm/lib@1/node_modules/lib/index.js": `module.exports = {};`,
      },
      { "/app/web/node_modules/lib": "/app/node_modules/.pnpm/lib@1/node_modules/lib" },
    );
    expect(system.require("/app/web/a.js")).toBe(true);
  });

  test("builtins come from the given modules, with or without the node: prefix", () => {
    const system = modules({
      "/app/a.js": `module.exports = [require("path").sep, require("node:path").sep];`,
    });
    expect(system.require("/app/a.js")).toEqual(["/", "/"]);
  });

  test("a builtin the edge lacks loads, and fails only when used, naming itself", () => {
    const system = modules({
      "/app/a.js": `const http = require("http"); module.exports = () => http.createServer();`,
    });
    const use = system.require("/app/a.js") as () => void;
    expect(use).toThrow(/node:http is not available on Oester/);
  });

  test("a missing module fails like Node does, with its code", () => {
    const system = modules({ "/app/a.js": `require("./nope")` });
    expect(() => system.require("/app/a.js")).toThrow(
      expect.objectContaining({ code: "MODULE_NOT_FOUND" }),
    );
  });

  test("circular requires see the partial exports, as in Node", () => {
    const system = modules({
      "/app/a.js": `exports.early = 1; const b = require("./b"); exports.fromB = b.sawEarly;`,
      "/app/b.js": `exports.sawEarly = require("./a").early;`,
    });
    expect(system.require("/app/a.js")).toEqual({ early: 1, fromB: 1 });
  });

  test("require.resolve gives the path without loading the module", () => {
    const system = modules({
      "/app/a.js": `module.exports = require.resolve("./b");`,
      "/app/b.js": `throw new Error("loaded")`,
    });
    expect(system.require("/app/a.js")).toBe("/app/b.js");
  });
});

describe("fs", () => {
  const system = modules({
    "/app/web/.next/BUILD_ID": "abc",
    "/app/web/.next/server/a.json": `{"a":1}`,
  });
  const fs = system.require("fs") as typeof import("node:fs");

  test("files read as text or bytes, and a missing file fails with ENOENT", async () => {
    expect(fs.readFileSync("/app/web/.next/BUILD_ID", "utf8")).toBe("abc");
    expect(new TextDecoder().decode(fs.readFileSync("/app/web/.next/BUILD_ID"))).toBe("abc");
    expect(await fs.promises.readFile("/app/web/.next/server/a.json", "utf8")).toBe(`{"a":1}`);
    expect(() => fs.readFileSync("/app/missing")).toThrow(
      expect.objectContaining({ code: "ENOENT" }),
    );
    await expect(fs.promises.readFile("/app/missing")).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("relative paths resolve against the process's working directory", () => {
    expect(fs.readFileSync(".next/BUILD_ID", "utf8")).toBe("abc");
  });

  test("directories exist, list their entries and stat as directories", () => {
    expect(fs.existsSync("/app/web/.next")).toBe(true);
    expect(fs.existsSync("/app/web/.next/nope")).toBe(false);
    expect(fs.statSync("/app/web/.next").isDirectory()).toBe(true);
    expect(fs.statSync("/app/web/.next/BUILD_ID").isFile()).toBe(true);
    expect(fs.readdirSync("/app/web/.next").sort()).toEqual(["BUILD_ID", "server"]);
  });

  test("writing fails, since the deployment's files are read-only", () => {
    expect(() => fs.writeFileSync("/app/x", "y")).toThrow(
      expect.objectContaining({ code: "EROFS" }),
    );
  });
});

describe("module", () => {
  test("has what Next's require hook and source map support read from it", () => {
    const system = modules({ "/app/b.js": `module.exports = "b";` });
    const module = system.require("module") as {
      prototype: { require(id: string): unknown };
      findSourceMap(path: string): unknown;
      _resolveFilename(id: string, parent: { filename: string }): string;
      createRequire(path: string): (id: string) => unknown;
    };
    expect(module.findSourceMap("/app/b.js")).toBeUndefined();
    expect(module.prototype.require.call({ filename: "/app/a.js" }, "./b")).toBe("b");
    expect(module._resolveFilename("./b", { filename: "/app/a.js" })).toBe("/app/b.js");
    expect(module.createRequire("/app/a.js")("./b")).toBe("b");
  });
});

describe("vm", () => {
  test("runInNewContext evaluates against the context object as its global", () => {
    const system = modules({});
    const vm = system.require("vm") as typeof import("node:vm");
    const context: Record<string, unknown> = {};
    vm.runInNewContext(`globalThis.__RSC_MANIFEST = { a: 1 }; self.b = 2;`, context);
    expect(context).toEqual({ __RSC_MANIFEST: { a: 1 }, b: 2 });
  });
});
