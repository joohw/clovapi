"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { getStoredUser, setStoredUser } from "@/lib/auth";
import { useToast } from "@/components/ui/toast-provider";
import { dashboardSoftButtonClass } from "@/components/dashboard/dashboard-soft";
import { UserInfoHeader } from "@/components/dashboard/user-info-header";
import { Button } from "@/components/ui/button";

const sectionClass = "panel w-full min-w-0";

export default function DashboardPage() {
  const { showError, showSuccess } = useToast();
  const [user, setUser] = useState<Record<string, any> | null>(null);
  const [status, setStatus] = useState<Record<string, any>>({});
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

  useEffect(() => {
    const init = async () => {
      const localUser = getStoredUser();
      if (localUser) {
        setUser(localUser as Record<string, any>);
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
        }
      } catch {
        showError("加载用户信息失败");
      }
    };
    void init();
  }, [showError]);

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

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  return (
    <div className="page-wrap w-full min-w-0 space-y-5 pb-2">
      <UserInfoHeader user={user} status={status} onRefreshUser={async () => {
        const res = await apiGet("/api/user/self");
        if (res?.success && res.data) {
          setUser(res.data);
          setStoredUser(res.data);
        }
      }} />

      <div className="space-y-5">
          {status?.checkin_enabled ? (
            <section className={sectionClass}>
              <div className="panel-header flex items-center justify-between p-4 pb-3 sm:p-5 sm:pb-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <h2 className="panel-title">签到日历</h2>
                  {checkinData.stats?.checked_in_today ? (
                    <span className="ml-1 inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                      今日已签到
                    </span>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className={dashboardSoftButtonClass}
                  onClick={() => setCheckinCollapsed((prev) => !prev)}
                >
                  {checkinCollapsed ? "展开" : "收起"}
                </Button>
              </div>
              <div className="panel-body px-4 pb-4 sm:px-5 sm:pb-5">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/25 px-3 py-3 dark:bg-muted/20">
                  <div className="text-sm text-muted-foreground">
                    {checkinData.stats?.checked_in_today
                      ? `已签到，累计 ${Number(checkinData.stats?.total_checkins || 0)} 天 · 本月获得 ${renderQuota(monthlyQuota)}`
                      : "每日签到可获得随机额度奖励"}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void doCheckin()}
                    disabled={checkinSubmitting || checkinLoading || !!checkinData.stats?.checked_in_today}
                  >
                    {checkinSubmitting
                      ? "签到中..."
                      : checkinData.stats?.checked_in_today
                        ? "今日已签到"
                        : "立即签到"}
                  </Button>
                </div>
                {!checkinCollapsed ? (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-3 gap-2 sm:gap-3">
                      <div className="rounded-xl bg-muted/25 px-3 py-2 dark:bg-muted/20">
                        <div className="text-[11px] text-muted-foreground">累计签到</div>
                        <div className="text-lg font-semibold tabular-nums">{Number(checkinData.stats?.total_checkins || 0)}</div>
                      </div>
                      <div className="rounded-xl bg-muted/25 px-3 py-2 dark:bg-muted/20">
                        <div className="text-[11px] text-muted-foreground">本月获得</div>
                        <div className="text-lg font-semibold tabular-nums">{renderQuota(monthlyQuota)}</div>
                      </div>
                      <div className="rounded-xl bg-muted/25 px-3 py-2 dark:bg-muted/20">
                        <div className="text-[11px] text-muted-foreground">累计获得</div>
                        <div className="text-lg font-semibold tabular-nums">{renderQuota(Number(checkinData.stats?.total_quota || 0))}</div>
                      </div>
                    </div>
                    <div className="overflow-hidden rounded-xl bg-muted/20 dark:bg-muted/15">
                      <div className="flex items-center justify-between bg-muted/30 px-3 py-2 text-sm dark:bg-muted/25">
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted/50 hover:bg-muted dark:bg-muted/40 dark:hover:bg-muted/70"
                          onClick={() => {
                            const d = new Date(viewDate);
                            d.setMonth(d.getMonth() - 1);
                            setViewDate(d);
                          }}
                          aria-label="上一月"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <span className="font-medium tabular-nums">{viewDate.getFullYear()} 年 {viewDate.getMonth() + 1} 月</span>
                        <button
                          type="button"
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-muted/50 hover:bg-muted dark:bg-muted/40 dark:hover:bg-muted/70"
                          onClick={() => {
                            const d = new Date(viewDate);
                            d.setMonth(d.getMonth() + 1);
                            setViewDate(d);
                          }}
                          aria-label="下一月"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {checkinLoading ? (
                        <div className="p-6 text-center text-sm text-muted-foreground">加载中...</div>
                      ) : (
                        <div className="grid grid-cols-7 gap-1 p-2 text-center text-[11px]">
                          {["日", "一", "二", "三", "四", "五", "六"].map((week) => (
                            <div key={week} className="rounded-md bg-muted/30 py-1.5 font-medium text-muted-foreground dark:bg-muted/25">
                              {week}
                            </div>
                          ))}
                          {monthCells.map((cell, index) =>
                            cell ? (
                              <div
                                key={`${cell.dateStr}-${index}`}
                                className={`relative min-h-[44px] rounded-md bg-muted/15 p-0.5 text-left dark:bg-muted/10 ${cell.dateStr === todayStr ? "bg-muted/35 ring-1 ring-inset ring-foreground/15 dark:bg-muted/30" : ""}`}
                                title={
                                  checkinRecordMap[cell.dateStr] != null
                                    ? `获得 ${renderQuota(checkinRecordMap[cell.dateStr])}`
                                    : ""
                                }
                              >
                                <span className="absolute left-1 top-0.5 text-[10px] text-muted-foreground">{cell.day}</span>
                                {checkinRecordMap[cell.dateStr] != null ? (
                                  <div className="flex h-full flex-col items-center justify-center pt-2">
                                    <div className="mb-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white">
                                      ✓
                                    </div>
                                    <div className="text-[9px] font-medium leading-none text-emerald-600 dark:text-emerald-400">
                                      {renderQuota(checkinRecordMap[cell.dateStr])}
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <div key={`empty-${index}`} className="min-h-[44px] rounded-md bg-muted/10 dark:bg-muted/[0.07]"></div>
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
      </div>
    </div>
  );
}
