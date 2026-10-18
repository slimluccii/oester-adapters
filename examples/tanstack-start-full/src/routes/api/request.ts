import { createFileRoute } from "@tanstack/react-router";
import { getRequestHost, getRequestIP, getRequestUrl } from "@tanstack/react-start/server";

export const Route = createFileRoute("/api/request")({
  server: {
    handlers: {
      GET: ({ request }) =>
        Response.json({
          url: request.url,
          requestUrl: getRequestUrl().href,
          host: getRequestHost(),
          ip: getRequestIP() ?? null,
          env: { greeting: process.env.GREETING ?? null, secret: Boolean(process.env.SECRET) },
          nodeEnv: process.env.NODE_ENV,
        }),
    },
  },
});
