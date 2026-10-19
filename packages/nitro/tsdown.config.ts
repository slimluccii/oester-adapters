import { defineConfig } from "tsdown";
import { adapter } from "../../tsdown.base.ts";

export default defineConfig({
  ...adapter,
  entry: { preset: "src/preset.ts", "runtime/entry": "src/runtime/entry.ts" },
  deps: { neverBundle: [/^#/] },
});
