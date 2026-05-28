---
title: 用 clovapi 切换 OpenCode 的上游 API
description: OpenCode 全局配置与多种 API 形态并存；clovapi switch 写入 config 并由本地代理完成 anthropic / openai / gemini 转码。
date: 2026-05-26
---

[OpenCode](https://opencode.ai) 通过全局配置文件加载模型与 provider，路径因系统而异，且存在 `opencode.jsonc`、`opencode.json`、`config.json` 的合并优先级。手动改 JSON 容易与项目级配置冲突，切换上游时也不够快。

## clovapi 如何写入 OpenCode

执行 `clovapi switch --cli opencode <VENDOR/MODEL>` 时，clovapi 会：

1. 定位 OpenCode **全局**配置目录（Windows 优先 `%AppData%\opencode\`，否则 `~/.config/opencode/`）。
2. 在 `opencode.jsonc` / `opencode.json` / `config.json` 中选择已有文件或创建 `opencode.jsonc`。
3. 按 profile 的 API 形态写入 `provider` 与顶层 `model`（如 `anthropic/…`、`clovapi/…`、`gemini/…`）。
4. 启动本地代理，OpenCode 请求经 localhost 转发。

若切换后「不生效」，先检查仓库内是否有项目级 `opencode.json` 覆盖了全局设置，或是否设置了 `OPENCODE_CONFIG` 环境变量。

## 快速上手

```bash
npm i -g @clovapi/cli
clovapi add --name my-gateway
clovapi switch --cli opencode "Custom API/<model-id>"
```

`add` 阶段选择或确认 API 形态（Anthropic 兼容、OpenAI 兼容、Gemini 等），`switch` 会映射到 OpenCode 的 provider 结构。多个 profile 可并存，切换只需改 profile 名。

## 与其他 CLI 并列管理

OpenCode 只是 clovapi 支持的 CLI 之一。同一台机器上你还可以：

```bash
clovapi switch --cli claude-code --vendor "Custom API" --model deepseek-chat
clovapi switch --cli codex --vendor "Custom API" --model <responses-model-id>
clovapi switch --cli opencode "Custom API/<model-id>"
```

`clovapi list` 会展示各 CLI 当前绑定的 profile 与 API 形态矩阵。

## 延伸阅读

- [OpenCode Agent 页](/agents/opencode)
- [本地代理如何工作](/blog/local-proxy-for-agent-cli)
- [多 profile 管理](/blog/manage-multiple-api-profiles)
