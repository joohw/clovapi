---
title: 在 Cursor 里用 Agent，其实不用装插件
description: 高赞讨论：终端里 export BASE_URL 即可；clovapi switch 写入配置，比手写 env 更持久。
date: 2026-05-31
---

一篇在 DEV / Reddit 圈子广泛转发的观点很直白：**Cursor 集成 Agent 的捷径不是扩展，而是终端 + 环境变量。** Claude Code 认 `ANTHROPIC_BASE_URL`，Codex 认自己的配置；在 Cursor 内置终端里 `export` 一下，就能让请求走 localhost 代理。

评论区跟帖则抱怨：「env 一关终端就丢」「换项目又要重 export」「Codex 不吃 Anthropic 的变量」。

## 社区共识对的一半

对的部分：

- IDE 插件不是必需；**网络路径**才是集成点。
- 本地反向代理可以透明转码，Cursor 无感知。
- `claude` 命令在 IDE 终端里跑，体验与外部终端一致。

## 社区痛点：env 不可持久

常见翻车：

1. 新开终端 tab 忘记 export，以为代理坏了。
2. 团队文档写「请把 BASE_URL 设为 xxx」，新人照做仍失败（路径/端口/version 漂移）。
3. 同时用 Claude Code 与 Codex，变量名不同，脚本越来越长。

## clovapi：把「BASE_URL 技巧」变成配置文件

`switch` 直接写入各 CLI 官方认可的配置：

- Claude Code → `~/.claude/settings.json` 等；
- Codex → `~/.codex/config.toml`；
- OpenCode → 全局 `opencode.jsonc`。

并启动与 CLI 同源的 **Go 代理**，默认 `http://127.0.0.1:27483`。你在 Cursor 终端里只需：

```bash
clovapi switch --cli claude-code my-profile
claude
```

无需每次 `export ANTHROPIC_BASE_URL=...`（除非你想覆盖）。新开 tab、重启 Cursor，只要 profile 未改，配置仍在。

## 与「三行 launcher 脚本」对比

社区常分享 `pcc` 一类包装：

```bash
export ANTHROPIC_BASE_URL=http://127.0.0.1:8077
exec claude "$@"
```

这适合单一代理、单一 CLI。clovapi 适合：

- 多 profile（官方 / DeepSeek / 团队网关）；
- 多 CLI（Claude + Codex + OpenCode）；
- 桌面端可视化切换。

## 实操清单（Cursor 用户）

1. 安装 clovapi CLI 或桌面端（首页下载）。
2. `clovapi add` 保存上游，`switch` 到目标 CLI。
3. Cursor 内打开终端，直接运行 `claude` / `codex` / `opencode`。
4. 确认代理已启：`clovapi proxy status` 或在桌面端查看。

## 延伸阅读

- [本地代理原理](/blog/local-proxy-for-agent-cli)
- [别堆多个代理](/blog/stop-diy-proxy-sprawl-for-agent-cli)
- [Claude Code 第三方 API](/guides/claude-code-third-party-api)
