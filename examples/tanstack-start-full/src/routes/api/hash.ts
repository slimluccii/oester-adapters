import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/hash")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = Buffer.from(await request.arrayBuffer());
        return Response.json({
          sha256: createHash("sha256").update(body).digest("hex"),
          base64: body.toString("base64"),
          uuid: randomUUID(),
        });
      },
    },
  },
});
