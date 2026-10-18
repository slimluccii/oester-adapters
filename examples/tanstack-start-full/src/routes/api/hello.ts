import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/hello")({
  server: {
    handlers: {
      GET: () => new Response("Hello from a server route"),
      POST: async ({ request }) => Response.json({ received: await request.json() }),
    },
  },
});
