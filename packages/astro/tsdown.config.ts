import { defineConfig } from "tsdown";
import { adapter } from "../../tsdown.base.ts";

export default defineConfig({
  ...adapter,
  entry: {
    index: "src/index.ts",
    "runtime/cache": "src/runtime/cache.ts",
    "runtime/handler": "src/runtime/handler.ts",
    "runtime/edge-middleware": "src/runtime/edge-middleware.ts",
  },
});
