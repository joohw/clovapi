"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { apiGet } from "@/lib/api";

const authFieldLabelClass = "mb-1 block text-[0.85rem] text-zinc-500";
const authFieldInputClass =
  "w-full min-h-10 rounded-sm border border-border bg-transparent px-3 py-2 text-sm text-foreground";

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
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <h1 className="pb-4 text-center text-[1.4rem]">密码重置</h1>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div>
            <label className={authFieldLabelClass} htmlFor="reset-email">邮箱</label>
            <input id="reset-email" className={authFieldInputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="请输入邮箱地址" />
          </div>
          {errorMsg ? <p className="text-sm text-red-500">{errorMsg}</p> : null}
          {successMsg ? <p className="text-sm text-emerald-600">{successMsg}</p> : null}
          <div className="pt-1">
            <button className="btn w-full" type="submit" disabled={loading}>{loading ? "提交中..." : "提交"}</button>
          </div>
        </form>
        <div className="mt-6 text-center text-sm">
          <Link className="text-accent transition-colors hover:text-foreground" href="/login">返回登录</Link>
        </div>
      </div>
    </div>
  );
}
