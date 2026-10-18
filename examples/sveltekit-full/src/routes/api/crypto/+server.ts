import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

export function GET() {
  const digest = createHash("sha256").update("oester").digest("hex");
  return new Response(`${digest} ${Buffer.from("oester").toString("base64")}`);
}
