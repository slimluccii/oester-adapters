import type { APIRoute } from "astro";

export const POST: APIRoute = async ({ request }) =>
  Response.json({
    method: request.method,
    body: await request.json(),
    type: request.headers.get("content-type"),
  });
