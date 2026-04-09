/** 模型美元定价四键（与 model/option.go、ratio_setting 一致） */
export const MODEL_OPTION_KEYS = [
  'ModelInputUSDPerM',
  'ModelOutputUSDPerM',
  'ModelCacheReadUSDPerM',
  'ModelPerCallUSD',
  /** 模型溢价倍率，默认 1（不配置即不溢价） */
  'ModelPremiumRatio',
];

/**
 * @param {string | undefined | null} raw
 * @returns {Record<string, number>}
 */
export function parseNumberMap(raw) {
  const t = (raw ?? '').trim();
  if (!t) return {};
  try {
    const o = JSON.parse(t);
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return {};
    /** @type {Record<string, number>} */
    const out = {};
    for (const [k, v] of Object.entries(o)) {
      const n = typeof v === 'number' ? v : parseFloat(String(v));
      if (Number.isFinite(n)) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, number>} map
 */
export function stringifyNumberMap(map) {
  return JSON.stringify(map ?? {});
}

/**
 * @param {string} s
 * @returns {{ ok: true, value: number } | { ok: true, clear: true } | { ok: false, message: string }}
 */
export function parseOptionalNumberInput(s) {
  const t = String(s ?? '').trim();
  if (t === '') return { ok: true, clear: true };
  const n = parseFloat(t);
  if (!Number.isFinite(n)) return { ok: false, message: '请输入有效数字' };
  return { ok: true, value: n };
}

/**
 * @param {Record<string, number>} map
 * @param {string} name
 * @param {unknown} fallback  接口零值 0 视为未配置，不预填
 */
export function prefillFromMapOrRow(map, name, fallback) {
  if (map[name] !== undefined && map[name] !== null && Number.isFinite(map[name])) {
    return String(map[name]);
  }
  if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback !== 0) {
    return String(fallback);
  }
  return '';
}
