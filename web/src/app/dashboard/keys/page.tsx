"use client";

import { ApiKeysPanel } from "@/components/dashboard/api-keys-panel";

export default function KeysPage() {
  return (
    <div className="page-wrap w-full min-w-0 space-y-5 pb-2">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">API 密钥</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          创建并管理用于调用 API 的访问令牌，注意妥善保管。
        </p>
      </div>
      <ApiKeysPanel />
    </div>
  );
}
