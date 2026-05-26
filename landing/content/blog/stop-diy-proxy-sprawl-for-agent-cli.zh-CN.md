---
title: 别为每个 Agent CLI 再写一个本地代理了
description: 社区里 Claude Code / Codex 代理项目泛滥；clovapi 用一套内置代理 + profile 切换覆盖多 CLI、多形态。
date: 2026-05-28
---

在 GitHub awesome 列表和 Reddit 相关帖里，**「Claude Code 代理」** 已成独立品类：DeepClaude、claude-code-router、codex-claude-proxy、CLIProxyAPI……各自默认端口、各自一份 `config.json`，功能高度重叠。

开发者吐槽也很一致：「装三个代理，开机五个 localhost 服务」「换 Codex 又要换一套 env」。

## 代理泛滥从哪来

每个 Agent CLI 只认一种「官方协议」：

| CLI | 期望协议 |
|-----|----------|
| Claude Code | Anthropic Messages |
| Codex | OpenAI Responses |
| OpenCode | 多种 provider 块 |

第三方网关往往只兼容其中一种。于是社区项目普遍做法是：**做一个 Anthropic 兼容的 localhost 服务**，让 Claude Code 以为在连官方 API。

问题是——你只解决了 Claude Code。切到 Codex 时，又要找「Responses 版」代理，再开一个新端口。

## clovapi 的做法：一个代理内核，多种形态

clovapi 在 `switch` 时启动**同一个** Go 代理进程（默认 `127.0.0.1:27483`），按目标 CLI 已写入的配置决定如何转码：

- 对 Claude Code：维护 Messages 语义。
- 对 Codex：维护 Responses 语义。
- 对 OpenCode：按 provider 类型映射。

上游只在 profile 里换 Base URL / Key，**不必**为每个 CLI 再起一个 Node/Python 代理。

```bash
clovapi add --name deepseek
clovapi switch --cli claude-code deepseek
# 同一 profiles.json
clovapi switch --cli codex openrouter-prod
```

## 和「路由器」项目的差异

一些路由器（如 claude-code-router）强项是**按请求类型**把 Opus/Sonnet/Haiku 分到不同模型，适合极致省钱。clovapi 的强项是：

- **多 CLI 统一配置**（Claude / Codex / OpenCode / OpenClaw / Hermes / Kimi）。
- **switch 写入各 CLI 官方配置文件**，而不只改 env。
- **桌面端 + CLI** 共用 `profiles.json`。

若你只需 Claude Code + 复杂模型路由，路由器仍值得试；若你每天在不同 Agent 间切换，维护一份 clovapi profile 通常更省心。

## 自检：你是否代理过剩

- 开机是否 >2 个「给 Agent 用的」localhost 代理？
- 换 CLI 是否要改不同端口？
- Codex 与 Claude Code 是否无法共用同一上游定义？

任一为是，可以考虑收敛到 clovapi 单路径，删掉重复代理。

## 延伸阅读

- [本地代理架构](/blog/local-proxy-for-agent-cli)
- [OAuth 禁令后的工作流](/blog/anthropic-oauth-ban-agent-workflow)
- [桌面端 vs CLI](/blog/desktop-app-vs-cli-workflow)
