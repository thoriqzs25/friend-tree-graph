import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "fg-auth";
const AUTH_VALUE = "ok";

const BYPASS_PREFIXES = [
  "/pin",
  "/api/verify-pin",
  "/_next",
  "/favicon",
];

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (BYPASS_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (request.cookies.get(AUTH_COOKIE)?.value === AUTH_VALUE) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/pin";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
