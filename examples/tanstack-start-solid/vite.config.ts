import oester from "@oester/tanstack-start";
import { tanstackStart } from "@tanstack/solid-start/plugin/vite";
import { defineConfig } from "vite";
import viteSolid from "vite-plugin-solid";

export default defineConfig({
  plugins: [
    tanstackStart({
      serverFns: {
        generateFunctionId: ({ functionName }) =>
          functionName.replace(/_createServerFn_handler$/, ""),
      },
    }),
    viteSolid({ ssr: true }),
    oester(),
  ],
});
