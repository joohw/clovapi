---
title: 不用改环境变量，切换 Claude Code 的 API 上游
description: 用 clovapi add 保存 profile、switch 写入 Claude Code 配置，经本地代理接入 DeepSeek、OpenRouter 等第三方 API。
date: 2026-05-22
---

很多开发者第一次给 Claude Code 接第三方 API 时，会从搜索「ANTHROPIC_BASE_URL 怎么改」开始。环境变量能跑通一次，但**不适合作为日常切换方案**：多个上游、官方订阅与第三方混用、团队协作时，手动 env 很快变得不可维护。

## 推荐工作流：add → switch

clovapi 把上游抽象为 **profile**，用两条命令完成闭环：

```bash
npm i -g @clovapi/cli
clovapi add --name deepseek
clovapi switch --cli claude-code --vendor "Custom API" --model deepseek-chat
```

`add` 在持久化前会探测连通性；`switch` 把 profile 写入 Claude Code 所需配置，并经由本地代理转发请求。Agent 侧始终连 localhost，无需你记住 Anthropic 环境变量组合。

## 常见上游示例

| 场景 | add 时注意 | switch 后 |
| --- | --- | --- |
| DeepSeek | Base URL、模型 ID（如 deepseek-chat） | Claude Code 走 Messages 形态，代理转码至 DeepSeek |
| OpenRouter | OpenRouter Key 与模型 slug | 同上，经代理路由 |
| 官方 Claude 订阅 | 选择官方 profile 类型 | 与第三方 profile 同样一键 switch |

更细的分步说明见 [Claude Code + DeepSeek 教程](/guides/claude-code-deepseek) 与 [OpenRouter 教程](/guides/claude-code-openrouter)。

## 多 profile 切换

你可以同时保存 `official`、`deepseek`、`openrouter-prod` 等 profile。需要换上游时：

```bash
clovapi switch --cli claude-code --vendor "Custom API" --model <openrouter-model-slug>
```

不需要卸载 Claude Code、不需要清理 shell profile 里的 export，也不会误把 Key 提交进 dotfiles。

## 和 cc-switch 怎么选？

若你需要 MCP/Skills 跨 CLI 同步或更重的桌面运维面板，可以了解 [cc-switch 对比](/compare/cc-switch)。若核心诉求是**轻量 CLI + 本地代理转码 + 快速 switch**，clovapi 更贴合 Agent 开发者的日常使用。

## 立即尝试

- [Claude Code Agent 页](/agents/claude-code)
- [全部配置教程](/guides)
- 桌面客户端：见首页下载区
