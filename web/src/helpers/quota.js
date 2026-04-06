import { getCurrencyConfig } from './render';

export const getQuotaPerUnit = () => {
  const raw = parseFloat(localStorage.getItem('quota_per_unit') || '1');
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
};

/** 内部额度 → 美元金额（始终按 USD，与站点「显示货币」设置无关） */
export const quotaToUsd = (quota) => {
  const q = Number(quota || 0);
  if (!Number.isFinite(q) || q <= 0) return 0;
  return q / getQuotaPerUnit();
};

/** 美元 → 内部额度（整数，与后端存储一致） */
export const usdToQuota = (usd) => {
  const u = Number(usd || 0);
  if (!Number.isFinite(u) || u <= 0) return 0;
  return Math.round(u * getQuotaPerUnit());
};

/** 内部额度 → 美元输入框字符串（去掉多余小数尾零） */
export const quotaToUsdInputString = (quota) => {
  const usd = quotaToUsd(quota);
  if (!Number.isFinite(usd) || usd <= 0) return '';
  return usd.toFixed(8).replace(/\.?0+$/, '');
};

export const quotaToDisplayAmount = (quota) => {
  const q = Number(quota || 0);
  if (!Number.isFinite(q) || q <= 0) return 0;
  const { type, rate } = getCurrencyConfig();
  if (type === 'TOKENS') return q;
  const usd = q / getQuotaPerUnit();
  if (type === 'USD') return usd;
  return usd * (rate || 1);
};

export const displayAmountToQuota = (amount) => {
  const val = Number(amount || 0);
  if (!Number.isFinite(val) || val <= 0) return 0;
  const { type, rate } = getCurrencyConfig();
  if (type === 'TOKENS') return Math.round(val);
  const usd = type === 'USD' ? val : val / (rate || 1);
  return Math.round(usd * getQuotaPerUnit());
};
