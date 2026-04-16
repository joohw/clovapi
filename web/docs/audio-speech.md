# 语音合成

网关端点：`POST ${BASE_URL}/audio/speech`  
原始端点：`POST https://api.openai.com/v1/audio/speech`

## 请求示例（cURL）

```bash
curl -X POST "${BASE_URL}/audio/speech" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini-tts",
    "voice": "alloy",
    "input": "你好，欢迎使用 clovapi。"
  }'
```
