import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import type { APIRoute } from "astro";

export const GET: APIRoute = () =>
  new Response(createHash("sha256").update(Buffer.from("oester")).digest("hex"));
