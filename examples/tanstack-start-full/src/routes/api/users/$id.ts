import { createFileRoute } from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";

const requireToken = createMiddleware().server(({ next, request }) => {
  if (request.headers.get("authorization") !== "Bearer letmein")
    throw new Response("Unauthorized", { status: 401 });
  return next();
});

export const Route = createFileRoute("/api/users/$id")({
  server: {
    middleware: [requireToken],
    handlers: { GET: ({ params }) => Response.json({ id: params.id }) },
  },
});
