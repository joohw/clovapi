"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { apiPost } from "@/lib/api";
import { setStoredUser } from "@/lib/auth";

const authFieldLabelClass = "mb-1 block text-[0.85rem] text-zinc-500";
const authFieldInputClass =
  "w-full min-h-10 rounded-sm border border-border bg-transparent px-3 py-2 text-sm text-foreground";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const redirectTarget = useMemo(() => {
    const raw = String(searchParams.get("redirect") || "");
    if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/login")) return "/dashboard";
    return raw;
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg("");
    if (!username || !password) {
      setErrorMsg("请输入用户名和密码");
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost("/api/user/login", { username, password });
      if (!res?.success) {
        setErrorMsg(res?.message || "登录失败");
        return;
      }
      setStoredUser(res.data);
      router.replace(redirectTarget);
      router.refresh();
    } catch {
      setErrorMsg("登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col lg:grid lg:grid-cols-2">
      <aside className="relative hidden min-h-0 flex-col justify-between border-r border-border bg-card/60 p-10 lg:flex">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            Account
          </p>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
            登录 CLOVAPI
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-zinc-500">
            登录后可进入控制台管理令牌、查看模型与使用统计。
          </p>
        </div>
        <Link
          href="/"
          className="font-mono text-xs text-zinc-500 transition-colors hover:text-foreground"
        >
          ← 返回首页
        </Link>
      </aside>

      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8 lg:py-12">
        <div className="w-full max-w-md p-2 sm:p-0">
          <div className="mb-8 lg:hidden">
            <Link
              href="/"
              className="font-mono text-xs text-zinc-500 transition-colors hover:text-foreground"
            >
              ← CLOVAPI
            </Link>
          </div>
          <h1 className="mb-5 text-center text-2xl font-semibold tracking-tight">登录</h1>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div>
              <label className={authFieldLabelClass} htmlFor="login-username">用户名或邮箱</label>
              <input id="login-username" className={authFieldInputClass} type="text" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="请输入用户名或邮箱地址" />
            </div>
            <div>
              <label className={authFieldLabelClass} htmlFor="login-password">密码</label>
              <input id="login-password" className={authFieldInputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="请输入密码" />
            </div>
            {errorMsg ? <p className="text-sm text-red-500">{errorMsg}</p> : null}
            <div className="pt-1">
              <button
                className="inline-flex h-10 w-full items-center justify-center border border-zinc-900 bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                type="submit"
                disabled={loading}
              >
                {loading ? "登录中..." : "继续"}
              </button>
            </div>
          </form>
          <div className="mt-6 text-center text-sm">
            <Link className="mr-3 text-accent transition-colors hover:text-foreground" href="/reset">忘记密码？</Link>
            <Link className="text-accent transition-colors hover:text-foreground" href="/register">注册</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
