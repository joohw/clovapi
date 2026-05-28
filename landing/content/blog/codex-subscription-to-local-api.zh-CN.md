---
title: 把 Codex 订阅一键转成本地 API
description: 用 clovapi 保存 Codex 官方订阅或第三方上游，switch 后由本地代理把 OpenAI Responses 形态请求路由到真实上游。
date: 2026-05-23
---

OpenAI Codex CLI 默认走官方 Responses API。若你想在**保留 Codex 使用体验**的前提下，把流量切到自建网关、团队代理，或与其他 Agent 共用同一套 profile 管理，手动改 `~/.codex/config.toml` 很容易留下半套配置。

## 为什么 Codex 也需要本地代理

Codex 绑定的是 **openai-responses** 形态，不是通用 Chat Completions。很多第三方网关只兼容 `/v1/chat/completions`，直接改 Base URL 往往会在 tool call、流式字段上踩坑。clovapi 在 `switch --cli codex` 时：

1. 合并 Codex 的 `config.toml`（provider、model、experimental bearer 等字段）。
2. 启动内置本地代理，Codex 进程只连 `localhost`。
3. 由代理把 Responses 形态请求转码并转发到你保存的上游。

Agent 侧配置路径稳定，换上游只动 clovapi 的 vendor/model 绑定。

## 推荐命令

```bash
npm i -g @clovapi/cli
clovapi add --name codex-official
clovapi switch --cli codex --vendor "Codex Subscription" --model gpt-5.5
```

`add` 会探测连通性；若你接入第三方，在交互流程里填写 Base URL、API Key 与模型 ID 即可。官方订阅与第三方 API 都以 **vendor/model 绑定** 区分，切换时：

```bash
clovapi switch --cli codex --vendor "Custom API" --model <responses-model-id>
```

## 与 Claude Code 共用 profile 库

`profiles.json` 里保存的是**上游**而非某个 CLI 独占。你可以给 Claude Code 绑定 `Custom API/deepseek-chat`，给 Codex 绑定 `Custom API/<responses-model-id>`。桌面端与 CLI 读写同一份配置，适合在 GUI 里点选、在终端里脚本化。

## 延伸阅读

- [Codex Agent 页](/agents/codex)
- [Codex 第三方 API 教程](/guides/codex-third-party-api)
- [多 profile 管理](/blog/manage-multiple-api-profiles)
