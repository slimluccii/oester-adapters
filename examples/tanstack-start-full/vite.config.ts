import oester from "@oester/tanstack-start";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackStart({
      // Stable ids let the checks call server functions by name.
      serverFns: {
        generateFunctionId: ({ functionName }) =>
          functionName.replace(/_createServerFn_handler$/, ""),
      },
    }),
    viteReact(),
    oester(),
  ],
});
