import { createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute("/api/hello")({
  server: { handlers: { GET: () => new Response("hello from solid") } },
});
