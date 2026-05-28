---
title: Reddit 都在聊：Claude Code 的 Opus / Sonnet / Haiku 怎么省钱路由？
description: 社区把主会话与子代理分到不同廉价模型；clovapi 用 profile + 本地代理统一切换，不必维护多端口路由器。
date: 2026-05-29
---

「用 DeepSeek 跑 Claude Code，账单降 90%」类帖子在 Reddit、Hacker News 和中文社区反复出现。技术细节几乎总是同一句：**Claude Code 会把请求分成 Opus（主循环）、Sonnet、Haiku（子代理/轻量步骤）**，若全走 Anthropic 标价，子代理也会很贵。

于是出现 free-claude-code、claude-code-router 等方案——按 tier 把流量导到 OpenRouter 免费模型、DeepSeek Flash、本地 Ollama。

## 社区方案在做什么

典型配置类似：

```
MODEL_OPUS=openrouter/qwen-...-free
MODEL_SONNET=deepseek/deepseek-chat
MODEL_HAIKU=ollama/llama3.1
```

代理在**每一次 HTTP 请求**里读模型名，再决定上游。这对「只服务 Claude Code」很有效，但：

- 配置属于代理项目，与 Codex / OpenCode 不共享。
- 换供应商要改代理 config，而不是 `clovapi switch` 一条命令。
- 多个代理同时运行时，tier 规则容易不一致。

## clovapi 的省钱思路：换 profile，而不是魔改 tier

clovapi 不内建「Opus→免费 / Haiku→本地」的硬编码表（避免隐藏魔法）。更直接的做法：

1. **`clovapi add --name deepseek-flash`** — 绑定廉价模型与网关。
2. **`clovapi switch --cli claude-code --vendor "Custom API" --model deepseek-chat`** — 整段 Claude Code 会话走该上游；代理按 Messages 形态转码。
3. 需要 Opus 级质量时 **`switch` 回官方 profile**（桌面端 OAuth 或 Anthropic API profile）。

子代理是否变便宜，取决于你选的**单一上游**是否在全流程中够快够稳。许多开发者反馈：DeepSeek V4 Flash 承担 80% 日常编码后，账单已足够低，不必再维护 tier 路由表。

## 何时你仍需要 tier 路由器

- 同一 session 内必须坚持「主模型 Opus 质量 + 子代理几乎免费」。
- 已投资 claude-code-router 的 `background` / `thinking` 分流规则。

这时可把路由器作为**其中一个 profile 的上游**（网关地址写进 `clovapi add`），而不是与 clovapi 并行起第二个代理。

## 实操建议（来自社区共识的收敛版）

| 目标 | 建议 |
|------|------|
| 大幅降本 | 默认 profile 指向 DeepSeek / 廉价 OpenRouter |
| 关键重构 | 临时 `switch` 到官方 Claude profile |
| 多 CLI | 用 clovapi 统一 profile，勿 per-CLI 改 env |
| 少运维 | 一个本地代理端口，删掉重复代理 |

## 延伸阅读

- [不用环境变量切换 Claude Code](/blog/switch-claude-code-api-without-env-vars)
- [别堆代理](/blog/stop-diy-proxy-sprawl-for-agent-cli)
- [DeepSeek 教程](/guides/claude-code-deepseek)
