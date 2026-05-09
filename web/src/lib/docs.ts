import { API_DOC_PAGES } from "@/lib/api-docs-data";

const DOC_SUFFIX_BY_SLUG: Record<string, string> = {
  "chat-completions": "/chat/completions",
  responses: "/responses",
  "claude-messages": "/messages",
  search: "/search",
  embeddings: "/embeddings",
  rerank: "/rerank",
  "images-generations": "/images/generations",
  "audio-speech": "/audio/speech",
};

/** 同一网关路径下，多个上游厂商的参考端点与 cURL（如 Embeddings：OpenAI / Cohere） */
export type ApiDocOriginalSource = {
  id: string;
  label: string;
  originalEndpoint: string;
  originalDocUrl: string;
  originalDocLabel: string;
  /** 已替换 ${BASE_URL} */
  curlExample: string;
  /** 该渠道在 Playground 中的默认请求体 JSON（可选） */
  defaultRequestBody?: string;
};

export type ApiDoc = {
  slug: string;
  title: string;
  description: string;
  /** 已替换 ${BASE_URL} 的 cURL 示例全文（默认/主参考；与 originalSources 二选一或并存时以 originalSources 为准展示） */
  curlExample: string;
  originalEndpoint?: string;
  originalDocUrl?: string;
  originalDocLabel?: string;
  /** 多上游参考；有多个时在文档区以下拉选择渠道 */
  originalSources?: ApiDocOriginalSource[];
};

type GetApiDocsOptions = {
  baseUrl?: string;
};

/** Path segment under `/v1`, e.g. `/responses`. Empty if slug is unknown. */
export function getDocEndpointPath(slug: string): string {
  return DOC_SUFFIX_BY_SLUG[slug] ?? "";
}

function applyBaseUrl(curl: string, base: string): string {
  return curl.replace(/\$\{BASE_URL\}/g, base || "${BASE_URL}");
}

export async function getApiDocs(options?: GetApiDocsOptions): Promise<ApiDoc[]> {
  const base = options?.baseUrl?.trim() ?? "";
  return API_DOC_PAGES.map((def) => {
    const originalSources = def.originalSources?.map((src) => ({
      ...src,
      curlExample: applyBaseUrl(src.curlExample, base),
    }));
    return {
      slug: def.slug,
      title: def.title,
      description: def.description,
      curlExample: applyBaseUrl(def.curlExample, base),
      originalEndpoint: def.originalEndpoint,
      originalDocUrl: def.originalDocUrl,
      originalDocLabel: def.originalDocLabel,
      originalSources,
    };
  });
}
