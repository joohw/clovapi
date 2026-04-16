# 重排序

网关端点：`POST ${BASE_URL}/rerank`  
转发说明（主流渠道）：

- Jina 渠道：转发到 `POST https://api.jina.ai/v1/rerank`

> 说明：后端 Jina 适配器使用 `/v1/rerank`。其他渠道是否支持 `rerank` 取决于各自适配器实现。

## 请求示例（cURL）

```bash
curl -X POST "${BASE_URL}/rerank" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "jina-reranker-v2-base-multilingual",
    "query": "如何配置 API 代理",
    "documents": [
      "文档 A",
      "文档 B",
      "文档 C"
    ]
  }'
```
