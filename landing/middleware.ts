import { NextRequest, NextResponse } from "next/server";
import { LANG_STORAGE_KEY } from "@/i18n/config";
import { normalizeLanguage } from "@/i18n/resolve-language";

export function middleware(request: NextRequest) {
  if (
    request.nextUrl.pathname === "/skill" &&
    request.nextUrl.searchParams.get("format") === "md"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/api/skill-md";
    return NextResponse.rewrite(url);
  }

  const lang = normalizeLanguage(request.nextUrl.searchParams.get("lang"));
  const response = NextResponse.next();
  if (lang) {
    response.cookies.set(LANG_STORAGE_KEY, lang, {
      path: "/",
      maxAge: 31536000,
      sameSite: "lax",
    });
  }
  return response;
}

export const config = {
  matcher: [
    "/skill",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|json)$).*)",
  ],
};
