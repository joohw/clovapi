import type { ReactNode } from "react";
import "@/app/globals.css";

export default function RedirectLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
