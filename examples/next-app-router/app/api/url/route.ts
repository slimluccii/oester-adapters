import type { NextRequest } from "next/server";

export function GET(request: NextRequest) {
  return Response.json({ url: request.url, nextUrl: request.nextUrl.href });
}
