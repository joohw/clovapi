"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiGet, apiPost } from "@/lib/api";

const authFieldLabelClass = "mb-1 block text-[0.85rem] text-zinc-500";
const authFieldInputClass =
  "w-full min-h-10 rounded-sm border border-border bg-transparent px-3 py-2 text-sm text-foreground";

export default function SetupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const res = await apiGet("/api/setup");
        if (res?.success && res?.data?.status) {
          router.replace("/");
          return;
        }
      } finally {
        setChecking(false);
      }
    };
    void checkSetup();
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    if (!username || !password || !confirmPassword) {
      setErrorMsg("请完整填写管理员账号和密码");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("两次输入的密码不一致");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("密码长度至少为 8 位");
      return;
    }

    setLoading(true);
    try {
      const res = await apiPost("/api/setup", {
        username,
        password,
        confirmPassword,
        SelfUseModeEnabled: true,
        DemoSiteEnabled: false,
      });
      if (res?.success) {
        setSuccessMsg("初始化成功，请使用新管理员账号登录");
        window.setTimeout(() => router.replace("/login"), 600);
      } else {
        setErrorMsg(res?.message || "初始化失败");
      }
    } catch {
      setErrorMsg("初始化失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <h1 className="pb-4 text-center text-[1.4rem]">系统初始化</h1>
        {checking ? (
          <p className="text-sm text-zinc-500">正在检查初始化状态...</p>
        ) : (
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div>
              <label className={authFieldLabelClass} htmlFor="setup-username">管理员账号</label>
              <input id="setup-username" className={authFieldInputClass} type="text" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="请输入管理员用户名" />
            </div>
            <div>
              <label className={authFieldLabelClass} htmlFor="setup-password">管理员密码</label>
              <input id="setup-password" className={authFieldInputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="请输入管理员密码（至少8位）" />
            </div>
            <div>
              <label className={authFieldLabelClass} htmlFor="setup-password2">确认密码</label>
              <input id="setup-password2" className={authFieldInputClass} type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="请再次输入管理员密码" />
            </div>
            {errorMsg ? <p className="text-sm text-red-500">{errorMsg}</p> : null}
            {successMsg ? <p className="text-sm text-emerald-600">{successMsg}</p> : null}
            <div className="pt-1">
              <button className="btn w-full" type="submit" disabled={loading}>{loading ? "初始化中..." : "完成初始化"}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
