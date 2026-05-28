---
title: 用 profile 管理多套 Agent API，告别环境变量地狱
description: clovapi add 保存上游、switch 按 CLI 下发；官方订阅与多个第三方 API 共存于 profiles.json，一键切换。
date: 2026-05-24
---

日常开发里，你往往同时面对：**Claude Code 官方订阅**、**Codex 团队 Key**、**DeepSeek 备用线路**、**OpenRouter 试用模型**。若每种组合都靠 shell `export` 或手改各 CLI 配置文件，切换一次就要回忆「上次改的是哪个文件」。

## profile 是什么

在 clovapi 里，一个 **profile** 描述一套上游：Base URL、凭据、默认模型、API 形态等。它们集中在 `~/.config/clovapi/profiles.json`（Windows 为 `%APPDATA%\clovapi\profiles.json`），与具体 CLI 解耦。

典型结构：

- `profiles`：所有已保存的上游列表。
- `active`：每个 CLI 最近一次 `switch` 使用的 profile 名。

因此「DeepSeek 配置」只存一份，既可以 `switch --cli claude-code --vendor "Custom API" --model deepseek-chat`，也可以在准备好 Codex 适配后 `switch --cli codex --vendor "Custom API" --model deepseek-chat`（若上游兼容）。

## 工作流：先 add，再按 CLI switch

```bash
clovapi add --name deepseek
clovapi add --name openrouter-prod
clovapi add --name claude-official

clovapi switch --cli claude-code --vendor "Claude Subscription" --model claude-sonnet-4-20250514
clovapi switch --cli codex --vendor "Custom API" --model <responses-model-id>
```

`add` 在写入前会探测连通性，避免保存无效 Key。`switch` 只影响**一个** CLI——不会误改 Codex 当你只想换 Claude Code。

查看当前状态：

```bash
clovapi list
```

## 何时重置某个 CLI

若要把某个 Agent 恢复为「不经过 clovapi 中继」的默认配置，可交互 `clovapi switch` 选择 **仅重置该 CLI**，或查阅文档中的 reset 选项。适合临时退回官方客户端默认行为，而不删除已保存的 profile。

## 桌面端与 CLI 同步

ClovAPI Switcher 桌面客户端与 CLI 共用 `profiles.json`。在 UI 里新增或测试 profile 后，终端里 `clovapi list` 立即可见；反之亦然。团队场景可把 profile 文件纳入私有同步（注意勿提交密钥）。

## 延伸阅读

- [本地代理架构说明](/blog/local-proxy-for-agent-cli)
- [Claude Code 切换第三方 API](/blog/switch-claude-code-api-without-env-vars)
- [全部配置教程](/guides)
