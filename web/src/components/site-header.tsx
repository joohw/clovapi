"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "@/lib/api";
import { clearStoredUser, getStoredUser, isAdminUser } from "@/lib/auth";
import { applyThemeMode, initThemeMode, persistThemeMode, type ThemeMode } from "@/lib/theme";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type HeaderLink = { text: string; to: string };

const userMenuPanelClass =
  "absolute right-0 top-[calc(100%+0.4rem)] z-50 flex min-w-32 flex-col overflow-hidden rounded-md border border-border bg-card p-1";

const userMenuItemClass =
  "flex min-h-8 w-full cursor-pointer items-center justify-start rounded-sm border-0 bg-transparent px-2.5 text-left text-[0.85rem] text-foreground transition-colors hover:bg-muted/75";

const userMenuItemDangerClass =
  "text-destructive hover:bg-destructive/10 hover:text-destructive";

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

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userInitial, setUserInitial] = useState("U");
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("light");

  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/reset" ||
    pathname.startsWith("/user/reset");

  useEffect(() => {
    const user = getStoredUser();
    setHasSession(!!user);
    setIsAdmin(isAdminUser(user));
    const name = user?.display_name || user?.username || "";
    setUserInitial(name ? String(name).slice(0, 1).toUpperCase() : "U");
  }, [pathname]);

  useEffect(() => {
    setTheme(initThemeMode());
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
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
    const dash = [
      { text: "控制台", to: "/dashboard" },
      { text: "密钥", to: "/dashboard/keys" },
    ];
    if (isAdmin) dash.push({ text: "管理", to: "/admin" });
    return [...home, ...dash, { text: "模型", to: "/models" }, { text: "文档", to: "/docs" }];
  }, [hasSession, isAdmin]);

  function toggleTheme() {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    applyThemeMode(nextTheme);
    persistThemeMode(nextTheme);
    setTheme(nextTheme);
  }

  async function logout() {
    setMenuOpen(false);
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

  function navLinkClass(active: boolean) {
    return cn(
      "relative rounded-md px-2.5 py-1.5 text-sm",
      "motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-out",
      "motion-reduce:transition-none",
      /* 底指示线：始终占位，用横向缩放实现轻柔出现/消失 */
      "after:pointer-events-none after:absolute after:bottom-0 after:left-2 after:right-2 after:h-[1.5px] after:rounded-full after:bg-foreground/65",
      "motion-safe:after:transition-[transform,opacity] motion-safe:after:duration-300 motion-safe:after:ease-[cubic-bezier(0.22,1,0.36,1)]",
      "motion-reduce:after:transition-none",
      active
        ? "text-foreground after:scale-x-100 after:opacity-100"
        : "text-zinc-500 hover:text-foreground after:origin-center after:scale-x-0 after:opacity-0"
    );
  }

  if (isAuthRoute) return null;

  return (
    <header className="sticky top-0 z-40">
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-5 sm:gap-6">
          <Link href="/" className="inline-flex items-center" aria-label="返回首页">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={theme === "dark" ? "/clover.svg" : "/clover-light.svg"} alt="" className="h-[1.35rem] w-[1.35rem]" />
          </Link>
          <nav className="flex min-w-0 flex-1 items-center justify-start gap-1 overflow-x-auto whitespace-nowrap">
            {headerLinks.map((link) => (
              <Link key={link.to} href={link.to} className={navLinkClass(isNavActive(pathname, link.to))}>
                {link.text}
              </Link>
            ))}
          </nav>
        </div>
        <div className="relative inline-flex items-center gap-2" ref={menuRef}>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
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
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                  menuOpen ? "border-zinc-500 bg-muted" : ""
                )}
                onClick={() => setMenuOpen((prev) => !prev)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                title="账户菜单"
              >
                {userInitial}
              </button>
              {menuOpen ? (
                <div className={userMenuPanelClass} role="menu">
                  <Link
                    href="/dashboard"
                    className={userMenuItemClass}
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                  >
                    控制台
                  </Link>
                  {isAdmin ? (
                    <Link
                      href="/admin"
                      className={userMenuItemClass}
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                    >
                      管理
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className={cn(userMenuItemClass, userMenuItemDangerClass)}
                    role="menuitem"
                    onClick={() => void logout()}
                  >
                    退出登录
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 px-3")}>
              登录
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
