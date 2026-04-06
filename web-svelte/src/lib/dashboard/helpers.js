/**
 * @param {number} num
 */
export function renderNumber(num) {
  if (num >= 1000000000) {
    return (num / 1000000000).toFixed(1) + 'B';
  }
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 10000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num;
}

/**
 * @param {number} quota
 * @param {number} [digits]
 */
export function renderQuota(quota, digits = 2) {
  let quotaPerUnit = localStorage.getItem('quota_per_unit');
  const quotaDisplayType = localStorage.getItem('quota_display_type') || 'USD';
  quotaPerUnit = parseFloat(quotaPerUnit);
  if (quotaDisplayType === 'TOKENS') {
    return String(renderNumber(quota));
  }
  const resultUSD = quota / quotaPerUnit;
  let symbol = '$';
  let value = resultUSD;
  if (quotaDisplayType === 'CNY') {
    const statusStr = localStorage.getItem('status');
    let usdRate = 1;
    try {
      if (statusStr) {
        const s = JSON.parse(statusStr);
        usdRate = s?.usd_exchange_rate || 1;
      }
    } catch (_) {}
    value = resultUSD * usdRate;
    symbol = '¥';
  } else if (quotaDisplayType === 'CUSTOM') {
    const statusStr = localStorage.getItem('status');
    let symbolCustom = '¤';
    let rate = 1;
    try {
      if (statusStr) {
        const s = JSON.parse(statusStr);
        symbolCustom = s?.custom_currency_symbol || symbolCustom;
        rate = s?.custom_currency_exchange_rate || rate;
      }
    } catch (_) {}
    value = resultUSD * rate;
    symbol = symbolCustom;
  }
  const fixedResult = value.toFixed(digits);
  if (parseFloat(fixedResult) === 0 && quota > 0 && value > 0) {
    const minValue = Math.pow(10, -digits);
    return symbol + minValue.toFixed(digits);
  }
  return symbol + fixedResult;
}

/**
 * @param {number} quota
 * @param {number} [digits]
 */
export function renderQuotaWithPrompt(quota, digits) {
  const quotaDisplayType = localStorage.getItem('quota_display_type') || 'USD';
  if (quotaDisplayType !== 'TOKENS') {
    return '等价金额：' + renderQuota(quota, digits);
  }
  return '';
}

/** 额度与显示货币换算的基准单位（与后端 quota 存储一致） */
export function getQuotaPerUnit() {
  const raw = parseFloat(localStorage.getItem('quota_per_unit') || '1');
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

/** 内部额度 → 美元（始终按 USD，与站点「显示货币」设置无关） */
export function quotaToUsd(quota) {
  const q = Number(quota || 0);
  if (!Number.isFinite(q) || q <= 0) return 0;
  return q / getQuotaPerUnit();
}

/** 美元 → 内部额度（整数） */
export function usdToQuota(usd) {
  const u = Number(usd || 0);
  if (!Number.isFinite(u) || u <= 0) return 0;
  return Math.round(u * getQuotaPerUnit());
}

/** 内部额度 → 美元输入框字符串 */
export function quotaToUsdInputString(quota) {
  const usd = quotaToUsd(quota);
  if (!Number.isFinite(usd) || usd <= 0) return '';
  return usd.toFixed(8).replace(/\.?0+$/, '');
}

export function getCurrencyConfig() {
  const quotaDisplayType = localStorage.getItem('quota_display_type') || 'USD';
  const statusStr = localStorage.getItem('status');
  let symbol = '$';
  let rate = 1;
  if (quotaDisplayType === 'CNY') {
    symbol = '¥';
    try {
      if (statusStr) {
        const s = JSON.parse(statusStr);
        rate = s?.usd_exchange_rate || 7;
      }
    } catch (e) {}
  } else if (quotaDisplayType === 'CUSTOM') {
    try {
      if (statusStr) {
        const s = JSON.parse(statusStr);
        symbol = s?.custom_currency_symbol || '¤';
        rate = s?.custom_currency_exchange_rate || 1;
      }
    } catch (e) {}
  }
  return { symbol, rate, type: quotaDisplayType };
}

/** 内部额度 → 当前站点「显示货币」下的数值（与 renderQuota 一致） */
export function quotaToDisplayAmount(quota) {
  const q = Number(quota || 0);
  if (!Number.isFinite(q) || q <= 0) return 0;
  const { type, rate } = getCurrencyConfig();
  if (type === 'TOKENS') return q;
  const usd = q / getQuotaPerUnit();
  if (type === 'USD') return usd;
  return usd * (rate || 1);
}

/** 显示货币数值 → 内部额度 */
export function displayAmountToQuota(amount) {
  const val = Number(amount || 0);
  if (!Number.isFinite(val) || val <= 0) return 0;
  const { type, rate } = getCurrencyConfig();
  if (type === 'TOKENS') return Math.round(val);
  const usd = type === 'USD' ? val : val / (rate || 1);
  return Math.round(usd * getQuotaPerUnit());
}

export function quotaToDisplayInputString(quota) {
  const a = quotaToDisplayAmount(quota);
  if (!Number.isFinite(a) || a <= 0) return '';
  return a.toFixed(8).replace(/\.?0+$/, '');
}

/** 额度预警等表单标签用语 */
export function getQuotaThresholdUnitLabel() {
  const { type } = getCurrencyConfig();
  if (type === 'TOKENS') return '点数';
  if (type === 'USD') return '美元';
  if (type === 'CNY') return '人民币';
  return '自定义货币';
}

/** @param {string} str */
export function avatarColorFromString(str) {
  let sum = 0;
  for (let i = 0; i < str.length; i++) {
    sum += str.charCodeAt(i);
  }
  const hue = sum % 360;
  return `hsl(${hue} 42% 42%)`;
}

/** @param {string} text */
export async function copy(text) {
  let okay = true;
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    } catch (e) {
      okay = false;
      console.error(e);
    }
  }
  return okay;
}

/**
 * 当前登录用户 role（与后端一致）。无法解析时为 -1。
 * @returns {number}
 */
export function getUserRole() {
  const raw = localStorage.getItem('user');
  if (!raw) return -1;
  try {
    const user = JSON.parse(raw);
    const r = user?.role;
    if (r == null || r === '') return -1;
    const n = Number(r);
    return Number.isFinite(n) ? n : -1;
  } catch (_) {
    return -1;
  }
}

export function isAdmin() {
  return getUserRole() >= 10;
}

export function isRoot() {
  return getUserRole() >= 100;
}

/** @param {Record<string, unknown>} data */
export function setStatusData(data) {
  localStorage.setItem('status', JSON.stringify(data));
  if (data.system_name != null) localStorage.setItem('system_name', String(data.system_name));
  if (data.logo != null) localStorage.setItem('logo', String(data.logo));
  if (data.footer_html != null) localStorage.setItem('footer_html', String(data.footer_html));
  if (data.quota_per_unit != null) localStorage.setItem('quota_per_unit', String(data.quota_per_unit));
  localStorage.setItem('display_in_currency', String(data.display_in_currency));
  localStorage.setItem('quota_display_type', String(data.quota_display_type || 'USD'));
}

/** @param {Record<string, unknown>} data */
export function setUserData(data) {
  localStorage.setItem('user', JSON.stringify(data));
}
