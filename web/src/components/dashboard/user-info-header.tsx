"use client";

import { useEffect, useState } from "react";
import { BarChart3, Coins, Copy, Gift, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiGet, apiPost } from "@/lib/api";
import { useToast } from "@/components/ui/toast-provider";

type UserInfoHeaderProps = {
  user: Record<string, any> | null;
  status: Record<string, any>;
  onRefreshUser: () => Promise<void> | void;
};

function renderQuota(value: number): string {
  const quotaPerUnit = Number(localStorage.getItem("quota_per_unit") || "500000");
  const valid = Number.isFinite(quotaPerUnit) && quotaPerUnit > 0 ? quotaPerUnit : 500000;
  const usd = Number(value || 0) / valid;
  if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
  return `$${usd.toFixed(2)}`;
}

export function UserInfoHeader({ user, status, onRefreshUser }: UserInfoHeaderProps) {
  const { showError, showSuccess } = useToast();
  const [showRedeemDialog, setShowRedeemDialog] = useState(false);
  const [showPayDialog, setShowPayDialog] = useState(false);
  const [redemptionCode, setRedemptionCode] = useState("");
  const [redeemSubmitting, setRedeemSubmitting] = useState(false);
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [topupCount, setTopupCount] = useState(1);
  const [minTopup, setMinTopup] = useState(1);
  const [payMethods, setPayMethods] = useState<Array<{ name: string; type: string }>>([]);
  const [selectedPayMethod, setSelectedPayMethod] = useState("");
  const [affLink, setAffLink] = useState("");
  const [affLoading, setAffLoading] = useState(false);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    const loadAffLink = async () => {
      setAffLoading(true);
      try {
        const res = await apiGet("/api/user/aff");
        if (res?.success && res.data != null && res.data !== "") {
          const code = String(res.data);
          setAffLink(
            `${window.location.origin}/register?aff=${encodeURIComponent(code)}`,
          );
        } else if (res?.message) {
          showError(res.message);
        }
      } finally {
        setAffLoading(false);
      }
    };
    void loadAffLink();
  }, [userId, showError]);

  async function copyAffLink() {
    if (!affLink) {
      showError("邀请链接未就绪");
      return;
    }
    await navigator.clipboard.writeText(affLink);
    showSuccess("邀请链接已复制到剪贴板");
  }

  async function submitRedeem() {
    if (!redemptionCode.trim()) {
      showError("请输入兑换码");
      return;
    }
    setRedeemSubmitting(true);
    try {
      const res = await apiPost("/api/user/topup", { key: redemptionCode.trim() });
      if (!res?.success) {
        showError(res?.message || "兑换失败");
        return;
      }
      showSuccess(`兑换成功！获得额度：${renderQuota(Number(res.data || 0))}`);
      setRedemptionCode("");
      setShowRedeemDialog(false);
      await onRefreshUser();
    } finally {
      setRedeemSubmitting(false);
    }
  }

  async function openOnlineTopupDialog() {
    try {
      const res = await apiGet("/api/user/topup/info");
      if (!res?.success || !res.data) {
        showError(res?.message || "加载充值配置失败");
        return;
      }
      if (!res.data.enable_online_topup) {
        showError("管理员未开启在线充值");
        return;
      }
      const methods = Array.isArray(res.data.pay_methods)
        ? res.data.pay_methods.filter((m: any) => m?.name && m?.type)
        : [];
      setPayMethods(methods);
      const min = Number(res.data.min_topup) > 0 ? Number(res.data.min_topup) : 1;
      setMinTopup(min);
      setTopupCount(min);
      setSelectedPayMethod(methods[0]?.type || "alipay");
      setShowPayDialog(true);
    } catch {
      showError("加载充值配置失败");
    }
  }

  async function submitPay() {
    const amount = Number(topupCount);
    if (!Number.isFinite(amount) || amount < minTopup) {
      showError(`充值数量不能小于 ${minTopup}`);
      return;
    }
    if (!selectedPayMethod) {
      showError("请选择支付方式");
      return;
    }
    setPaySubmitting(true);
    try {
      const res = await apiPost("/api/user/pay", {
        amount: Math.floor(amount),
        payment_method: selectedPayMethod,
      });
      if (res?.message !== "success") {
        showError(res?.data || res?.message || "拉起支付失败");
        return;
      }
      const params = res?.data;
      const url = res?.url;
      if (!url || !params || typeof params !== "object") {
        showError("支付参数无效");
        return;
      }
      const form = document.createElement("form");
      form.action = url;
      form.method = "POST";
      form.target = "_blank";
      for (const key of Object.keys(params)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(params[key] ?? "");
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);
      setShowPayDialog(false);
    } finally {
      setPaySubmitting(false);
    }
  }

  return (
    <>
      <section className="panel w-full min-w-0">
        <div className="panel-body">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-end gap-3">
                <div className="text-2xl font-bold tracking-wide sm:text-3xl md:text-4xl">
                  {renderQuota(Number(user?.quota || 0))}
                </div>
                <Button variant="outline" className="shrink-0" onClick={() => setShowRedeemDialog(true)}>
                  兑换
                </Button>
                <Button className="shrink-0" onClick={() => void openOnlineTopupDialog()}>
                  充值
                </Button>
              </div>
            </div>
            <div className="hidden shrink-0 lg:block">
              <div className="rounded-xl border border-gray-200 bg-muted/30 px-4 py-3 dark:border-zinc-600">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4" />
                    <span>历史消耗</span>
                    <span className="font-semibold text-foreground">{renderQuota(Number(user?.used_quota || 0))}</span>
                  </div>
                  <span className="text-border">|</span>
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    <span>请求次数</span>
                    <span className="font-semibold text-foreground">{user?.request_count ?? 0}</span>
                  </div>
                  <span className="text-border">|</span>
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>用户分组</span>
                    <span className="font-semibold text-foreground">{user?.group || "默认"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-border bg-muted/20 p-4 dark:bg-muted/10">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-300">
                <Gift className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">邀请奖励</div>
                <div className="text-xs text-muted-foreground">邀请好友注册，对方充值后奖励将直接到账户余额</div>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input readOnly className="flex-1 font-mono text-xs" value={affLoading ? "加载中…" : affLink || "—"} />
              <div className="flex shrink-0 flex-wrap gap-2 sm:h-8 sm:items-center">
                <Button variant="outline" className="h-8 gap-1.5" onClick={() => void copyAffLink()} disabled={affLoading || !affLink}>
                  <Copy className="h-4 w-4" />
                  复制链接
                </Button>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2">
                <div className="mb-0.5 flex items-center gap-1 text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  邀请人数
                </div>
                <div className="font-semibold tabular-nums">{user?.aff_count ?? 0}</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-background/80 px-3 py-2">
                <div className="mb-0.5 flex items-center gap-1 text-muted-foreground">
                  <BarChart3 className="h-3.5 w-3.5" />
                  累计收益
                </div>
                <div className="font-semibold tabular-nums">{renderQuota(Number(user?.aff_history_quota || 0))}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 lg:hidden">
            <div className="rounded-xl border border-gray-200 bg-muted/30 p-3 dark:border-zinc-600">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Coins className="h-4 w-4" />
                    <span>历史消耗</span>
                  </div>
                  <span className="font-semibold">{renderQuota(Number(user?.used_quota || 0))}</span>
                </div>
                <div className="border-t border-dashed border-border"></div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <BarChart3 className="h-4 w-4" />
                    <span>请求次数</span>
                  </div>
                  <span className="font-semibold">{user?.request_count ?? 0}</span>
                </div>
                <div className="border-t border-dashed border-border"></div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>用户分组</span>
                  </div>
                  <span className="font-semibold">{user?.group || "默认"}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Dialog open={showRedeemDialog} onOpenChange={setShowRedeemDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>兑换</DialogTitle>
            <DialogDescription>输入兑换码将额度充入当前账户。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="auth-label" htmlFor="redeem-code">兑换码</label>
              <Input id="redeem-code" value={redemptionCode} onChange={(event) => setRedemptionCode(event.target.value)} placeholder="输入兑换码" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRedeemDialog(false)}>取消</Button>
            <Button disabled={redeemSubmitting} onClick={() => void submitRedeem()}>
              {redeemSubmitting ? "提交中…" : "确认兑换"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPayDialog} onOpenChange={setShowPayDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>在线充值</DialogTitle>
            <DialogDescription>通过易支付完成付款：请输入充值数额并选择下方支付方式。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="auth-label" htmlFor="topup-count">充值金额</label>
              <Input
                id="topup-count"
                type="number"
                value={String(topupCount)}
                onChange={(event) => setTopupCount(Number(event.target.value || 0))}
                min={minTopup}
                step={1}
                placeholder={`不少于 ${minTopup}`}
                className="font-mono [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <p className="mt-1 text-xs text-muted-foreground">数额含义与后台「额度展示」设置一致（如美元或人民币等）。</p>
            </div>
            <div>
              <div className="auth-label">支付方式</div>
              <div className="flex flex-wrap gap-2">
                {payMethods.length > 0 ? (
                  payMethods.map((method) => (
                    <Button
                      key={method.type}
                      type="button"
                      size="sm"
                      variant={selectedPayMethod === method.type ? "default" : "outline"}
                      onClick={() => setSelectedPayMethod(method.type)}
                    >
                      {method.name}
                    </Button>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">暂无可用支付方式</span>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPayDialog(false)}>取消</Button>
            <Button disabled={paySubmitting || payMethods.length === 0} onClick={() => void submitPay()}>
              {paySubmitting ? "拉起中…" : "确认支付"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
