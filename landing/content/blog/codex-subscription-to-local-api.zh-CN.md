---
title: "把 Codex 订阅接成本地 API"
description: "用 clovapi 将 Codex 订阅通过 localhost 暴露为 OpenAI Responses 兼容接口。"
date: "2026-07-08"
---

Codex 订阅适合交互式使用，但很多工具更习惯接入一个稳定的 API 地址。clovapi 把这个流程放到本机：登录订阅、启动代理，然后通过固定的本地 URL 调用。

## 基本流程

```bash
npm i -g @clovapi/cli
clovapi auth login --provider codex
clovapi proxy start
```

代理启动后，可以把客户端指向：

```text
http://127.0.0.1:27483/codex/v1/responses
```

订阅登录态保存在本机，代理负责在请求上游时使用对应认证信息。

## 为什么用本地入口

- 客户端配置更稳定，不需要反复改 base URL。
- 请求日志可以按 API Key 聚合，方便看调用量和错误。
- Responses、Messages、Chat Completions 等格式可以在本地适配。

## 调试建议

如果请求失败，先检查三件事：

1. 代理是否正在运行。
2. 订阅是否仍处于登录状态。
3. 客户端路径是否使用 `/codex/v1/responses`。

桌面端的调用日志会显示入站请求、上游响应片段和错误信息，适合定位协议或认证问题。
