# 深度思考

网关端点：`POST ${BASE_URL}/responses`  
原始端点：`POST https://api.openai.com/v1/responses`

## 请求示例（cURL）

```bash
curl -X POST "${BASE_URL}/responses" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1-mini",
    "input": "请总结这段文本并输出三点结论"
  }'
```
