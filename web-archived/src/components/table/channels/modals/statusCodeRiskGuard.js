const NON_REDIRECTABLE_STATUS_CODES = new Set([504, 524]);

export const STATUS_CODE_RISK_TEXTS = {
  title: '高危操作确认',
  detailTitle: '检测到以下高危状态码重定向规则',
  inputPrompt: '操作确认',
  confirmButton: '我确认开启高危重试',
  markdown: `### ⚠️ 高危操作：504/524 状态码重试风险提示
504 和 524 通常代表请求已送达上游，但因处理超时导致连接中断。此时重试可能产生重复请求和重复计费。

开启状态码重定向/重试前，请确认你已理解并接受以下风险：

1. 可能出现双重或多重计费；
2. 请求总耗时可能显著增加，造成客户端超时；
3. 并发场景下可能导致请求积压，放大系统风险。`,
  confirmText: '我确认开启高危重试',
  inputPlaceholder: '请输入：我确认开启高危重试',
  mismatchText: '输入内容与确认文本不一致，请重新输入',
};

export const STATUS_CODE_RISK_CHECKLIST = [
  '我已知晓 504/524 重试可能导致重复扣费。',
  '我已知晓重试会显著增加请求耗时，可能引发客户端超时。',
  '我已知晓高并发下重试可能引发请求积压并影响系统稳定性。',
  '我确认将在可控环境下谨慎开启该配置，并自行承担相关风险。',
];

function parseStatusCodeKey(rawKey) {
  if (typeof rawKey !== 'string') {
    return null;
  }
  const normalized = rawKey.trim();
  if (!/^[1-5]\d{2}$/.test(normalized)) {
    return null;
  }
  return Number.parseInt(normalized, 10);
}

function parseStatusCodeMappingTarget(rawValue) {
  if (typeof rawValue === 'number' && Number.isInteger(rawValue)) {
    return rawValue >= 100 && rawValue <= 599 ? rawValue : null;
  }
  if (typeof rawValue === 'string') {
    const normalized = rawValue.trim();
    if (!/^[1-5]\d{2}$/.test(normalized)) {
      return null;
    }
    const code = Number.parseInt(normalized, 10);
    return code >= 100 && code <= 599 ? code : null;
  }
  return null;
}

export function collectInvalidStatusCodeEntries(statusCodeMappingStr) {
  if (
    typeof statusCodeMappingStr !== 'string' ||
    statusCodeMappingStr.trim() === ''
  ) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(statusCodeMappingStr);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }

  const invalid = [];
  for (const [rawKey, rawValue] of Object.entries(parsed)) {
    const fromCode = parseStatusCodeKey(rawKey);
    const toCode = parseStatusCodeMappingTarget(rawValue);
    if (fromCode === null || toCode === null) {
      invalid.push(`${rawKey} → ${rawValue}`);
    }
  }

  return invalid;
}

export function collectDisallowedStatusCodeRedirects(statusCodeMappingStr) {
  if (
    typeof statusCodeMappingStr !== 'string' ||
    statusCodeMappingStr.trim() === ''
  ) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(statusCodeMappingStr);
  } catch (error) {
    return [];
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return [];
  }

  const riskyMappings = [];
  Object.entries(parsed).forEach(([rawFrom, rawTo]) => {
    const fromCode = parseStatusCodeKey(rawFrom);
    const toCode = parseStatusCodeMappingTarget(rawTo);
    if (fromCode === null || toCode === null) {
      return;
    }
    if (!NON_REDIRECTABLE_STATUS_CODES.has(fromCode)) {
      return;
    }
    if (fromCode === toCode) {
      return;
    }
    riskyMappings.push(`${fromCode} -> ${toCode}`);
  });

  return Array.from(new Set(riskyMappings)).sort();
}

export function collectNewDisallowedStatusCodeRedirects(
  originalStatusCodeMappingStr,
  currentStatusCodeMappingStr,
) {
  const currentRisky = collectDisallowedStatusCodeRedirects(
    currentStatusCodeMappingStr,
  );
  if (currentRisky.length === 0) {
    return [];
  }

  const originalRiskySet = new Set(
    collectDisallowedStatusCodeRedirects(originalStatusCodeMappingStr),
  );

  return currentRisky.filter((mapping) => !originalRiskySet.has(mapping));
}
