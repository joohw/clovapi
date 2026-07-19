import { NextRequest, NextResponse } from "next/server";
import { normalizeLanguage } from "@/i18n/resolve-language";
import { localizedPath } from "@/lib/seo-data";

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
  if (lang) {
    const url = request.nextUrl.clone();
    const pathWithoutLocale = url.pathname.replace(/^\/(?:zh-CN|en)(?=\/|$)/, "") || "/";
    url.pathname = localizedPath(pathWithoutLocale, lang);
    url.searchParams.delete("lang");
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/skill/:path*",
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|json)$).*)",
  ],
};
