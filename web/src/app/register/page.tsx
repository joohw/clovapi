"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { apiPost } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [affCode, setAffCode] = useState("");
  const [affCodeFromQuery, setAffCodeFromQuery] = useState(false);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const queryAff = searchParams.get("aff") || searchParams.get("aff_code") || searchParams.get("invite_code") || "";
    if (queryAff && !affCode) {
      setAffCode(queryAff);
      setAffCodeFromQuery(true);
    }
  }, [searchParams, affCode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg("");
    if (!username || !password || !password2) {
      setErrorMsg("请填写完整信息");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("密码长度不得小于 8 位");
      return;
    }
    if (password !== password2) {
      setErrorMsg("两次输入的密码不一致");
      return;
    }
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { username, password, password2 };
      if (email) payload.email = email;
      if (affCode) payload.aff_code = affCode.trim();
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
    <div className="auth-page">
      <div className="auth-shell">
        <div className="auth-card">
          <h1 className="auth-title">注册</h1>
          <div className="auth-body">
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div>
                <label className="auth-label" htmlFor="register-username">用户名</label>
                <input id="register-username" className="auth-input" type="text" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="请输入用户名" />
              </div>
              <div>
                <label className="auth-label" htmlFor="register-email">邮箱（可选）</label>
                <input id="register-email" className="auth-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="请输入邮箱地址" />
              </div>
              <div>
                <label className="auth-label" htmlFor="register-aff">邀请码（可选）</label>
                <input id="register-aff" className="auth-input" type="text" value={affCode} onChange={(event) => setAffCode(event.target.value)} autoComplete="off" disabled={affCodeFromQuery} placeholder="请输入邀请码" />
              </div>
              <div>
                <label className="auth-label" htmlFor="register-password">密码</label>
                <input id="register-password" className="auth-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="输入密码，最短 8 位" />
              </div>
              <div>
                <label className="auth-label" htmlFor="register-password2">确认密码</label>
                <input id="register-password2" className="auth-input" type="password" value={password2} onChange={(event) => setPassword2(event.target.value)} autoComplete="new-password" placeholder="再次输入密码" />
              </div>
              {errorMsg ? <p className="text-sm text-red-500">{errorMsg}</p> : null}
              <div className="auth-actions">
                <button className="btn w-full" type="submit" disabled={loading}>{loading ? "注册中..." : "注册"}</button>
              </div>
            </form>
            <div className="mt-6 text-center text-sm">
              <Link className="text-blue-600" href="/login">已有账户？去登录</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
