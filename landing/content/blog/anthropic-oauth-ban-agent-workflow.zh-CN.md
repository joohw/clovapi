---
title: Anthropic 封禁第三方 OAuth 之后，Agent 用户该怎么配 API？
description: 从 r/ClaudeAI 高票讨论出发：官方 CLI、API Key、换用 OpenCode/Codex，以及用 clovapi 合法管理多套上游。
date: 2026-05-27
---

2026 年初 Anthropic 收紧第三方工具对 Claude 订阅 OAuth 的滥用，r/ClaudeAI 等相关讨论帖获得数千 upvote。常见情绪是：「刚配好的 OpenClaw / 某 GUI 又不能用了」「$200/月 Max 要不要退」。冷静拆解后，社区里逐步形成几条**可长期执行**的路径。

## 讨论里反复出现的三类诉求

1. **还想用 Claude 订阅额度**，但不想折腾违规 OAuth 转发。
2. **愿意付 API 费**，希望第三方 Agent 稳定接 Anthropic Messages。
3. **干脆换模型/换 CLI**，用 OpenCode、Codex、DeepSeek 等，只要工作流别断。

clovapi 的定位是第 2、3 类的「配置层」：不替你破解 OAuth，而是把**已合法获得的凭据**（官方 OAuth 写入、API Key、第三方网关）整理成 profile，按 CLI `switch`。

## 路径 A：官方 Claude Code + 本地 profile

Anthropic 明确支持的路径仍是 **Claude Code CLI** 配合订阅或 API。clovapi 桌面端可完成 Claude / Codex 官方 OAuth，并把结果写入与 CLI 共享的 `profiles.json`。

适合：你接受「Claude 官方客户端体验」，只想快速切第三方 API 或团队网关。

```bash
clovapi switch --cli claude-code my-team-gateway
```

## 路径 B：API Key 进 OpenCode / 其他 CLI

不少帖子提到转向 OpenCode——75+ 提供商、可自托管模型。禁令之后，**用 API Key 而非订阅 OAuth** 是合规共识。

clovapi 对 OpenCode 写入全局 `opencode.jsonc`，并走本地代理做形态转码（见 [OpenCode 切换指南](/blog/switch-opencode-upstream-with-clovapi)）。

## 路径 C：同一套 profile，按天换 Agent

社区里另一种声音是：「Claude Code 界面简陋，OpenCode 更顺手，但 Codex 写补丁更强。」现实是很多人**按任务换 CLI**，而不是一辈子绑定一个。

clovapi 用一份 `profiles.json` 服务多 CLI：

```bash
clovapi list
clovapi switch --cli claude-code deepseek
clovapi switch --cli codex openrouter-prod
clovapi switch --cli opencode local-ollama
```

换的是「当前 Agent 吃哪条上游」，不是重装三套环境变量。

## 不建议继续做的事

- 把 Claude 订阅 OAuth token 灌进未授权的第三方壳（禁令针对的就是这类用法）。
- 为每个 CLI 维护一个手写 `export ANTHROPIC_*` 脚本，且彼此不同步。
- 堆七八个「仅支持 Claude Code」的独立代理，每个端口、每份配置各管各的（见 [下一篇：代理泛滥](/blog/stop-diy-proxy-sprawl-for-agent-cli)）。

## 延伸阅读

- [多 profile 管理](/blog/manage-multiple-api-profiles)
- [clovapi vs cc-switch](/compare/cc-switch)
- [Claude Code 第三方 API](/guides/claude-code-third-party-api)
