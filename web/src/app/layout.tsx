import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { ToastProvider } from "@/components/ui/toast-provider";
import { DEFAULT_DESCRIPTION, HOME_TITLE, SITE_NAME, getPublicSiteUrlFromRequest } from "@/lib/site";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: HOME_TITLE,
  description: DEFAULT_DESCRIPTION,
  icons: {
    icon: [
      { url: "/clover-light.svg", media: "(prefers-color-scheme: light)", type: "image/svg+xml" },
      { url: "/clover.svg", media: "(prefers-color-scheme: dark)", type: "image/svg+xml" },
    ],
    shortcut: "/clover-light.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headerStore = await headers();
  const host =
    headerStore.get("x-forwarded-host") || headerStore.get("host") || undefined;
  const siteUrl = getPublicSiteUrlFromRequest(host);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}/#organization`,
        name: SITE_NAME,
        url: siteUrl,
        description: DEFAULT_DESCRIPTION,
        logo: `${siteUrl}/clover-light.svg`,
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}/#website`,
        url: siteUrl,
        name: SITE_NAME,
        description: DEFAULT_DESCRIPTION,
        publisher: { "@id": `${siteUrl}/#organization` },
        inLanguage: ["zh-CN", "en"],
      },
    ],
  };
  const themeBootScript = `(() => {
    try {
      const stored = localStorage.getItem("${THEME_STORAGE_KEY}");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const isDark = stored === "dark" || (stored !== "light" && prefersDark);
      const root = document.documentElement;
      root.classList.toggle("dark", isDark);
      root.style.colorScheme = isDark ? "dark" : "light";
    } catch {}
  })();`;
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
