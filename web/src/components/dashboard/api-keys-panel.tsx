"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TokenItem = {
  id: number;
  key?: string;
  name?: string;
  status?: number;
  unlimited_quota?: boolean;
  remain_quota?: number;
  expired_time?: number;
};

function renderQuota(value: number): string {
  const quotaPerUnit = Number(localStorage.getItem("quota_per_unit") || "500000");
  const usd =
    value /
    (Number.isFinite(quotaPerUnit) && quotaPerUnit > 0 ? quotaPerUnit : 500000);
  if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
  return `$${usd.toFixed(2)}`;
}

function formatDate(ts?: number) {
  if (ts === -1 || !ts) return "不过期";
  const date = new Date(ts * 1000);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function usdToQuota(usd: number): number {
  const quotaPerUnit = Number(localStorage.getItem("quota_per_unit") || "500000");
  const valid = Number.isFinite(quotaPerUnit) && quotaPerUnit > 0 ? quotaPerUnit : 500000;
  return Math.round(usd * valid);
}

function maskedKeyLabel(token: TokenItem): string {
  const key = String(token.key || "").trim();
  if (!key) return "—";
  return key.startsWith("sk-") ? key : `sk-${key}`;
}

const EXPIRATION_OPTIONS = [
  { value: "never", label: "永不过期" },
  { value: "1h", label: "1 小时" },
  { value: "1d", label: "1 天" },
  { value: "1m", label: "1 个月" },
] as const;

function buildExpiredTime(option: string): number {
  const now = Math.floor(Date.now() / 1000);
  if (option === "1h") return now + 3600;
  if (option === "1d") return now + 86400;
  if (option === "1m") return now + 30 * 86400;
  return -1;
}

export function ApiKeysPanel() {
  const { showError, showSuccess } = useToast();
  const showErrorRef = useRef(showError);
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState({
    name: "",
    remain_quota: "",
    expired_time: "never",
  });
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    showErrorRef.current = showError;
  }, [showError]);

  const loadTokens = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet("/api/token?p=1&size=100");
      if (!res?.success) {
        showErrorRef.current(res?.message || "加载密钥失败");
        return;
      }
      const data = Array.isArray(res.data) ? res.data : res.data?.items || [];
      setTokens(data);
    } catch {
      showErrorRef.current("加载密钥失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTokens();
  }, [loadTokens]);

  async function createToken() {
    if (!form.name.trim()) {
      showError("请输入密钥名称");
      return;
    }
    const rawRemain = String(form.remain_quota || "").trim();
    const unlimited = rawRemain === "";
    let remainQuota = 0;
    if (!unlimited) {
      const usd = parseFloat(rawRemain);
      if (!Number.isFinite(usd) || usd < 0) {
        showError("额度上限金额无效");
        return;
      }
      remainQuota = usdToQuota(usd);
    }

    setCreating(true);
    try {
      const res = await apiPost("/api/token", {
        name: form.name.trim(),
        unlimited_quota: unlimited,
        remain_quota: remainQuota,
        expired_time: buildExpiredTime(form.expired_time),
      });
      if (res?.success) {
        setForm({ name: "", remain_quota: "", expired_time: "never" });
        setShowCreateDialog(false);
        showSuccess("密钥创建成功");
        await loadTokens();
      } else {
        showError(res?.message || "创建失败");
      }
    } finally {
      setCreating(false);
    }
  }

  async function copyTokenKey(id: number) {
    const res = await apiPost(`/api/token/${id}/key`, {});
    const key = res?.data?.key ? `sk-${res.data.key}` : "";
    if (!res?.success || !key) {
      showError(res?.message || "获取密钥失败");
      return;
    }
    await navigator.clipboard.writeText(key);
    showSuccess("密钥已复制");
  }

  async function removeToken(id: number) {
    setDeleting(true);
    const res = await apiDelete(`/api/token/${id}`);
    setDeleting(false);
    if (!res?.success) {
      showError(res?.message || "删除失败");
      return;
    }
    showSuccess("密钥已删除");
    await loadTokens();
  }

  return (
    <>
      <section className="panel w-full min-w-0">
        <div className="panel-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="panel-title">API 密钥</h2>
          <div className="flex flex-wrap items-center justify-end gap-2 sm:ml-auto">
            <Button variant="outline" size="sm" onClick={() => void loadTokens()} disabled={loading}>
              {loading ? "刷新中..." : "刷新"}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setForm({ name: "", remain_quota: "", expired_time: "never" });
                setShowCreateDialog(true);
              }}
            >
              添加令牌
            </Button>
          </div>
        </div>
        <div className="panel-body">
          {loading ? (
            <div className="text-sm opacity-70">加载中...</div>
          ) : tokens.length === 0 ? (
            <div className="text-sm opacity-70">暂无令牌数据</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>密钥</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>剩余额度</TableHead>
                  <TableHead>过期时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map((token) => (
                  <TableRow key={token.id} className={token.status !== 1 ? "opacity-70" : ""}>
                    <TableCell className="max-w-[min(100%,18rem)] font-mono text-xs whitespace-normal break-all text-muted-foreground">
                      {maskedKeyLabel(token)}
                    </TableCell>
                    <TableCell>{token.name || "-"}</TableCell>
                    <TableCell>{token.status === 1 ? "启用" : "禁用"}</TableCell>
                    <TableCell>{token.unlimited_quota ? "无限制" : renderQuota(token.remain_quota ?? 0)}</TableCell>
                    <TableCell>{formatDate(token.expired_time)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void copyTokenKey(token.id)}
                        >
                          复制
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            setPendingDeleteId(token.id);
                            setShowDeleteDialog(true);
                          }}
                        >
                          删除
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>创建密钥</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="auth-label" htmlFor="dash-token-name">
                名称
              </label>
              <Input
                id="dash-token-name"
                type="text"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="请输入密钥名称，例如「聊天机器人」"
              />
            </div>
            <div>
              <label className="auth-label" htmlFor="dash-token-quota">
                额度上限（美元，可选）
              </label>
              <Input
                id="dash-token-quota"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={form.remain_quota}
                onChange={(event) => setForm((prev) => ({ ...prev, remain_quota: event.target.value }))}
                placeholder="留空表示不限制"
              />
            </div>
            <div>
              <span className="auth-label mb-1 block">过期时间</span>
              <Select
                value={form.expired_time}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, expired_time: value || "never" }))
                }
              >
                <SelectTrigger id="dash-token-expire" className="w-full min-w-0 max-w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPIRATION_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" type="button" onClick={() => setShowCreateDialog(false)}>
              取消
            </Button>
            <Button type="button" disabled={creating} onClick={() => void createToken()}>
              {creating ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open);
          if (!open) setPendingDeleteId(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>删除密钥</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">确定删除这个密钥吗？此操作不可恢复。</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={deleting || pendingDeleteId == null}
              onClick={() => {
                if (pendingDeleteId != null) void removeToken(pendingDeleteId);
              }}
            >
              {deleting ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
