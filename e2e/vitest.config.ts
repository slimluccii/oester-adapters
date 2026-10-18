import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["../examples/*/oester.test.ts"], testTimeout: 30_000, fileParallelism: false },
});
