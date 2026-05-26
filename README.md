[English](README.en.md) | 中文

# clovapi

**内置本地代理 · 轻松管理 Agent API**

**官网：** https://clovapi.com — [支持的 Agent](https://clovapi.com/agents) · [配置教程](https://clovapi.com/guides) · [Agent Skill](https://clovapi.com/skill)

**参考笔记：** [Harbor 与各 Agent 的 API 控制](docs/harbor-agents.zh.md) · [English](docs/harbor-agents.md) · [Agent 仓库索引（`ref/` 复刻）](docs/agent-repos.zh.md)

---

开源 CLI 与桌面客户端，以内置本地代理为核心：保存 upstream profile，`switch` 一键应用到 Claude Code、Codex、OpenCode 等 Agent；switch 后统一走 `localhost`，由代理完成上游路由与 API 形态转码。

流程：**`clovapi add --name …`**（保存并探测连通）→ **`clovapi switch --cli …`** 或交互式 **`clovapi switch`**（每次下发到单一 CLI）。

**Claude Code** 的环境变量写法与社区 **cc-switch** / **ccswitch** 一致（`env.ANTHROPIC_AUTH_TOKEN` + `ANTHROPIC_BASE_URL`）。

## 安装

```bash
npm i -g @clovapi/cli
clovapi --help
```

Homebrew、winget、install.sh 与从源码构建见 **[switcher/README.zh.md](switcher/README.zh.md)**。

## 常用命令

| 命令 | 说明 |
|------|------|
| `clovapi list` | 展示 profiles 与 CLI 矩阵（别名 `profiles` / `ls`） |
| `clovapi add --name NAME` | 保存上游 profile 并测连通（`set` / `new`） |
| `clovapi switch [--cli KIND]` | 将 profile 应用到某一 CLI（`use`） |
| `clovapi proxy` | 内置本地代理（`start` / `status` / `config`） |
| `clovapi reset` | 清空全部 profile 与绑定（`--yes`） |

## 文档

| | |
|---|---|
| 完整说明（中文） | [switcher/README.zh.md](switcher/README.zh.md) |
| Full docs (English) | [switcher/README.md](switcher/README.md) |
| 参考笔记索引 | [docs/README.md](docs/README.md) |
| 桌面端 | [electron/README.md](electron/README.md) |

## 仓库结构

| 目录 | 说明 |
|------|------|
| [`switcher/`](switcher/) | clovapi CLI（Go） |
| [`electron/`](electron/) | 桌面端（本地代理 + GUI） |
| [`landing/`](landing/) | 官网 [clovapi.com](https://clovapi.com) |
| [`docs/`](docs/) | Harbor / Agent 参考笔记 |
