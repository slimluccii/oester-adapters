import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/region")({
  server: { handlers: { GET: () => Response.json({ region: process.env.REGION }) } },
});
