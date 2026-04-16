"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiGet } from "@/lib/api";
import { getStoredUser, isAdminUser, setStoredUser } from "@/lib/auth";

export function UserGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    setReady(true);
  }, [pathname, router]);

  if (!ready) return <div className="page-wrap text-sm text-zinc-500">加载中...</div>;
  return <>{children}</>;
}

export function AdminGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.replace("/login?redirect=/admin");
      return;
    }
    const verify = async () => {
      try {
        const res = await apiGet("/api/user/self");
        if (res?.success && res.data) setStoredUser(res.data);
      } catch {
        // keep local user fallback
      }
      const latest = getStoredUser();
      if (!isAdminUser(latest)) {
        router.replace("/dashboard");
        return;
      }
      setReady(true);
    };
    void verify();
  }, [router]);

  if (!ready) return <div className="page-wrap text-sm text-zinc-500">校验权限中...</div>;
  return <>{children}</>;
}
