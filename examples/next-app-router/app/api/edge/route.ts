export const runtime = "edge";

export function GET(request: Request) {
  return Response.json({ runtime: "edge", path: new URL(request.url).pathname });
}
