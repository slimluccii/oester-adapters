import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/files/$")({
  server: {
    handlers: { GET: ({ params }) => new Response(`file: ${params._splat}`) },
  },
});
