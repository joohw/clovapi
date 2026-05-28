---
title: 桌面端还是 CLI？按场景选择 ClovAPI 工作流
description: ClovAPI Switcher 与 clovapi CLI 共用 profiles.json；GUI 适合浏览与 OAuth，CLI 适合脚本与 CI。
date: 2026-05-25
---

clovapi 提供两种入口：**终端 CLI**（`npm i -g @clovapi/cli`）与 **ClovAPI Switcher 桌面客户端**（macOS / Windows）。它们不是两套系统，而是同一套 Go 内核与配置文件的两个界面。

## 共用同一份配置

无论桌面端还是 CLI，profile 与代理设置都写在：

- macOS / Linux：`~/.config/clovapi/profiles.json`
- Windows：`%APPDATA%\clovapi\profiles.json`

在桌面端保存的 API profile，终端里 `clovapi list` 可见；在 CLI 里 `switch` 的结果，桌面端刷新后也会反映到「应用」按钮与代理状态。内置本地代理由同一条 `clovapi proxy` 命令驱动。

## 适合用桌面端的场景

- **第一次配置**：图形化选择 CLI、绑定官方订阅（Claude / Codex OAuth）、测试连通性。
- **管理多个 profile**：列表浏览、编辑 vendor 模型、查看代理调用日志与系统日志。
- **不熟悉命令行**：一键「应用」到目标 Agent，减少记路径与环境变量。

首页提供 macOS / Windows 安装包下载，安装后即可使用，无需单独安装 CLI（安装包内已捆绑 `clovapi` 可执行文件）。

## 适合用 CLI 的场景

- **脚本与自动化**：在 CI、devcontainer 或 SSH 机器上 `clovapi switch --cli codex --vendor "Custom API" --model <responses-model-id>`。
- **快速切换**：已熟悉 vendor 与 model ID 时，一条命令比打开 GUI 更快。
- **与现有终端工作流共存**：配合 tmux、Makefile、`clovapi update` 自更新等。

安装：

```bash
npm i -g @clovapi/cli
clovapi add --name prod
clovapi switch --cli claude-code --vendor "Custom API" --model <model-id>
```

## 可以混用

常见做法是：桌面端完成 OAuth 与首次 `add`，日常在终端 `switch`；或在服务器只用 CLI，在笔记本用桌面端查看日志。避免在两边**同时**改同一 profile 的未保存编辑即可。

## 延伸阅读

- [Codex 订阅转本地 API](/blog/codex-subscription-to-local-api)
- [多 profile 管理](/blog/manage-multiple-api-profiles)
- [支持的 Agent 列表](/agents)
