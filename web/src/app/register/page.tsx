"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { apiPost } from "@/lib/api";

const authFieldLabelClass = "mb-1 block text-[0.85rem] text-zinc-500";
const authFieldInputClass =
  "w-full min-h-10 rounded-sm border border-border bg-transparent px-3 py-2 text-sm text-foreground";

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const affCode = useMemo(
    () => String(searchParams.get("aff") || searchParams.get("aff_code") || searchParams.get("invite_code") || "").trim(),
    [searchParams]
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg("");
    if (!username || !password) {
      setErrorMsg("请填写完整信息");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("密码长度不得小于 8 位");
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { username, password };
      if (email) payload.email = email;
      if (affCode) payload.aff_code = affCode;
      const res = await apiPost("/api/user/register", payload);
      if (!res?.success) {
        setErrorMsg(res?.message || "注册失败");
        return;
      }
      router.push("/login");
    } catch {
      setErrorMsg("注册失败，请稍后重试");
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
            创建新账户
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-zinc-500">
            注册后可管理令牌、查看模型与用量统计。
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
          <h1 className="mb-5 text-center text-2xl font-semibold tracking-tight">注册</h1>
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div>
              <label className={authFieldLabelClass} htmlFor="register-username">用户名</label>
              <input id="register-username" className={authFieldInputClass} type="text" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="请输入用户名" />
            </div>
            <div>
              <label className={authFieldLabelClass} htmlFor="register-email">邮箱（可选）</label>
              <input id="register-email" className={authFieldInputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="请输入邮箱地址" />
            </div>
            <div>
              <label className={authFieldLabelClass} htmlFor="register-password">密码</label>
              <input id="register-password" className={authFieldInputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="输入密码，最短 8 位" />
            </div>
            {errorMsg ? <p className="text-sm text-red-500">{errorMsg}</p> : null}
            <div className="pt-1">
              <button
                className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-zinc-900 bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                type="submit"
                disabled={loading}
              >
                {loading ? "注册中..." : "注册"}
              </button>
            </div>
          </form>
          <div className="mt-6 text-center text-sm">
            <Link className="text-accent transition-colors hover:text-foreground" href="/login">已有账户？去登录</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
