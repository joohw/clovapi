# 对话补全

网关端点：`POST ${BASE_URL}/chat/completions`  
原始端点：`POST https://api.openai.com/v1/chat/completions`

OpenAI 官方文档：<https://platform.openai.com/docs/api-reference/chat/create>

## 请求示例（cURL）

```bash
curl -X POST "${BASE_URL}/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "请总结一下这段文本" }
    ],
    "temperature": 0.7,
    "stream": false
  }'
```
