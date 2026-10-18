export const prerender = true;

export function GET() {
  return Response.json({ prerendered: true });
}
