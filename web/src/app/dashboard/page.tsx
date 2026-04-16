"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiKeysPanel } from "@/components/dashboard/api-keys-panel";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { getStoredUser, setStoredUser } from "@/lib/auth";
import { useToast } from "@/components/ui/toast-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserInfoHeader } from "@/components/dashboard/user-info-header";

export default function DashboardPage() {
  const { showError, showSuccess } = useToast();
  const [user, setUser] = useState<Record<string, any> | null>(null);
  const [status, setStatus] = useState<Record<string, any>>({});
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [notificationSettings, setNotificationSettings] = useState({
    warningType: "email",
    warningThreshold: "",
    webhookUrl: "",
    webhookSecret: "",
    notificationEmail: "",
    barkUrl: "",
    gotifyUrl: "",
    gotifyToken: "",
    gotifyPriority: 5,
    upstreamModelUpdateNotifyEnabled: false,
    acceptUnsetModelRatioModel: false,
    recordIpLog: false,
  });
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinSubmitting, setCheckinSubmitting] = useState(false);
  const [checkinCollapsed, setCheckinCollapsed] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  const [checkinData, setCheckinData] = useState<{
    enabled?: boolean;
    stats?: {
      checked_in_today?: boolean;
      total_checkins?: number;
      total_quota?: number;
      records?: Array<{ checkin_date: string; quota_awarded: number }>;
    };
  }>({});

  const currentMonth = useMemo(
    () =>
      `${viewDate.getFullYear()}-${String(viewDate.getMonth() + 1).padStart(2, "0")}`,
    [viewDate],
  );

  const checkinRecordMap = useMemo(() => {
    const map: Record<string, number> = {};
    const records = checkinData.stats?.records || [];
    for (const record of records) {
      map[record.checkin_date] = record.quota_awarded || 0;
    }
    return map;
  }, [checkinData]);

  const monthlyQuota = useMemo(
    () =>
      (checkinData.stats?.records || []).reduce(
        (sum, record) => sum + (record.quota_awarded || 0),
        0,
      ),
    [checkinData],
  );

  function quotaToDisplayInputString(quota: unknown): string {
    const q = Number(quota || 0);
    if (!Number.isFinite(q) || q <= 0) return "";
    const quotaPerUnit = Number(localStorage.getItem("quota_per_unit") || "500000");
    const usd = q / (Number.isFinite(quotaPerUnit) && quotaPerUnit > 0 ? quotaPerUnit : 500000);
    return usd.toFixed(8).replace(/\.?0+$/, "");
  }

  function displayAmountToQuota(amount: number): number {
    const quotaPerUnit = Number(localStorage.getItem("quota_per_unit") || "500000");
    const valid = Number.isFinite(quotaPerUnit) && quotaPerUnit > 0 ? quotaPerUnit : 500000;
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return Math.round(amount * valid);
  }

  const applyNotificationFromUserSetting = useCallback(
    (targetUser: Record<string, any>) => {
      const raw = targetUser?.setting;
      if (!raw) return;
      try {
        const settings = typeof raw === "string" ? JSON.parse(raw) : raw;
        setNotificationSettings({
          warningType: settings.notify_type || "email",
          warningThreshold: quotaToDisplayInputString(
            settings.quota_warning_threshold ?? 500000,
          ),
          webhookUrl: settings.webhook_url || "",
          webhookSecret: settings.webhook_secret || "",
          notificationEmail: settings.notification_email || "",
          barkUrl: settings.bark_url || "",
          gotifyUrl: settings.gotify_url || "",
          gotifyToken: settings.gotify_token || "",
          gotifyPriority:
            settings.gotify_priority !== undefined
              ? Number(settings.gotify_priority)
              : 5,
          upstreamModelUpdateNotifyEnabled:
            settings.upstream_model_update_notify_enabled === true,
          acceptUnsetModelRatioModel: settings.accept_unset_model_ratio_model || false,
          recordIpLog: settings.record_ip_log || false,
        });
      } catch {
        // ignore invalid user setting payload
      }
    },
    [],
  );

  useEffect(() => {
    const init = async () => {
      const localUser = getStoredUser();
      if (localUser) {
        setUser(localUser as Record<string, any>);
        applyNotificationFromUserSetting(localUser as Record<string, any>);
      }
      try {
        const [statusRes, userRes] = await Promise.all([
          apiGet("/api/status"),
          apiGet("/api/user/self"),
        ]);
        if (statusRes?.success && statusRes.data) {
          setStatus(statusRes.data);
          localStorage.setItem("status", JSON.stringify(statusRes.data));
          localStorage.setItem("quota_per_unit", String(statusRes.data.quota_per_unit || 500000));
        }
        if (userRes?.success && userRes.data) {
          setUser(userRes.data);
          setStoredUser(userRes.data);
          applyNotificationFromUserSetting(userRes.data);
        }
      } catch {
        showError("加载用户信息失败");
      }
    };
    void init();
  }, [showError, applyNotificationFromUserSetting]);

  useEffect(() => {
    if (!status?.checkin_enabled) return;
    const loadCheckin = async () => {
      setCheckinLoading(true);
      try {
        const res = await apiGet(`/api/user/checkin?month=${encodeURIComponent(currentMonth)}`);
        if (res?.success) {
          setCheckinData(res.data || {});
          setCheckinCollapsed(Boolean(res?.data?.stats?.checked_in_today));
        } else {
          showError(res?.message || "获取签到状态失败");
        }
      } finally {
        setCheckinLoading(false);
      }
    };
    void loadCheckin();
  }, [status?.checkin_enabled, currentMonth, showError]);

  function renderQuota(quota: number): string {
    const quotaPerUnit = Number(localStorage.getItem("quota_per_unit") || "500000");
    const valid = Number.isFinite(quotaPerUnit) && quotaPerUnit > 0 ? quotaPerUnit : 500000;
    const usd = Number(quota || 0) / valid;
    if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
    return `$${usd.toFixed(2)}`;
  }

  function buildMonthGrid(date: Date) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const first = new Date(year, month, 1);
    const startPad = first.getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ day: number; dateStr: string } | null> = [];
    for (let i = 0; i < startPad; i += 1) cells.push(null);
    for (let day = 1; day <= lastDay; day += 1) {
      cells.push({
        day,
        dateStr: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }

  const monthCells = useMemo(() => buildMonthGrid(viewDate), [viewDate]);

  async function doCheckin() {
    setCheckinSubmitting(true);
    try {
      const res = await apiPost("/api/user/checkin", {});
      if (res?.success) {
        showSuccess(`签到成功！获得 ${renderQuota(Number(res?.data?.quota_awarded || 0))}`);
        const refresh = await apiGet(`/api/user/checkin?month=${encodeURIComponent(currentMonth)}`);
        if (refresh?.success) setCheckinData(refresh.data || {});
      } else {
        showError(res?.message || "签到失败");
      }
    } finally {
      setCheckinSubmitting(false);
    }
  }

  function getWarningThresholdQuota(
    settings: typeof notificationSettings,
    strict: boolean,
  ): number | null {
    const parsed = parseFloat(String(settings.warningThreshold));
    const fromInput = displayAmountToQuota(parsed);
    if (fromInput > 0) return fromInput;

    if (strict) {
      showError("预警价格必须大于0");
      return null;
    }

    try {
      const raw = user?.setting;
      if (raw) {
        const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
        const current = Number(obj?.quota_warning_threshold || 0);
        if (Number.isFinite(current) && current > 0) return current;
      }
    } catch {
      // ignore parsing failure and use default
    }

    return 500000;
  }

  async function persistNotificationSettings(
    settings: typeof notificationSettings,
    successMessage = "设置保存成功",
    options?: { strictThreshold?: boolean },
  ): Promise<boolean> {
    const strictThreshold = options?.strictThreshold ?? true;
    const quotaWarningThreshold = getWarningThresholdQuota(settings, strictThreshold);
    if (quotaWarningThreshold == null) return false;

    try {
      const res = await apiPut("/api/user/setting", {
        notify_type: "email",
        quota_warning_threshold: quotaWarningThreshold,
        notification_email: settings.notificationEmail,
        upstream_model_update_notify_enabled:
          settings.upstreamModelUpdateNotifyEnabled === true,
        accept_unset_model_ratio_model:
          settings.acceptUnsetModelRatioModel === true,
        record_ip_log: settings.recordIpLog === true,
      });
      if (!res?.success) {
        showError(res?.message || "保存失败");
        return false;
      }
      showSuccess(successMessage);
      return true;
    } catch {
      showError("设置保存失败");
      return false;
    }
  }

  async function saveNotificationSettings() {
    await persistNotificationSettings(notificationSettings);
  }

  async function saveToggleSetting(
    patch: Partial<typeof notificationSettings>,
    successMessage: string,
  ) {
    const prevSettings = notificationSettings;
    const nextSettings = { ...prevSettings, ...patch };
    setNotificationSettings(nextSettings);
    const ok = await persistNotificationSettings(nextSettings, successMessage, {
      strictThreshold: false,
    });
    if (!ok) {
      setNotificationSettings(prevSettings);
    }
  }

  async function deleteAccount() {
    if (deleteConfirmText !== user?.username) {
      showError("请输入你的账户名以确认删除");
      return;
    }
    const res = await apiDelete("/api/user/self");
    if (!res?.success) {
      showError(res?.message || "删除失败");
      return;
    }
    showSuccess("账户已删除");
    await apiGet("/api/user/logout");
    localStorage.removeItem("user");
    window.location.assign("/");
  }

  return (
    <div className="page-wrap space-y-4 w-full min-w-0">
      <UserInfoHeader user={user} status={status} onRefreshUser={async () => {
        const res = await apiGet("/api/user/self");
        if (res?.success && res.data) {
          setUser(res.data);
          setStoredUser(res.data);
          applyNotificationFromUserSetting(res.data);
        }
      }} />

      {status?.checkin_enabled ? (
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">签到日历</h2>
            <button
              type="button"
              className="btn btn-outline btn-xs"
              onClick={() => setCheckinCollapsed((prev) => !prev)}
            >
              {checkinCollapsed ? "展开" : "收起"}
            </button>
          </div>
          <div className="panel-body">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-zinc-500">
                {checkinData.stats?.checked_in_today
                  ? `今日已签到，累计 ${Number(checkinData.stats?.total_checkins || 0)} 天`
                  : "每日签到可获得随机额度奖励"}
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => void doCheckin()}
                disabled={checkinSubmitting || checkinLoading || !!checkinData.stats?.checked_in_today}
              >
                {checkinSubmitting
                  ? "签到中..."
                  : checkinData.stats?.checked_in_today
                    ? "今日已签到"
                    : "立即签到"}
              </button>
            </div>
            {!checkinCollapsed ? (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="border border-border bg-zinc-100/40 p-2.5 text-center dark:bg-zinc-900/50">
                    <div className="text-xl font-bold">{Number(checkinData.stats?.total_checkins || 0)}</div>
                    <div className="text-xs text-zinc-500">累计签到</div>
                  </div>
                  <div className="border border-border bg-zinc-100/40 p-2.5 text-center dark:bg-zinc-900/50">
                    <div className="text-xl font-bold">{renderQuota(monthlyQuota)}</div>
                    <div className="text-xs text-zinc-500">本月获得</div>
                  </div>
                  <div className="border border-border bg-zinc-100/40 p-2.5 text-center dark:bg-zinc-900/50">
                    <div className="text-xl font-bold">{renderQuota(Number(checkinData.stats?.total_quota || 0))}</div>
                    <div className="text-xs text-zinc-500">累计获得</div>
                  </div>
                </div>
                <div className="border border-border">
                  <div className="flex items-center justify-between border-b border-border bg-zinc-100/40 px-3 py-2 text-sm dark:bg-zinc-900/50">
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(viewDate);
                        d.setMonth(d.getMonth() - 1);
                        setViewDate(d);
                      }}
                    >
                      ←
                    </button>
                    <span>{viewDate.getFullYear()} 年 {viewDate.getMonth() + 1} 月</span>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date(viewDate);
                        d.setMonth(d.getMonth() + 1);
                        setViewDate(d);
                      }}
                    >
                      →
                    </button>
                  </div>
                  {checkinLoading ? (
                    <div className="p-6 text-center text-sm text-zinc-500">加载中...</div>
                  ) : (
                    <div className="grid grid-cols-7 gap-px bg-border p-1 text-center text-[11px]">
                      {["日", "一", "二", "三", "四", "五", "六"].map((week) => (
                        <div key={week} className="bg-zinc-100/60 py-1 font-medium text-zinc-500 dark:bg-zinc-900/60">
                          {week}
                        </div>
                      ))}
                      {monthCells.map((cell, index) =>
                        cell ? (
                          <div
                            key={`${cell.dateStr}-${index}`}
                            className="relative min-h-[52px] border border-transparent bg-background p-0.5 text-left"
                            title={
                              checkinRecordMap[cell.dateStr] != null
                                ? `获得 ${renderQuota(checkinRecordMap[cell.dateStr])}`
                                : ""
                            }
                          >
                            <span className="absolute left-1 top-0.5 text-[11px] text-zinc-500">{cell.day}</span>
                            {checkinRecordMap[cell.dateStr] != null ? (
                              <div className="flex h-full flex-col items-center justify-center pt-3">
                                <div className="mb-0.5 flex h-6 w-6 items-center justify-center border border-border bg-emerald-600 text-white">
                                  ✓
                                </div>
                                <div className="text-[10px] font-medium leading-none text-emerald-600 dark:text-emerald-400">
                                  {renderQuota(checkinRecordMap[cell.dateStr])}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div key={`empty-${index}`} className="min-h-[52px] bg-background"></div>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <ApiKeysPanel />

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">控制台设置</h2>
        </div>
        <div className="panel-body space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">通知配置</h3>
            <p className="text-xs text-zinc-500">通知方式：仅邮件通知</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <Input
                placeholder="额度预警阈值（显示货币）"
                value={notificationSettings.warningThreshold}
                onChange={(event) =>
                  setNotificationSettings((prev) => ({
                    ...prev,
                    warningThreshold: event.target.value,
                  }))
                }
              />
              <Input
                placeholder="通知邮箱"
                value={notificationSettings.notificationEmail}
                onChange={(event) =>
                  setNotificationSettings((prev) => ({
                    ...prev,
                    notificationEmail: event.target.value,
                  }))
                }
              />
            </div>
            <Label className="inline-flex items-center gap-2 text-sm">
              <Checkbox
                checked={notificationSettings.upstreamModelUpdateNotifyEnabled}
                onCheckedChange={(checked) =>
                  setNotificationSettings((prev) => ({
                    ...prev,
                    upstreamModelUpdateNotifyEnabled: Boolean(checked),
                  }))
                }
              />
              上游模型更新通知
            </Label>
            <div className="flex justify-end">
              <Button type="button" onClick={() => void saveNotificationSettings()}>
                保存通知配置
              </Button>
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">价格设置</h3>
            <div className="flex items-start justify-between gap-3 border border-border p-3">
              <div>
                <p className="text-sm font-medium">接受未设置价格模型</p>
                <p className="text-xs text-zinc-500">
                  当模型没有设置价格时仍接受调用，仅在信任站点时启用。
                </p>
              </div>
              <Switch
                checked={notificationSettings.acceptUnsetModelRatioModel}
                onCheckedChange={(checked) =>
                  void saveToggleSetting(
                    { acceptUnsetModelRatioModel: Boolean(checked) },
                    "价格设置已保存",
                  )
                }
              />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">隐私设置</h3>
            <div className="flex items-start justify-between gap-3 border border-border p-3">
              <div>
                <p className="text-sm font-medium">记录请求与错误日志 IP</p>
                <p className="text-xs text-zinc-500">
                  切换后立即保存，无需再点击保存按钮。
                </p>
              </div>
              <Switch
                checked={notificationSettings.recordIpLog}
                onCheckedChange={(checked) =>
                  void saveToggleSetting(
                    { recordIpLog: Boolean(checked) },
                    "隐私设置已保存",
                  )
                }
              />
            </div>
          </section>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">安全设置</h2>
        </div>
        <div className="panel-body space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" onClick={() => setShowDeleteModal(true)}>
              删除账户
            </Button>
          </div>
        </div>
      </section>

      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>删除账户确认</DialogTitle>
            <DialogDescription className="text-red-500">
              您正在删除自己的账户，此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label>请输入用户名以确认删除</Label>
            <Input
              value={deleteConfirmText}
              onChange={(event) => setDeleteConfirmText(event.target.value)}
              placeholder={`输入 ${String(user?.username || "")} 以确认`}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void deleteAccount()}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
