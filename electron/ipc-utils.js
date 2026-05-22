/**
 * Electron IPC 只能传递 structured-cloneable 数据；用 JSON 往返去掉 Proxy / 不可克隆字段。
 */
function sanitizeForIpc(value) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, val) => {
        if (typeof val === "bigint") return val.toString();
        if (val instanceof Error) return val.message;
        return val;
      }),
    );
  } catch {
    return null;
  }
}

module.exports = {
  sanitizeForIpc,
};
