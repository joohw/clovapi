# 图像生成

网关端点：`POST ${BASE_URL}/images/generations`  
原始端点：`POST https://api.openai.com/v1/images/generations`

## 请求示例（cURL）

```bash
curl -X POST "${BASE_URL}/images/generations" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-1",
    "prompt": "一只戴着耳机的赛博朋克猫，霓虹灯街景",
    "size": "1024x1024"
  }'
```
