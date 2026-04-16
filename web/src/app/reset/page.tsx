"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiGet } from "@/lib/api";

export default function ResetPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMsg("");
    setErrorMsg("");
    if (!email) {
      setErrorMsg("请输入邮箱地址");
      return;
    }
    setLoading(true);
    try {
      const res = await apiGet(`/api/reset_password?email=${encodeURIComponent(email)}`);
      if (res?.success) {
        setSuccessMsg("重置邮件已发送，请检查邮箱");
        setEmail("");
      } else {
        setErrorMsg(res?.message || "发送失败");
      }
    } catch {
      setErrorMsg("请求失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <div className="auth-card">
          <h1 className="auth-title">密码重置</h1>
          <div className="auth-body">
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div>
                <label className="auth-label" htmlFor="reset-email">邮箱</label>
                <input id="reset-email" className="auth-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="请输入邮箱地址" />
              </div>
              {errorMsg ? <p className="text-sm text-red-500">{errorMsg}</p> : null}
              {successMsg ? <p className="text-sm text-emerald-600">{successMsg}</p> : null}
              <div className="auth-actions">
                <button className="btn w-full" type="submit" disabled={loading}>{loading ? "提交中..." : "提交"}</button>
              </div>
            </form>
            <div className="mt-6 text-center text-sm">
              <Link className="text-blue-600" href="/login">返回登录</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
