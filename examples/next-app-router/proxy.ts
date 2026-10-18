import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/proxy-redirect") return NextResponse.redirect(new URL("/", request.url));
  if (pathname === "/proxy-rewrite") return NextResponse.rewrite(new URL("/dynamic", request.url));
  if (pathname === "/proxy-response")
    return new NextResponse("answered by the proxy", { status: 418 });
  const headers = new Headers(request.headers);
  headers.set("x-from-proxy", "hi");
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-proxy", "ran");
  return response;
}

export const config = { matcher: ["/((?!_next/static|favicon.ico).*)"] };
