---
title: "为什么需要本地模型 API 代理"
description: "本地代理让订阅、自定义 API 和多种协议风格收敛到同一个可调试入口。"
date: "2026-07-08"
---

模型 API 的配置常常散在不同工具里：一个地方填 base URL，一个地方填 key，另一个地方还要换协议路径。clovapi 的思路是把这些差异收进一个本地代理。

## 一个入口

本地代理默认监听：

```text
http://127.0.0.1:27483
```

不同上游通过 provider id 区分：

```text
/codex/v1/responses
/claude-code/v1/messages
/custom-api/v1/chat/completions
```

客户端只需要配置稳定的本地 URL。

## 本地管理

clovapi 保存上游地址、密钥、订阅登录态、模型名称和 API 风格。配置文件在本机，桌面端可以查看代理状态和调用日志。

## 协议适配

客户端可以继续使用熟悉的请求格式：

- OpenAI Chat Completions
- OpenAI Responses
- Anthropic Messages
- Gemini generateContent

clovapi 在代理边界完成转换，减少每个客户端里的重复配置。
