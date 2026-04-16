"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { apiPost } from "@/lib/api";
import { setStoredUser } from "@/lib/auth";

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
    <div className="auth-page">
      <div className="auth-shell">
        <div className="auth-card">
          <h1 className="auth-title">登录</h1>
          <div className="auth-body">
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div>
                <label className="auth-label" htmlFor="login-username">用户名或邮箱</label>
                <input id="login-username" className="auth-input" type="text" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="请输入用户名或邮箱地址" />
              </div>
              <div>
                <label className="auth-label" htmlFor="login-password">密码</label>
                <input id="login-password" className="auth-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="请输入密码" />
              </div>
              {errorMsg ? <p className="text-sm text-red-500">{errorMsg}</p> : null}
              <div className="auth-actions">
                <button className="btn w-full" type="submit" disabled={loading}>{loading ? "登录中..." : "继续"}</button>
              </div>
            </form>
            <div className="mt-6 text-center text-sm">
              <Link className="mr-3 text-blue-600" href="/reset">忘记密码？</Link>
              <Link className="text-blue-600" href="/register">注册</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
