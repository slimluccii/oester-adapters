import { defineConfig } from "tsdown";
import { adapter } from "../../tsdown.base.ts";

export default defineConfig({
  ...adapter,
  entry: { index: "src/index.ts", "runtime/server": "src/runtime/server.ts" },
});
