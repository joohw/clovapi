"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "@/lib/api";
import { clearStoredUser, getStoredUser, isAdminUser } from "@/lib/auth";
import { applyThemeMode, initThemeMode, persistThemeMode, type ThemeMode } from "@/lib/theme";
import { titleByPath } from "@/lib/site";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type HeaderLink = { text: string; to: string };

const PIXEL_GLYPHS: Record<string, string[]> = {
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
};

function buildPixelRows(text: string): string[] {
  const rows = Array.from({ length: 7 }, () => "");
  const chars = text.toUpperCase().split("");
  chars.forEach((char, idx) => {
    const glyph = PIXEL_GLYPHS[char] ?? PIXEL_GLYPHS.I;
    for (let row = 0; row < 7; row += 1) {
      rows[row] += glyph[row];
      if (idx < chars.length - 1) rows[row] += "0";
    }
  });
  return rows;
}

const BRAND_PIXEL_ROWS = buildPixelRows("CLOVAPI");

function normalizePath(path: string) {
  if (!path) return "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

function isNavActive(currentPath: string, href: string): boolean {
  const p = normalizePath(currentPath);
  const t = normalizePath(href);
  if (t === "/") return p === "/";
  if (t === "/dashboard") return p === "/dashboard";
  if (t === "/admin") return p === "/admin" || p.startsWith("/admin/");
  return p === t || p.startsWith(`${t}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [userInitial, setUserInitial] = useState("U");
  const [hasSession, setHasSession] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("light");
  const isDocsRoute = pathname === "/docs" || pathname.startsWith("/docs/");
  const isModelsRoute = pathname === "/models" || pathname.startsWith("/models/");
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  const lockMainScroll = isDocsRoute || isModelsRoute || isAdminRoute;

  useEffect(() => {
    const user = getStoredUser();
    setHasSession(!!user);
    setIsAdmin(isAdminUser(user));
    const name = user?.display_name || user?.username || "";
    setUserInitial(name ? String(name).slice(0, 1).toUpperCase() : "U");
    document.title = titleByPath(pathname);
  }, [pathname]);

  useEffect(() => {
    setTheme(initThemeMode());
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [menuOpen]);

  const headerLinks = useMemo<HeaderLink[]>(() => {
    const home = [{ text: "首页", to: "/" }];
    if (!hasSession) return [...home, { text: "模型", to: "/models" }, { text: "文档", to: "/docs" }];
    const dash = [{ text: "控制台", to: "/dashboard" }];
    if (isAdmin) dash.push({ text: "管理", to: "/admin" });
    return [...home, ...dash, { text: "模型", to: "/models" }, { text: "文档", to: "/docs" }];
  }, [hasSession, isAdmin]);

  async function logout() {
    setMenuOpen(false);
    setShowLogoutConfirm(false);
    try {
      await apiGet("/api/user/logout");
    } catch {
      // ignore remote logout failures
    }
    clearStoredUser();
    setHasSession(false);
    setIsAdmin(false);
    setUserInitial("U");
    router.replace("/");
    router.refresh();
  }

  function toggleTheme() {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    applyThemeMode(nextTheme);
    persistThemeMode(nextTheme);
    setTheme(nextTheme);
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link href="/" className="header-brand" aria-label="返回首页">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={theme === "dark" ? "/clover.svg" : "/clover-light.svg"} alt="CLOVAPI" className="header-brand-icon" />
          <span className="sr-only">CLOVAPI</span>
          <span className="header-brand-pixel" aria-hidden="true">
            {BRAND_PIXEL_ROWS.map((row, rowIdx) => (
              <span className="header-brand-pixel-row" key={`pixel-row-${rowIdx}`}>
                {row.split("").map((bit, bitIdx) => (
                  <span
                    className={`header-brand-pixel-dot ${bit === "1" ? "is-on" : ""}`}
                    key={`pixel-dot-${rowIdx}-${bitIdx}`}
                  />
                ))}
              </span>
            ))}
          </span>
        </Link>
        <nav className="header-nav">
          {headerLinks.map((link) => (
            <Link
              key={link.to}
              href={link.to}
              className={`header-nav-link ${isNavActive(pathname, link.to) ? "header-nav-link-active" : ""}`}
            >
              {link.text}
            </Link>
          ))}
        </nav>
        <div className="header-user-area" ref={menuRef}>
          <button
            type="button"
            className="theme-toggle-btn"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
            title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
          {hasSession ? (
            <>
              <button
                type="button"
                className={`avatar-btn ${menuOpen ? "avatar-btn-open" : ""}`}
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                title="账户菜单"
              >
                {userInitial}
              </button>
              {menuOpen ? (
                <div className="user-menu" role="menu">
                  <Link href="/dashboard" className="user-menu-item" role="menuitem" onClick={() => setMenuOpen(false)}>
                    控制台
                  </Link>
                  {isAdmin ? (
                    <Link href="/admin" className="user-menu-item" role="menuitem" onClick={() => setMenuOpen(false)}>
                      管理
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className="user-menu-item user-menu-item-danger"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      setShowLogoutConfirm(true);
                    }}
                  >
                    退出登录
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "default", size: "sm" }), "h-8 rounded-none px-3")}
            >
              登录
            </Link>
          )}
        </div>
      </header>
      <main
        className="app-main"
        style={
          lockMainScroll
            ? { display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }
            : undefined
        }
      >
        <div className={`app-main-body ${lockMainScroll ? "flex-1 overflow-hidden" : ""}`}>{children}</div>
      </main>
      <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <DialogContent className="max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>确认退出登录</DialogTitle>
            <DialogDescription>退出后需要重新登录，是否继续？</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowLogoutConfirm(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void logout()}>
              退出登录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
