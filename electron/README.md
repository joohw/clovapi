# ClovAPI Desktop Client (Minimal)

Electron UI for the **clovapi** switcher CLI. Profile data is stored in the same file as the CLI (`profiles.json`), not in browser `localStorage`.

## Config location (shared with CLI)

| OS | Path |
|----|------|
| Windows | `%APPDATA%\clovapi\profiles.json` |
| macOS / Linux | `~/.config/clovapi/profiles.json` (or `$XDG_CONFIG_HOME/clovapi/profiles.json`) |

On first launch, if `profiles.json` is empty and legacy `localStorage` (`clovapi-webui-state-v1`) exists, the app migrates once into `profiles.json`.

## Features

- **客户端管理**：为已安装的 CLI 选择「官方订阅」或第三方 API，并「应用」到本地配置
  - Claude Code / Codex：清除 clovapi 中继，使用 OAuth 凭据
  - Kimi Code：**Claude Code 订阅** — 读取 Claude OAuth 凭据，自动生成 profile 并写入 Kimi `config.toml`
- **API 管理**：**仅四种固定供应商**（`claude-code`、`codex`、`ollama`、`custom-api`），不可动态注册新供应商；自定义 API 仅手动添加模型（与 `clovapi set` 同一 `profiles.json`）
- **本地代理**：Electron 在主进程拉起 **Go `clovapi proxy serve`**（与 CLI 同源），监听 `profiles.json` 中的 `proxy.host` / `proxy.port`（默认 `http://127.0.0.1:27483`）。请求路由与 Go 内核一致：`http://127.0.0.1:{port}/{providerId}/{modelId}/{apiStyle}/v1/…`
- **协议与解码**：全部由 **Go `switcher/internal/proxy` + protocol** 持有；Electron 不写平行 JS proxy
- **测试**：`npm test`（进程管理参数构造、`/health` 外部代理分支、ingress URL 分段编码）
- Bind each installed CLI to a profile (`active` map in `profiles.json`)
- **应用** runs `clovapi switch --cli <kind> <name>` to write Codex / OpenCode / etc. configs
- **测试** runs `clovapi test <name>`

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
