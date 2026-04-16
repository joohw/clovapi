# Claude Messages

网关端点：`POST ${BASE_URL}/messages`  
原始端点：`POST https://api.anthropic.com/v1/messages`

## 请求示例（cURL）

```bash
curl -X POST "${BASE_URL}/messages" \
  -H "x-api-key: YOUR_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-latest",
    "max_tokens": 256,
    "messages": [
      { "role": "user", "content": "解释一下 RAG 的工作流程" }
    ]
  }'
```
