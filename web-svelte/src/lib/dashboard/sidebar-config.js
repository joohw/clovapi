export const DEFAULT_ADMIN_CONFIG = {
  chat: {
    enabled: true,
    playground: true,
    chat: true,
  },
  console: {
    enabled: true,
    detail: true,
    token: true,
    log: true,
    midjourney: true,
    task: true,
  },
  personal: {
    enabled: true,
    topup: true,
    personal: true,
  },
  admin: {
    enabled: true,
    channel: true,
    models: true,
    redemption: true,
    user: true,
    subscription: true,
    setting: true,
  },
};

const deepClone = (value) => JSON.parse(JSON.stringify(value));

/** @param {any} savedConfig */
export function mergeAdminConfig(savedConfig) {
  const merged = deepClone(DEFAULT_ADMIN_CONFIG);
  if (!savedConfig || typeof savedConfig !== 'object') return merged;

  for (const [sectionKey, sectionConfig] of Object.entries(savedConfig)) {
    if (!sectionConfig || typeof sectionConfig !== 'object') continue;
    if (!merged[sectionKey]) {
      merged[sectionKey] = { ...sectionConfig };
      continue;
    }
    merged[sectionKey] = { ...merged[sectionKey], ...sectionConfig };
  }
  return merged;
}
