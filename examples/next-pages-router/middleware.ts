import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/blocked")
    return new NextResponse("blocked by middleware", { status: 403 });
  const response = NextResponse.next();
  response.headers.set("x-middleware", "edge");
  return response;
}

export const config = { matcher: ["/server", "/about", "/blocked"] };
