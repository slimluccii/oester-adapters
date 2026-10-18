export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return Response.json({ pong: true, path: new URL(request.url).pathname });
}
