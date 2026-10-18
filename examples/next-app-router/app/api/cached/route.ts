export const dynamic = "force-dynamic";

export function GET() {
  return new Response("cached for a minute", {
    headers: { "cache-control": "public, max-age=60" },
  });
}
