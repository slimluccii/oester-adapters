import { currentPath } from "#lib/server/where.ts";

export async function GET() {
  return new Response(await currentPath());
}
