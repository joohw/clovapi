/**
 * 解析供应商图标 URL（模型列表等）。
 * Simple Icons 无「智谱」条目，zhipu slug 会 404，故使用本地 /vendors/zhipu.svg。
 * @param {string} vendorIcon
 * @param {string} [vendorName]
 * @returns {string}
 */
export function resolveVendorIcon(vendorIcon, vendorName = '') {
  const raw = String(vendorIcon || '').trim();
  if (!raw && !vendorName) return '';

  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:image/')
  ) {
    return raw;
  }

  const key = (raw || vendorName).split('.')[0].toLowerCase();

  /** @type {Record<string, string>} */
  const iconMap = {
    openai: 'openai',
    claude: 'anthropic',
    anthropic: 'anthropic',
    gemini: 'googlegemini',
    google: 'google',
    xai: 'x',
    grok: 'x',
    cohere: 'cohere',
    qwen: 'alibabacloud',
    alibaba: 'alibabacloud',
    azure: 'microsoftazure',
    microsoftazure: 'microsoftazure',
    deepseek: 'deepseek',
    // Simple Icons 无 zhipu；本地 SVG（亦用于中文名「智谱」）
    zhipu: '/vendors/zhipu.svg',
    智谱: '/vendors/zhipu.svg',
    doubao: 'bytedance',
    volcengine: 'bytedance',
    mistral: 'mistralai',
    siliconcloud: 'icloud',
  };

  const mapped = iconMap[key] || '';
  if (!mapped) return '';
  if (
    mapped.startsWith('/') ||
    mapped.startsWith('http://') ||
    mapped.startsWith('https://') ||
    mapped.startsWith('data:')
  ) {
    return mapped;
  }
  return `https://cdn.simpleicons.org/${mapped}/000000`;
}
