import type { UserConfig } from "tsdown";

// @oester/build-output is a devDependency of every adapter, so it ends up inside the adapter's own dist.
export const adapter = {
  format: "esm",
  platform: "node",
  target: "node22",
  dts: true,
  outExtensions: () => ({ js: ".js", dts: ".d.ts" }),
} satisfies UserConfig;
