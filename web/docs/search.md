# 在线搜索

网关端点：`POST ${BASE_URL}/search`  
转发说明（主流渠道）：

- Tavily 渠道：转发到 `POST https://api.tavily.com/search`

> 说明：`/search` 不走常规 OpenAI/Cohere 适配器，而是后端专门分发到 Tavily。若绑定其他渠道会返回不支持。

## 请求示例（cURL）

```bash
curl -X POST "${BASE_URL}/search" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "search-v1",
    "query": "如何接入统一模型 API",
    "include_answer": true
  }'
```
