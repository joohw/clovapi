import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname === "/skill" &&
    request.nextUrl.searchParams.get("format") === "md"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/api/skill-md";
    return NextResponse.rewrite(url);
  }
}

export const config = {
  matcher: "/skill",
};
