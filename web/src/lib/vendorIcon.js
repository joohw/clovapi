/**
 * 解析供应商图标 URL（模型列表等）。
 * @param {string} vendorIcon
 * @param {string} [vendorName]
 * @param {string} [modelName]
 * @returns {string}
 */
export function resolveVendorIcon(vendorIcon, vendorName = '', modelName = '') {
  const raw = String(vendorIcon || '').trim();
  if (!raw && !vendorName && !modelName) return '';

  if (
    raw.startsWith('http://') ||
    raw.startsWith('https://') ||
    raw.startsWith('data:image/')
  ) {
    return raw;
  }

  // 优先以 model_name 推断供应商，再回退 vendor_icon / vendor_name。
  const keys = getVendorCandidates(modelName, raw, vendorName);
  if (!keys.length) return '';

  /** @type {Record<string, string>} */
  const iconMap = {
    claude: 'anthropic',
    anthropicai: 'anthropic',
    gemini: 'google',
    googleai: 'google',
    googlegemini: 'google',
    qwen: 'alibaba',
    alibabacloud: 'alibaba',
    azureopenai: 'azure',
    microsoftazure: 'azure',
    bytedance: 'bytedance-seed',
    volcengine: 'bytedance-seed',
    doubao: 'bytedance-seed',
    siliconcloud: 'siliconflow',
    siliconflowcn: 'siliconflow-cn',
    mistralai: 'mistral',
    x: 'xai',
    'x-ai': 'xai',
    grok: 'xai',
    zhipu: 'zhipuai',
    'z-ai': 'zai',
    'meta-llama': 'llama',
    microsoft: 'azure',
    aionlabs: 'aion-labs',
    'deep-cogito': 'deepcogito',
    'essential-ai': 'essentialai',
    arcee: 'arcee-ai',
    moonshot: 'moonshotai',
    wenxin: 'baidu',
    ollama: 'ollama-cloud',
    tencent: 'tencent-coding-plan',
    hunyuan: 'tencent-coding-plan',
    yi: 'zai',
    meta: 'llama',
    inflectionai: 'inflection',
    nous: 'nousresearch',
    rekaai: 'openrouter',
    thedrummer: 'openrouter',
    sao10k: 'openrouter',
    liquid: 'openrouter',
    kwaipilot: 'openrouter',
    writer: 'openrouter',
    'prime-intellect': 'openrouter',
    alpindale: 'openrouter',
    'ibm-granite': 'openrouter',
    relace: 'openrouter',
    tngtech: 'openrouter',
    meituan: 'openrouter',
    switchpoint: 'openrouter',
    'nex-agi': 'openrouter',
    undi95: 'openrouter',
    eleutherai: 'openrouter',
    cognitivecomputations: 'openrouter',
    alfredpros: 'openrouter',
    gryphe: 'openrouter',
    essentialai: '/vendor-icons/essentialai.ico',
    deepcogito: '/vendor-icons/deepcogito.png',
    'arcee-ai': '/vendor-icons/arcee-ai.png',
    'anthracite-org': '/vendor-icons/anthracite-org.svg',
    'aion-labs': '/vendor-icons/aion-labs.png',
  };

  const mapped = resolveMappedVendor(keys, iconMap);
  if (!mapped) return '';
  if (
    mapped.startsWith('/') ||
    mapped.startsWith('http://') ||
    mapped.startsWith('https://') ||
    mapped.startsWith('data:')
  ) {
    return mapped;
  }
  return `/vendor-icons/${mapped}.svg`;
}

/**
 * @param {string} value
 */
function normalizeVendorKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .split('.')[0]
    .replace(/\.(com|cn|ai|dev|io|net|org)$/, '')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * @param {...string} values
 * @returns {string[]}
 */
function getVendorCandidates(...values) {
  const candidates = new Set();
  const add = (v) => {
    const key = normalizeVendorKey(v);
    if (key) candidates.add(key);
  };

  for (const value of values) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) continue;

    // 兼容 provider/model 格式，如 google/gemma-4-26b-a4b-it
    const slashIdx = raw.indexOf('/');
    if (slashIdx > 0) {
      const provider = raw.slice(0, slashIdx);
      // 优先按 provider 解析，避免先命中完整 model id 导致找不到图标
      add(provider);
      add(raw);
      const providerDashIdx = provider.indexOf('-');
      if (providerDashIdx > 0) add(provider.slice(0, providerDashIdx));
    } else {
      add(raw);
    }

    const dashIdx = raw.indexOf('-');
    if (dashIdx > 0) add(raw.slice(0, dashIdx));
  }

  return Array.from(candidates);
}

/**
 * @param {string[]} keys
 * @param {Record<string, string>} iconMap
 */
function resolveMappedVendor(keys, iconMap) {
  for (const key of keys) {
    const mapped = iconMap[key] || key;
    if (mapped) return mapped;
  }
  return '';
}
