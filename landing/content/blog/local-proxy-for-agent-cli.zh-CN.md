---
title: 为什么编程 Agent CLI 需要本地代理？
description: clovapi 以本地代理为核心：Agent 只连 localhost，由代理完成上游路由与 anthropic / openai-responses 等 API 形态转码。
date: 2026-05-20
---

Claude Code、Codex、OpenCode 等编程 Agent CLI 并不直接面向「任意第三方 API」设计。它们各自绑定特定的上游协议：Claude Code 走 Anthropic Messages，Codex 走 OpenAI Responses，OpenCode 常见为 Chat Completions。当你想切换到 DeepSeek、OpenRouter 或自建网关时，问题往往不是「有没有 API Key」，而是**协议形态不匹配**。

## 手动改环境变量的局限

常见做法是手动设置 `ANTHROPIC_BASE_URL`、`OPENAI_BASE_URL` 等环境变量，再祈祷上游兼容目标协议。这种方式有几个明显问题：

- 每个 CLI 的环境变量名、配置文件路径不同，切换成本高。
- 第三方网关的兼容层质量参差不齐，Claude Code 对 Messages API 的细节要求严格。
- 多个 profile（官方订阅 + 多个第三方）难以快速切换，容易留下脏配置。

## clovapi 的本地代理模型

clovapi 在 `switch` 时会把选中的 profile 下发到目标 CLI，同时启动**内置本地代理**。Agent 进程始终请求 `localhost`，由代理负责：

1. **上游路由** — 把请求转发到你保存的 Base URL 与 API Key。
2. **API 形态转码** — 按 CLI 自动选择 anthropic、openai-responses、gemini 等形态，无需你对照协议表。
3. **profile 隔离** — 用 `clovapi add` 保存多个上游，`clovapi switch` 一键切换。

这意味着 Agent 侧配置保持稳定，切换上游只改 clovapi profile，而不是逐个 CLI 手改 env。

## 与 API 网关的区别

传统 API 网关面向服务间流量，通常部署在远端。clovapi 的代理运行在**本机**，紧贴 Agent CLI 的配置写入点，专为「个人开发者切换 coding agent 上游」优化：轻量、离线可用、配置落在 `~/.config/clovapi`。

## 下一步

- 查看 [支持的 Agent 列表](/agents)
- 阅读 [Claude Code 接入第三方 API 教程](/guides/claude-code-third-party-api)
- 安装 CLI：`npm i -g @clovapi/cli`
