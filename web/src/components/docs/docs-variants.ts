import type { ApiDoc, ApiDocOriginalSource } from "@/lib/docs";

/** 解析文档页「渠道 / 上游」列表：无 originalSources 时由顶层字段合成一条 */
export function getDocVariants(doc: ApiDoc): ApiDocOriginalSource[] {
  if (doc.originalSources?.length) {
    return doc.originalSources;
  }
  if (doc.originalEndpoint && doc.originalDocUrl) {
    return [
      {
        id: "default",
        label: doc.originalDocLabel || "参考文档",
        originalEndpoint: doc.originalEndpoint,
        originalDocUrl: doc.originalDocUrl,
        originalDocLabel: doc.originalDocLabel || "原始文档",
        curlExample: doc.curlExample,
      },
    ];
  }
  return [
    {
      id: "default",
      label: "参考",
      originalEndpoint: "",
      originalDocUrl: "",
      originalDocLabel: "",
      curlExample: doc.curlExample,
    },
  ];
}
