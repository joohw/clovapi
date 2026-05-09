/**
 * API 文档页静态数据（原 web/docs/*.md），仅维护此处即可。
 * 请求示例中的 ${BASE_URL} 在 getApiDocs 中替换为实际网关 /v1 前缀地址。
 */

/** 同一 slug 下多个上游参考（网关路径不变，仍为 /v1/... 或 Playground /pg/...） */
export type ApiDocOriginalSourceDefinition = {
  id: string;
  label: string;
  originalEndpoint: string;
  originalDocUrl: string;
  originalDocLabel: string;
  curlExample: string;
  /** Playground 默认 JSON 请求体（可选） */
  defaultRequestBody?: string;
};

export type ApiDocDefinition = {
  slug: string;
  title: string;
  description: string;
  originalEndpoint: string;
  originalDocUrl: string;
  originalDocLabel: string;
  /** 展示在文档区的默认 cURL（无 originalSources 或与第一项一致时使用） */
  curlExample: string;
  /** 多个渠道/厂商文档与示例；有 2 项及以上时文档区以下拉选择 */
  originalSources?: ApiDocOriginalSourceDefinition[];
};

export const API_DOC_PAGES: readonly ApiDocDefinition[] = [
  {
    slug: "chat-completions",
    title: "Chat Completions",
    description: "/chat/completions",
    originalEndpoint: "https://api.openai.com/v1/chat/completions",
    originalDocUrl: "https://platform.openai.com/docs/api-reference/chat/create",
    originalDocLabel: "OpenAI Chat Completions",
    curlExample: `curl -X POST "\${BASE_URL}/chat/completions" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "What is the weather like in Boston today?" }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_current_weather",
          "description": "Get the current weather in a given location",
          "parameters": {
            "type": "object",
            "properties": {
              "location": {
                "type": "string",
                "description": "The city and state, e.g. San Francisco, CA"
              },
              "unit": { "type": "string", "enum": ["celsius", "fahrenheit"] }
            },
            "required": ["location"]
          }
        }
      }
    ],
    "tool_choice": "auto",
    "temperature": 0.7,
    "max_tokens": 1024,
    "top_p": 1,
    "frequency_penalty": 0,
    "presence_penalty": 0,
    "response_format": { "type": "text" },
    "stream": false
  }'`,
    originalSources: [
      {
        id: "openai",
        label: "OpenAI",
        originalEndpoint: "https://api.openai.com/v1/chat/completions",
        originalDocUrl: "https://platform.openai.com/docs/api-reference/chat/create",
        originalDocLabel: "OpenAI Chat Completions",
        curlExample: `curl -X POST "\${BASE_URL}/chat/completions" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o",
    "messages": [
      { "role": "system", "content": "You are a helpful assistant." },
      { "role": "user", "content": "What is the weather like in Boston today?" }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_current_weather",
          "description": "Get the current weather in a given location",
          "parameters": {
            "type": "object",
            "properties": {
              "location": {
                "type": "string",
                "description": "The city and state, e.g. San Francisco, CA"
              },
              "unit": { "type": "string", "enum": ["celsius", "fahrenheit"] }
            },
            "required": ["location"]
          }
        }
      }
    ],
    "tool_choice": "auto",
    "temperature": 0.7,
    "max_tokens": 1024,
    "top_p": 1,
    "frequency_penalty": 0,
    "presence_penalty": 0,
    "response_format": { "type": "text" },
    "stream": false
  }'`,
        defaultRequestBody: `{
  "model": "gpt-4.1-mini",
  "stream": true,
  "messages": [{ "role": "user", "content": "Hello" }]
}`,
      },
      {
        id: "deepseek",
        label: "DeepSeek",
        originalEndpoint: "https://api.deepseek.com/v1/chat/completions",
        originalDocUrl: "https://api-docs.deepseek.com/",
        originalDocLabel: "DeepSeek API",
        curlExample: `curl -X POST "\${BASE_URL}/chat/completions" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "deepseek-chat",
    "messages": [{ "role": "user", "content": "Hello" }],
    "stream": true
  }'`,
        defaultRequestBody: `{
  "model": "deepseek-chat",
  "stream": true,
  "messages": [{ "role": "user", "content": "Hello" }]
}`,
      },
    ],
  },
  {
    slug: "responses",
    title: "Responses",
    description: "/responses",
    originalEndpoint: "https://api.openai.com/v1/responses",
    originalDocUrl: "https://platform.openai.com/docs/api-reference/responses",
    originalDocLabel: "OpenAI Responses",
    curlExample: `curl -X POST "\${BASE_URL}/responses" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4.1",
    "input": "Summarize recent advances in quantum error correction in three bullet points.",
    "instructions": "Use clear Markdown. Prefer short sentences.",
    "tools": [
      { "type": "web_search_preview" },
      {
        "type": "function",
        "function": {
          "name": "lookup_doc",
          "description": "Look up an internal document by id",
          "parameters": {
            "type": "object",
            "properties": { "doc_id": { "type": "string" } },
            "required": ["doc_id"]
          }
        }
      }
    ],
    "tool_choice": "auto",
    "temperature": 0.8,
    "max_output_tokens": 1200,
    "text": { "format": { "type": "text" } }
  }'`,
  },
  {
    slug: "claude-messages",
    title: "Claude Messages",
    description: "/messages",
    originalEndpoint: "https://api.anthropic.com/v1/messages",
    originalDocUrl: "https://docs.anthropic.com/en/api/messages",
    originalDocLabel: "Anthropic Messages",
    curlExample: `curl -X POST "\${BASE_URL}/messages" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "system": "You are a concise technical assistant.",
    "messages": [
      { "role": "user", "content": "What is the weather in Paris? Use the tool if needed." }
    ],
    "tools": [
      {
        "name": "get_weather",
        "description": "Get current weather for a city",
        "input_schema": {
          "type": "object",
          "properties": {
            "city": { "type": "string", "description": "City name" }
          },
          "required": ["city"]
        }
      }
    ],
    "tool_choice": { "type": "auto" },
    "temperature": 0.7,
    "top_p": 0.95
  }'`,
  },
  {
    slug: "search",
    title: "Search",
    description: "/search",
    originalEndpoint: "https://api.tavily.com/search",
    originalDocUrl: "https://docs.tavily.com/documentation/api-reference/endpoint/search",
    originalDocLabel: "Tavily Search",
    curlExample: `curl -X POST "\${BASE_URL}/search" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "search-v1",
    "query": "How to configure an OpenAI-compatible API gateway?",
    "include_answer": true,
    "search_depth": "advanced",
    "max_results": 8,
    "topic": "general"
  }'`,
  },
  {
    slug: "embeddings",
    title: "Embeddings",
    description: "/embeddings",
    originalEndpoint: "https://api.openai.com/v1/embeddings",
    originalDocUrl: "https://platform.openai.com/docs/api-reference/embeddings/create",
    originalDocLabel: "OpenAI Embeddings",
    curlExample: `curl -X POST "\${BASE_URL}/embeddings" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "text-embedding-3-small",
    "input": [
      "AI 网关的计费策略",
      "如何接入统一模型 API"
    ],
    "encoding_format": "float",
    "dimensions": 1536
  }'`,
    originalSources: [
      {
        id: "openai",
        label: "OpenAI",
        originalEndpoint: "https://api.openai.com/v1/embeddings",
        originalDocUrl: "https://platform.openai.com/docs/api-reference/embeddings/create",
        originalDocLabel: "OpenAI Embeddings",
        curlExample: `curl -X POST "\${BASE_URL}/embeddings" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "text-embedding-3-small",
    "input": [
      "AI 网关的计费策略",
      "如何接入统一模型 API"
    ],
    "encoding_format": "float",
    "dimensions": 1536
  }'`,
      },
      {
        id: "cohere",
        label: "Cohere",
        originalEndpoint: "https://api.cohere.ai/v1/embed",
        originalDocUrl: "https://docs.cohere.com/reference/embed",
        originalDocLabel: "Cohere Embed",
        curlExample: `curl -X POST "\${BASE_URL}/embeddings" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "embed-english-v3.0",
    "input": [
      "AI 网关的计费策略",
      "如何接入统一模型 API"
    ],
    "encoding_format": "float",
    "dimensions": 1024
  }'`,
      },
    ],
  },
  {
    slug: "rerank",
    title: "Rerank",
    description: "/rerank",
    originalEndpoint: "https://api.jina.ai/v1/rerank",
    originalDocUrl: "https://jina.ai/reranker/",
    originalDocLabel: "Jina Rerank API",
    curlExample: `curl -X POST "\${BASE_URL}/rerank" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "jina-reranker-v2-base-multilingual",
    "query": "How do I configure rate limits for API keys?",
    "documents": [
      "Rate limits can be set per token in the dashboard under Keys.",
      "The gateway supports per-model concurrency caps.",
      "Billing is usage-based on tokens consumed."
    ],
    "top_n": 2,
    "return_documents": true
  }'`,
  },
  {
    slug: "images-generations",
    title: "Images Generations",
    description: "/images/generations",
    originalEndpoint: "https://api.openai.com/v1/images/generations",
    originalDocUrl: "https://platform.openai.com/docs/api-reference/images/create",
    originalDocLabel: "OpenAI Images",
    curlExample: `curl -X POST "\${BASE_URL}/images/generations" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "dall-e-3",
    "prompt": "A minimal line-art logo of a cloud with a key icon, flat vector, white on dark gray",
    "n": 1,
    "size": "1024x1024",
    "quality": "standard",
    "response_format": "url",
    "style": "vivid"
  }'`,
  },
  {
    slug: "audio-speech",
    title: "Audio Speech",
    description: "/audio/speech",
    originalEndpoint: "https://api.openai.com/v1/audio/speech",
    originalDocUrl: "https://platform.openai.com/docs/api-reference/audio/createSpeech",
    originalDocLabel: "OpenAI Audio speech",
    curlExample: `curl -X POST "\${BASE_URL}/audio/speech" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "tts-1",
    "voice": "alloy",
    "input": "你好，欢迎使用 CLOVAPI 统一模型网关。",
    "response_format": "mp3",
    "speed": 1.0
  }'`,
  },
];
