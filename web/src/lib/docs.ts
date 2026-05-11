import { API_DOC_PAGES } from "@/lib/api-docs-data";

export type ApiDocOriginalSource = {
  id: string;
  label: string;
  originalEndpoint: string;
  originalDocUrl: string;
  originalDocLabel: string;
  curlExample: string;
  defaultRequestBody?: string;
};

export type ApiDoc = {
  slug: string;
  title: string;
  description: string;
  content: string;
  curlExample?: string;
  originalEndpoint?: string;
  originalDocUrl?: string;
  originalDocLabel?: string;
  originalSources?: ApiDocOriginalSource[];
};

type GetApiDocsOptions = {
  baseUrl?: string;
};

/**
 * 保留兼容：旧版请求测试器依赖此函数。
 * 教程文档模式下不再使用 endpoint path，因此返回空字符串。
 */
export function getDocEndpointPath(slug: string): string {
  void slug;
  return "";
}

export async function getApiDocs(options?: GetApiDocsOptions): Promise<ApiDoc[]> {
  void options;
  return API_DOC_PAGES.map((def) => {
    return {
      slug: def.slug,
      title: def.title,
      description: def.description,
      content: def.content,
    };
  });
}
