import { describe, expect, test } from "vitest";
import { createModules } from "./modules.ts";
import { deploymentGlobal } from "./global.ts";

function run(source: string) {
  const scope = deploymentGlobal({ env: {}, cwd: () => "/app" });
  const system = createModules({
    links: {},
    builtins: {},
    process: scope.process as never,
    scope: scope.values,
  });
  system.add({ "/app/a.js": source });
  return { exports: system.require("/app/a.js"), scope };
}

describe("deploymentGlobal", () => {
  test("what a module writes to globalThis or global stays off the isolate's global", () => {
    const { exports, scope } = run(
      `globalThis.__incrementalCache = 1; global[Symbol.for("next.server.manifests")] = 2; module.exports = [globalThis.__incrementalCache, typeof globalThis.Response];`,
    );
    expect(exports).toEqual([1, "function"]);
    expect((globalThis as Record<string, unknown>).__incrementalCache).toBeUndefined();
    expect(
      (globalThis as Record<symbol, unknown>)[Symbol.for("next.server.manifests")],
    ).toBeUndefined();
    expect((scope.values.globalThis as Record<string, unknown>).__incrementalCache).toBe(1);
  });

  test("a patched fetch reaches code that calls fetch by its bare name, and only that deployment's", async () => {
    const { exports } = run(
      `globalThis.fetch = async () => new Response("patched"); module.exports = () => fetch("https://example.com");`,
    );
    expect(await (await (exports as () => Promise<Response>)()).text()).toBe("patched");
    expect(String(globalThis.fetch)).not.toContain("patched");
  });

  test("patching Math, Date or console changes them for the deployment only", () => {
    const realRandom = Math.random;
    const realLog = console.log;
    const realDate = Date;
    const { exports } = run(
      `Math.random = () => 4; console.log = () => "quiet"; globalThis.Date = class extends Date {}; module.exports = [Math.random(), console.log()];`,
    );
    expect(exports).toEqual([4, "quiet"]);
    expect(Math.random).toBe(realRandom);
    expect(console.log).toBe(realLog);
    expect(globalThis.Date).toBe(realDate);
  });

  test("patching crypto's methods changes them for the deployment only, and they still work", () => {
    const realUUID = crypto.randomUUID;
    const { exports } = run(
      `const original = globalThis.crypto.randomUUID; globalThis.crypto.randomUUID = () => "patched:" + original.call(crypto); module.exports = [crypto.randomUUID(), crypto.getRandomValues(new Uint8Array(2)).length];`,
    );
    expect((exports as [string, number])[0]).toMatch(/^patched:[0-9a-f-]{36}$/);
    expect((exports as [string, number])[1]).toBe(2);
    expect(crypto.randomUUID).toBe(realUUID);
  });

  test("an accessor of the isolate's global that insists on its own this still reads", () => {
    const { exports } = run(`module.exports = typeof globalThis.crypto.getRandomValues;`);
    expect(exports).toBe("function");
  });

  test("process listeners a module adds are its deployment's own", () => {
    const before = process.listenerCount("unhandledRejection");
    const { scope } = run(`process.on("unhandledRejection", () => {});`);
    expect(process.listenerCount("unhandledRejection")).toBe(before);
    expect((scope.process as NodeJS.Process).listenerCount("unhandledRejection")).toBe(1);
  });
});
