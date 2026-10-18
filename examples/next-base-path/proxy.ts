import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  response.headers.set("x-base-path-proxy", request.nextUrl.basePath);
  return response;
}

export const config = { matcher: ["/now/", "/about/"] };
