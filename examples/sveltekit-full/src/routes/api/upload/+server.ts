import { createHash } from "node:crypto";

export async function POST({ request }) {
  const file = (await request.formData()).get("file") as File;
  const bytes = new Uint8Array(await file.arrayBuffer());
  return new Response(bytes.toReversed(), {
    headers: {
      "content-type": "application/octet-stream",
      "x-sha256": createHash("sha256").update(bytes).digest("hex"),
      "x-name": file.name,
    },
  });
}
