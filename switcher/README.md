# clovapi — per-CLI API profiles → local CLIs

**Language / 语言:** English · [中文](README.zh.md)

---

Small cross-platform CLI that stores **CLI-bound upstream API profiles** (base URL, key, `api_style`, model) and **applies** them to coding-agent binaries you use — Claude Code, Codex, OpenCode, OpenClaw, Hermes, Kimi Code CLI, …  

Flow: **`clovapi set --name …`** (save + probe) → **`clovapi switch --cli …`** or interactive **`clovapi switch`** (apply one CLI at a time).

For **Claude Code**, env wiring matches community **cc-switch** / **ccswitch**; see **Compared with community cc-switch / ccswitch** below.

## Commands

| Command | Description |
|--------|-------------|
| `clovapi profiles` | Show saved profiles, CLI ↔ API-style matrix, and last-applied CLIs (aliases: **`list`**, **`ls`**) |
| `clovapi set --name NAME` | Save one upstream profile (CLI is chosen at switch time); connectivity test before persist (`--name` required, aliases: **`add`**, **`new`**) |
| `clovapi remove <name>` | Remove one saved profile (aliases: **`rm`**, **`delete`**) |
| `clovapi switch [--cli KIND] [PROFILE_NAME]` | Apply one profile to one CLI. Interactive flow: choose CLI first, then choose a profile for that CLI, or **`0)` reset this CLI only**. Alias **`use`** |
| `clovapi test [PROFILE_NAME]` | Test connectivity for all saved profiles, or one profile by name |
| `clovapi reset` | Clear all saved profiles and bindings (`--yes` / `-y` skips prompt) |

## Build

```bash
cd switcher
go build -o clovapi ./cmd/clovapi
```

## Install (package managers)

### npm

```bash
npm i -g @clovapi/cli
clovapi version
```

### Homebrew (tap formula)

```bash
brew install joohw/homebrew-tap/clovapi
```

### winget

```powershell
winget install Clovapi.Clovapi
```

From repo root:

```bash
npm run switcher:build   # writes switcher/clovapi (or clovapi.exe on Windows)
npm run switcher:test
```

## Test

```bash
cd switcher && go test ./...
```

## Config location

- **Unix** (macOS/Linux): `$XDG_CONFIG_HOME/clovapi` or `~/.config/clovapi`
- **Windows**: `%APPDATA%\clovapi`

State file: `profiles.json` (0600). It stores **`profiles`** (all saved rows) and **`active`** (last applied profile name per CLI).

## API styles & CLI matrix

Your **single `api_style`** must match each CLI you apply to:

| CLI | `claude` | `openai-chat` | `openai-responses` | `gemini` |
|-----|----------|----------------|---------------------|----------|
| `claude-code` | yes | no | no | no |
| `codex` | no | no | yes | no |
| `opencode` | yes | yes | yes | yes |
| `openclaw` | yes | yes | yes | yes |
| `hermes` | yes | yes | yes | yes |
| `kimi-code` | yes | yes | yes | yes |

`clovapi switch` always targets a single CLI. Use `--cli` for non-interactive scripts; `switch --cli` rejects a mismatching style.

## Apply behavior (summary)

- **claude-code** + `claude`: writes `~/.claude/settings.json` with **`env.ANTHROPIC_AUTH_TOKEN`** and **`ANTHROPIC_BASE_URL`** (same pattern as ccswitch). **`ANTHROPIC_API_KEY` is removed** from `env` so Claude Code does not show “Auth conflict: Both a token and an API key are set”.
- **codex** + `openai-responses`: merges `~/.codex/config.toml` — sets `[model_providers.clovapi-relay]` (`base_url`, `wire_api`, `experimental_bearer_token`), `model_provider = "clovapi-relay"`, and top-level **`model`** from the saved profile.
- **opencode** + any supported style: matches [OpenCode config loading](https://opencode.ai/docs/config) — **global** files under `~/.config/opencode/` (Windows: `%AppData%\opencode\` first, then `~/.config\opencode\`) are **merged** in order **`config.json` → `opencode.json` → `opencode.jsonc`** (later wins on conflicts). clovapi **writes the same file OpenCode edits** (`globalConfigFile` in upstream): first existing among **`opencode.jsonc`**, **`opencode.json`**, **`config.json`**, or creates **`opencode.jsonc`** if none exist — so new settings override legacy `config.json`. **Anthropic**-shaped gateways: `provider.anthropic.options` + `model` `anthropic/…`. **OpenAI**-shaped gateways: **`provider.clovapi`** + **`npm`**, `options`, `models`, top-level **`model`** `clovapi/…`. **Gemini** relay: `provider.gemini` + `model` `gemini/…`. **Project** `opencode.json` / `.opencode/` still override globals; if switching “does nothing”, check the repo’s project config or `OPENCODE_CONFIG` / `OPENCODE_CONFIG_CONTENT`. Optional **`CLOVAPI_SWITCHER_OPENCODE_DIR`** forces the global config directory (tests use this).
- **openclaw** + any supported style: merges **`~/.openclaw/openclaw.json`** (override with **`OPENCLAW_CONFIG_PATH`**): `models.mode=merge`, **`models.providers.clovapi`** (`baseUrl`, `apiKey`, `api` = `anthropic-messages` \| `openai-completions` \| `openai-responses` \| `google-generative-ai`), **`agents.defaults.model.primary`** `clovapi/<model-id>`. File must be **valid JSON** for merge (JSON5 comments are not parsed).
- **hermes** + any supported style: merges **`~/.hermes/config.yaml`** — `model.default`, `model.provider` (`anthropic` \| `custom` \| `gemini`), `model.base_url`, `model.api_key`.
- **kimi-code** + any supported style: merges **`~/.kimi/config.toml`** — `default_model`, **`[providers.clovapi]`** (`type` maps from api-style), **`[models.<id>]`** with `provider = "clovapi"` and `model` from the profile.

**cc-switch / ccswitch** only target Claude Code JSON; OpenCode / OpenClaw / Hermes / Kimi are **clovapi-only** adapters (aligned with each upstream’s docs).

Paths expand correctly on Windows (user profile / AppData).

## Compared with community cc-switch / ccswitch (“cc-switcher”)

**Claude Code path:** clovapi follows the same **credentials shape** as [huangdijia/ccswitch](https://github.com/huangdijia/ccswitch) / [HoBeedzc/cc-switch](https://github.com/HoBeedzc/cc-switch): **`env.ANTHROPIC_AUTH_TOKEN`** (+ **`ANTHROPIC_BASE_URL`**), **no** `ANTHROPIC_API_KEY` (avoids Claude Code “Auth conflict”). **`settings.json`** is merged (other top-level keys kept); **`model`** + **`env.ANTHROPIC_*_MODEL`** from the applied binding.

**Extras:** clovapi applies the **same upstream settings** across **Codex**, **OpenCode**, **OpenClaw**, **Hermes**, and **Kimi Code CLI** — outside typical npm cc-switch scope.

### Command aliases (muscle memory from cc-switch / ccswitch)

| clovapi | Alias(es) | Similar to |
|---------|-----------|------------|
| `profiles` | `list`, `ls` | `cc-switch list`, `ccswitch list` |
| `set` | `add`, `new` | One-shot save of upstream binding |
| `switch [--cli …]` | `use …` | Apply one saved profile into one tool config |
| `remove NAME` | `rm`, `delete` | Delete one saved profile |

### Where state lives

| Tool | Stored profiles |
|------|-----------------|
| [cc-switch](https://github.com/HoBeedzc/cc-switch) | `~/.claude/profiles/*.json` + `.current` |
| [ccswitch](https://github.com/huangdijia/ccswitch) | `~/.ccswitch/ccs.json` |
| **clovapi** | `%APPDATA%\clovapi\profiles.json` (Windows) / `~/.config/clovapi/profiles.json` (Unix) — `profiles` array + `active` map |

`go test ./...` in this module passes; real upstream calls need your key locally.

## Release pipeline

`switcher` is released from a single source of truth: GitHub Releases.

- Tag `vX.Y.Z` to trigger `.github/workflows/release-switcher.yml`.
- `switcher/.goreleaser.yaml` builds darwin/linux/windows archives and `checksums.txt`.
- Release workflow can upload archives, `checksums.txt`, and `latest.txt` to Cloudflare R2 (when R2 secrets are set).
- npm package (`switcher/npm`) prefers the R2 mirror at install time, then falls back to GitHub Releases.
- Homebrew formula is updated through GoReleaser to `joohw/homebrew-tap` when `HOMEBREW_TAP_GITHUB_TOKEN` is set.
- winget submit is driven by `wingetcreate` when `WINGET_CREATE_TOKEN` is set.

Cloudflare R2 secrets used by workflow:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_ARTIFACT_PREFIX` (optional, defaults to `clovapi`)

## DeepSeek + Claude Code (Anthropic-compatible)

Use API style **`claude`** and Anthropic base URL from DeepSeek docs:

- **Base URL:** `https://api.deepseek.com/anthropic`
- **API key:** your DeepSeek key (prefer env `DEEPSEEK_API_KEY` or `CLOVAPI_API_KEY`, do not commit keys)
- **Model (required):** e.g. `deepseek-v4-flash` or `deepseek-v4-pro` via `--model` (also prompted if omitted)

Connectivity check (same as `clovapi test`): **`POST …/v1/messages`** with your model (Anthropic headers). If that returns **404** on the Messages path, **`set` / `test` retry** **`POST https://<same-host>/v1/chat/completions`** with **Bearer** the same key (unified gateways).

```bash
clovapi set --api-style claude \
  --name deepseek-claude \
  --base-url https://api.deepseek.com/anthropic \
  --model deepseek-v4-flash \
  --api-key "$DEEPSEEK_API_KEY"

clovapi switch --cli claude-code
```

## DeepSeek + Codex (OpenAI-compatible)

Use **`codex`** + **`openai-responses`** (legacy **`openai`** is accepted and stored as responses). DeepSeek’s OpenAI base URL is **`https://api.deepseek.com`** (listing uses `GET /v1/models`). For Codex `model_providers.*.base_url`, include the **`/v1`** suffix to match OpenAI-style routing:

```bash
export DEEPSEEK_API_KEY="..."   # do not paste keys into chat logs

clovapi set --api-style openai-responses \
  --name deepseek-codex \
  --base-url https://api.deepseek.com/v1 \
  --model deepseek-v4-pro \
  --api-key "$DEEPSEEK_API_KEY"

clovapi switch --cli codex
```

`switch` writes `~/.codex/config.toml` with provider **`clovapi-relay`**, sets **`model`** from the binding, and points **`model_provider`** at that block.

### Still seeing 401 or auth conflict?

After **`go build`**, run **`clovapi switch --cli claude-code`** again (with **`clovapi set`** already saved). Open **`%USERPROFILE%\.claude\settings.json`**: you should see **`env.ANTHROPIC_AUTH_TOKEN`** (and **`ANTHROPIC_BASE_URL`**) but **no `env.ANTHROPIC_API_KEY`**. Remove duplicate credentials from **system/user environment variables** if you set them globally (`setx` / System Properties).
