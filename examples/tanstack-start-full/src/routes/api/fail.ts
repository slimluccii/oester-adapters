import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/fail")({
  server: {
    handlers: {
      GET: () => {
        throw new Error("the handler failed");
      },
    },
  },
});
