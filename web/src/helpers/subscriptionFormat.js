export function formatSubscriptionDuration(plan, t) {
  const unit = plan?.duration_unit || 'month';
  const value = plan?.duration_value || 1;
  const unitLabels = {
    year: "年",
    month: "个月",
    day: "天",
    hour: "小时",
    custom: "自定义",
  };
  if (unit === 'custom') {
    const seconds = plan?.custom_seconds || 0;
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${"天"}`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${"小时"}`;
    return `${seconds} ${"秒"}`;
  }
  return `${value} ${unitLabels[unit] || unit}`;
}

export function formatSubscriptionResetPeriod(plan, t) {
  const period = plan?.quota_reset_period || 'never';
  if (period === 'never') return "不重置";
  if (period === 'daily') return "每天";
  if (period === 'weekly') return "每周";
  if (period === 'monthly') return "每月";
  if (period === 'custom') {
    const seconds = Number(plan?.quota_reset_custom_seconds || 0);
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${"天"}`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${"小时"}`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)} ${"分钟"}`;
    return `${seconds} ${"秒"}`;
  }
  return "不重置";
}
