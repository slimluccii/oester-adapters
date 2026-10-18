import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/cached")({
  server: {
    handlers: {
      GET: () => new Response("cache me", { headers: { "cache-control": "public, max-age=60" } }),
    },
  },
});
