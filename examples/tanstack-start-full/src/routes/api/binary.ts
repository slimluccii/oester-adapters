import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/binary")({
  server: {
    handlers: {
      GET: () =>
        new Response(new Uint8Array(Array.from({ length: 256 }, (_, i) => i)), {
          headers: { "content-type": "application/octet-stream" },
        }),
    },
  },
});
