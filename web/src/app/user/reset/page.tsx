"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { apiPost } from "@/lib/api";

const authFieldLabelClass = "mb-1 block text-[0.85rem] text-zinc-500";
const authFieldInputClass =
  "w-full min-h-10 rounded-sm border border-border bg-transparent px-3 py-2 text-sm text-foreground";

export default function UserResetPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const email = useMemo(() => searchParams.get("email") || "", [searchParams]);
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const isValidLink = Boolean(email && token);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg("");
    if (!isValidLink) {
      setErrorMsg("无效的重置链接，请重新发起密码重置请求");
      return;
    }
    setLoading(true);
    try {
      const res = await apiPost("/api/user/reset", { email, token });
      if (res?.success) {
        const pwd = String(res?.data || "");
        setNewPassword(pwd);
        if (pwd) await navigator.clipboard.writeText(pwd);
      } else {
        setErrorMsg(res?.message || "重置失败");
      }
    } catch {
      setErrorMsg("重置失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <h1 className="pb-4 text-center text-[1.4rem]">密码重置确认</h1>
        {!isValidLink ? <p className="mb-4 text-sm text-red-500">无效的重置链接，请重新发起密码重置请求</p> : null}
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className={authFieldLabelClass} htmlFor="reset-confirm-email">邮箱</label>
            <input id="reset-confirm-email" className={authFieldInputClass} type="email" value={email} disabled />
          </div>
          {newPassword ? (
            <div>
              <label className={authFieldLabelClass} htmlFor="reset-confirm-password">新密码</label>
              <div className="flex items-center gap-2">
                <input id="reset-confirm-password" className={authFieldInputClass} type="text" value={newPassword} readOnly />
                <button className="btn btn-outline" type="button" onClick={() => void navigator.clipboard.writeText(newPassword)}>
                  复制
                </button>
              </div>
            </div>
          ) : null}
          {errorMsg ? <p className="text-sm text-red-500">{errorMsg}</p> : null}
          <div className="pt-1">
            <button className="btn w-full" type="submit" disabled={loading || !!newPassword || !isValidLink}>
              {newPassword ? "密码重置完成" : loading ? "处理中..." : "确认重置密码"}
            </button>
          </div>
        </form>
        <div className="mt-6 text-center text-sm">
          <Link className="text-accent transition-colors hover:text-foreground" href="/login">返回登录</Link>
        </div>
      </div>
    </div>
  );
}
