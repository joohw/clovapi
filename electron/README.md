# ClovAPI Desktop Client (Minimal)

Electron UI for the **clovapi** core CLI. Profile data is stored in the same file as the CLI (`profiles.json`), not in browser `localStorage`.

## Config location (shared with CLI)

| OS | Path |
|----|------|
| Windows | `%APPDATA%\clovapi\profiles.json` |
| macOS / Linux | `~/.config/clovapi/profiles.json` (or `$XDG_CONFIG_HOME/clovapi/profiles.json`) |

On first launch, if `profiles.json` is empty and legacy `localStorage` (`clovapi-webui-state-v1`) exists, the app migrates once into `profiles.json`.

## Features

- **Agent 管理**：为已安装的 CLI 选择「官方订阅」或第三方 API，并「应用」到本地配置
  - Claude Code / Codex：清除 clovapi 中继，使用 OAuth 凭据
  - Kimi Code：**Claude Subscription** — 读取 Claude OAuth 凭据，自动生成 profile 并写入 Kimi `config.toml`
- **API 管理**：**仅四种固定供应商**（`claude-code`、`codex`、`ollama`、`custom-api`），不可动态注册新供应商；自定义 API 仅手动添加模型（与 `clovapi add` 同一 `profiles.json`）
- **本地代理**：Electron 在主进程调用 **Go `clovapi proxy start`**（与 CLI 同源，后台 daemon），监听 `profiles.json` 中的 `proxy.host` / `proxy.port`（默认 `http://127.0.0.1:27483`）。请求路由与 Go 内核一致：`http://127.0.0.1:{port}/{providerId}/{modelId}/{apiStyle}/v1/…`
- **协议与解码**：全部由 **Go `core/internal/proxy` + protocol** 持有；Electron 不写平行 JS proxy
- **测试**：`npm test`（进程管理参数构造、`/health` 外部代理分支、ingress URL 分段编码）
- Bind each installed CLI to a profile (`active` map in `profiles.json`)
- **应用** runs `clovapi switch --cli <kind> <name>` to write Codex / OpenCode / etc. configs

## UI

Renderer is **Svelte 5 + Vite** under `ui/`. Production build output: `ui-dist/`.

API presets: `preset/api-presets.template.json` (bundled at build time).

## Start

From repository root:

```bash
cd electron
npm install
npm run dev
```

Development runs Vite on port 5173 and Electron with `ELECTRON_DEV=1`.

Production-style (built UI):

```bash
npm run start
```

## Default command

The default command is:

```bash
clovapi --help
```

Change it in the UI to run any local command-line tool.

## Release

Pushes to `main` that touch **`electron/**` only** trigger `.github/workflows/release-desktop.yml` when R2 secrets are configured (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`).

- R2 tag defaults to `electron/package.json` `version` (for example `v0.1.0`)
- Manual run: **release-desktop** workflow with optional `version` input
- Bundled Go CLI is built from `core/` at checkout HEAD; core-only commits do not trigger this workflow

`release-switcher` (`v*` tags) covers core CLI / npm / winget only — not the Electron shell.
