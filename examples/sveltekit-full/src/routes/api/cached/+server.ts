export function GET() {
  return new Response("cacheable", { headers: { "cache-control": "public, max-age=300" } });
}
