# 文本嵌入

网关端点：`POST ${BASE_URL}/embeddings`  
原始端点：`POST https://api.openai.com/v1/embeddings`

## 请求示例（cURL）

```bash
curl -X POST "${BASE_URL}/embeddings" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": [
      "AI 网关的计费策略",
      "如何接入统一模型 API"
    ]
  }'
```
