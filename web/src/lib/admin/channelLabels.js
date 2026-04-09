/**
 * Channel type / status display helpers.
 * Type IDs mirror `constant/channel.go` (ChannelTypeNames).
 * Status values mirror `common/constants.go` (ChannelStatus*).
 */

/** @type {Record<number, string>} */
export const CHANNEL_TYPE_LABEL = {
  0: '未知',
  1: 'OpenAI',
  2: 'Midjourney',
  3: 'Azure',
  4: 'Ollama',
  5: 'MidjourneyPlus',
  6: 'OpenAIMax',
  7: 'OhMyGPT',
  8: 'Custom',
  9: 'AILS',
  10: 'AIProxy',
  11: 'PaLM',
  12: 'API2GPT',
  13: 'AIGC2D',
  14: 'Anthropic',
  15: 'Baidu',
  16: 'Zhipu',
  17: 'Ali',
  18: 'Xunfei',
  19: '360',
  20: 'OpenRouter',
  21: 'AIProxyLibrary',
  22: 'FastGPT',
  23: 'Tencent',
  24: 'Gemini',
  25: 'Moonshot',
  26: 'ZhipuV4',
  27: 'Perplexity',
  31: 'LingYiWanWu',
  33: 'AWS',
  34: 'Cohere',
  35: 'MiniMax',
  36: 'SunoAPI',
  37: 'Dify',
  38: 'Jina',
  39: 'Cloudflare',
  40: 'SiliconFlow',
  41: 'VertexAI',
  42: 'Mistral',
  43: 'DeepSeek',
  44: 'MokaAI',
  45: 'VolcEngine',
  46: 'BaiduV2',
  47: 'Xinference',
  48: 'xAI',
  49: 'Coze',
  50: 'Kling',
  51: 'Jimeng',
  52: 'Vidu',
  53: 'Submodel',
  54: 'DoubaoVideo',
  55: 'Sora',
  56: 'Replicate',
  57: 'Codex',
};

/** @type {Record<number, string>} */
export const CHANNEL_STATUS_LABEL = {
  0: '未知',
  1: '启用',
  2: '已禁用（手动）',
  3: '已禁用（自动）',
};

/**
 * @param {unknown} type
 * @returns {{ name: string; code: number | null }}
 */
export function channelTypeParts(type) {
  if (type === null || type === undefined || type === '') {
    return { name: '—', code: null };
  }
  const n = Number(type);
  if (!Number.isFinite(n)) {
    return { name: String(type), code: null };
  }
  const name = CHANNEL_TYPE_LABEL[n] ?? `未知类型`;
  return { name, code: n };
}

/**
 * @param {unknown} status
 * @returns {{ label: string; code: number | null }}
 */
export function channelStatusParts(status) {
  if (status === null || status === undefined || status === '') {
    return { label: '—', code: null };
  }
  const n = Number(status);
  if (!Number.isFinite(n)) {
    return { label: String(status), code: null };
  }
  const label = CHANNEL_STATUS_LABEL[n] ?? `状态 ${n}`;
  return { label, code: n };
}

/**
 * @param {number | null | undefined} status
 * @returns {string} Tailwind classes for a small status pill
 */
export function channelStatusClass(status) {
  const n = Number(status);
  if (!Number.isFinite(n)) {
    return 'border-border bg-muted/50 text-muted-foreground';
  }
  switch (n) {
    case 1:
      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300';
    case 2:
      return 'border-border bg-muted text-muted-foreground';
    case 3:
      return 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200';
    default:
      return 'border-border bg-muted/50 text-muted-foreground';
  }
}
