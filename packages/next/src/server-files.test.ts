import { describe, expect, test } from "vitest";
import { isNativeCode } from "./server-files.ts";

describe("isNativeCode", () => {
  test("native addons and the shared libraries they load are native code", () => {
    for (const path of [
      "/a/sharp-darwin-arm64.node",
      "/a/lib/libvips-cpp.8.18.7.dylib",
      "/a/lib/libvips-cpp.so.42",
      "/a/lib/libvips.so",
      "/a/vips.dll",
    ])
      expect(isNativeCode(path)).toBe(true);
  });

  test("scripts, WebAssembly, fonts and data are not", () => {
    for (const path of [
      "/a/index.js",
      "/a/resvg.wasm",
      "/a/Geist-Regular.ttf",
      "/a/x.json",
      "/a/so.txt",
    ])
      expect(isNativeCode(path)).toBe(false);
  });
});
