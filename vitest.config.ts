import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["oester-source"] },
  ssr: { resolve: { conditions: ["oester-source"] } },
  test: { include: ["packages/*/src/**/*.test.ts"] },
});
