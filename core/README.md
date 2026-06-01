English | [中文](README.zh.md)

# clovapi — per-CLI API profiles → local CLIs

**Website / 官网:** https://clovapi.com — [agents](https://clovapi.com/agents) · [guides](https://clovapi.com/guides) · [Agent Skill](https://clovapi.com/skill)

---

Small cross-platform CLI that stores **CLI-bound upstream API profiles** (base URL, key, `api_style`, model) and **applies** them to coding-agent binaries you use — Claude Code, Codex, OpenCode, OpenClaw, Hermes, Kimi Code CLI, …  

Flow: **`clovapi add --name …`** (save + probe) → **`clovapi switch --cli …`** or interactive **`clovapi switch`** (apply one CLI at a time).

For **Claude Code**, env wiring matches community **cc-switch** / **ccswitch**; see **Compared with community cc-switch / ccswitch** below.

## Commands

| Command | Description |
|--------|-------------|
| `clovapi list` | Show saved profiles and active CLI bindings (alias: **`ls`**) |
| `clovapi profiles` | Load/save/test profiles and vendor helpers for scripts and the desktop UI (see below) |
| `clovapi add --name NAME` | Save one upstream profile (CLI is chosen at switch time); connectivity test before persist (`--name` required, aliases: **`set`**, **`new`**) |
| `clovapi remove <name>` | Remove one saved profile (aliases: **`rm`**, **`delete`**) |
| `clovapi switch [--cli KIND] [VENDOR/MODEL]` | Apply a provider/model binding to one CLI (`--provider` + `--model`, `--vendor` + `--model`, or interactive). Alias **`use`**. Add **`--json`** for machine-readable output |
| `clovapi auth` | Claude/Codex subscription OAuth (`status`, `login`, `logout`; **`--json`** on each) |
| `clovapi proxy` | Run and inspect the built-in local proxy (`start`, `stop`, `status`, `health`, `config`, `logs`, …; **`--json`** on `status` / `health`) |
| `clovapi reset` | Clear all saved profiles and bindings (`--yes` / `-y` skips prompt) |

### `clovapi profiles` (JSON API)

Subcommands mirror what the desktop app and Electron shell call. Pass **`--json`** for structured stdout (stdin JSON for `save`):

| Subcommand | Description |
|------------|-------------|
| `load --json` | Read normalized `profiles.json` (vendors, `active`, proxy bind) |
| `save --json` | Merge payload from stdin and persist |
| `test --json` | Probe a provider/model via the local proxy (`--provider`, `--model`, optional `--cli`, `--port`) |
| `list-models --vendor NAME --json` | Fetch and merge models for one vendor |
| `usage --vendor NAME --json` | Query upstream quota/balance for one API vendor |
| `catalog --json` | Fixed provider registry and model-adapter catalog |

Legacy **`clovapi desktop profiles|vendor|auth …`** remains for older scripts; prefer the top-level commands above.

Script examples:

```bash
clovapi profiles load --json
clovapi profiles save --json < payload.json
clovapi switch --cli opencode --provider custom-api --model my-model --json
clovapi auth status --json
clovapi proxy status --json
```

## Build

```bash
cd core
go build -o clovapi ./cmd
```

## Install (package managers)

### npm

```bash
npm i -g @clovapi/cli
clovapi --help
```

The npm package is the recommended shell entrypoint. It installs a lightweight `clovapi` launcher on your PATH and keeps the real core binary in `~/.config/clovapi/bin/clovapi`, the same location used by `clovapi update` and the desktop app.

From repo root:

```bash
npm run core:build   # writes core/clovapi (or clovapi.exe on Windows)
npm run core:test
```

## Test

```bash
cd core && go test ./...
```

## Config location

- **Unix** (macOS/Linux): `$XDG_CONFIG_HOME/clovapi` or `~/.config/clovapi`
- **Windows**: `%APPDATA%\clovapi`

State file: `profiles.json` (0600). It stores **`profiles`** (vendor rows and models), **`active`** (per CLI: `provider_id` + `model_id`), and **`proxy`** (local bind host/port).

`clovapi switch` always targets a single CLI. Use `--cli` for non-interactive scripts. Prefer **`--provider`** + **`--model`** (or **`--vendor`** + **`--model`**) in automation; add **`--json`** when a caller needs structured success/error output.
## Apply behavior (summary)

- **claude-code** + `claude`: writes `~/.claude/settings.json` with **`env.ANTHROPIC_AUTH_TOKEN`** and **`ANTHROPIC_BASE_URL`** (same pattern as ccswitch). **`ANTHROPIC_API_KEY` is removed** from `env` so Claude Code does not show “Auth conflict: Both a token and an API key are set”.
- **codex** + `openai-responses`: merges `~/.codex/config.toml` — sets `[model_providers.clovapi]` (`base_url`, `wire_api`, `experimental_bearer_token`), `model_provider = "clovapi"`, and top-level **`model`** from the saved profile.
- **opencode** + any supported style: matches [OpenCode config loading](https://opencode.ai/docs/config) — **global** files under `~/.config/opencode/` (Windows: `%AppData%\opencode\` first, then `~/.config\opencode\`) are **merged** in order **`config.json` → `opencode.json` → `opencode.jsonc`** (later wins on conflicts). clovapi **writes the same file OpenCode edits** (`globalConfigFile` in upstream): first existing among **`opencode.jsonc`**, **`opencode.json`**, **`config.json`**, or creates **`opencode.jsonc`** if none exist — so new settings override legacy `config.json`. **Anthropic**-shaped gateways: `provider.anthropic.options` + `model` `anthropic/…`. **OpenAI**-shaped gateways: **`provider.clovapi`** + **`npm`**, `options`, `models`, top-level **`model`** `clovapi/…`. **Gemini** relay: `provider.gemini` + `model` `gemini/…`. **Project** `opencode.json` / `.opencode/` still override globals; if switching “does nothing”, check the repo’s project config or `OPENCODE_CONFIG` / `OPENCODE_CONFIG_CONTENT`. Optional **`CLOVAPI_SWITCHER_OPENCODE_DIR`** forces the global config directory (tests use this).
- **openclaw** + any supported style: merges **`~/.openclaw/openclaw.json`** (override with **`OPENCLAW_CONFIG_PATH`**): `models.mode=merge`, **`models.providers.clovapi`** (`baseUrl`, `apiKey`, `api` = `anthropic-messages` \| `openai-completions` \| `openai-responses` \| `google-generative-ai`), **`agents.defaults.model.primary`** `clovapi/<model-id>`. File must be **valid JSON** for merge (JSON5 comments are not parsed).
- **hermes** + any supported style: merges **`~/.hermes/config.yaml`** — `model.default`, `model.provider` (`anthropic` \| `clovapi` \| `gemini`), `model.base_url`, `model.api_key`.
- **kimi-code** + any supported style: merges **`~/.kimi/config.toml`** — `default_model`, **`[providers.clovapi]`** (`type` maps from api-style), **`[models.<id>]`** with `provider = "clovapi"` and `model` from the profile.

**cc-switch / ccswitch** only target Claude Code JSON; OpenCode / OpenClaw / Hermes / Kimi are **clovapi-only** adapters (aligned with each upstream’s docs).

Paths expand correctly on Windows (user profile / AppData).

## Compared with community cc-switch / ccswitch (“cc-switcher”)

**Claude Code path:** clovapi follows the same **credentials shape** as [huangdijia/ccswitch](https://github.com/huangdijia/ccswitch) / [HoBeedzc/cc-switch](https://github.com/HoBeedzc/cc-switch): **`env.ANTHROPIC_AUTH_TOKEN`** (+ **`ANTHROPIC_BASE_URL`**), **no** `ANTHROPIC_API_KEY` (avoids Claude Code “Auth conflict”). **`settings.json`** is merged (other top-level keys kept); **`model`** + **`env.ANTHROPIC_*_MODEL`** from the applied binding.

**Extras:** clovapi applies the **same upstream settings** across **Codex**, **OpenCode**, **OpenClaw**, **Hermes**, and **Kimi Code CLI** — outside typical npm cc-switch scope.

### Command aliases (muscle memory from cc-switch / ccswitch)

| clovapi | Alias(es) | Similar to |
|---------|-----------|------------|
| `list` | `ls` | `cc-switch list`, `ccswitch list` |
| `profiles` | _(command group, not a list alias)_ | Desktop/script JSON API for `profiles.json` |
| `add` | `set`, `new` | One-shot save of upstream binding |
| `switch [--cli …]` | `use …` | Apply one binding into one tool config |
| `remove NAME` | `rm`, `delete` | Delete one saved profile |

**Note:** Older docs used `clovapi profiles` as an alias for `list`. That alias was removed when **`profiles`** became its own subcommand group (`load`, `save`, …). Use **`clovapi list`** or **`clovapi ls`** for the human table.
### Where state lives

| Tool | Stored profiles |
|------|-----------------|
| [cc-switch](https://github.com/HoBeedzc/cc-switch) | `~/.claude/profiles/*.json` + `.current` |
| [ccswitch](https://github.com/huangdijia/ccswitch) | `~/.ccswitch/ccs.json` |
| **clovapi** | `%APPDATA%\clovapi\profiles.json` (Windows) / `~/.config/clovapi/profiles.json` (Unix) — `profiles` array + `active` map |

`go test ./...` in this module passes; real upstream calls need your key locally.

## Related links

### Agent profile switching

- [CC Switch (CCSwitch)](https://github.com/farion1231/cc-switch) — desktop all-in-one Agent API switcher (Claude Code, Codex, OpenCode, OpenClaw, …)
- [cc-switch-cli](https://github.com/saladday/cc-switch-cli) — CLI fork of CC Switch
- [cc-switch](https://github.com/HoBeedzc/cc-switch) — community Claude Code profile switcher (npm)
- [ccswitch](https://github.com/huangdijia/ccswitch) — community Claude Code config switcher

### System prompt & tool change tracking

- [cchistory](https://github.com/badlogic/cchistory) — extract and diff Claude Code system prompts and tool definitions across versions
- [claude-code-changelog](https://github.com/marckrenn/claude-code-changelog) — community-maintained Claude Code prompt / feature-flag evolution

### Benchmarks & agent ecosystem

- [Harbor](https://github.com/harbor-framework/harbor) — official Terminal-Bench harness
- [Terminal-Bench](https://www.tbench.ai/) — terminal agent benchmark dataset
- [Agent repo index](../docs/agent-repos.md)

### Upstream models & plans

- [OpenCode](https://github.com/anomalyco/opencode) — open-source agent IDE/CLI ([config docs](https://opencode.ai/docs/config))
- [OpenRouter](https://openrouter.ai/) — multi-provider API gateway with free and discounted model tiers

## Release pipeline

Tag `vX.Y.Z` triggers `.github/workflows/release-switcher.yml` (core CLI and npm). With Cloudflare R2 secrets configured, CLI artifacts are mirrored to `https://downloads.clovapi.com`:

| Artifact | R2 path |
|----------|---------|
| CLI archives + `checksums.txt` | `/clovapi/vX.Y.Z/` |
| CLI latest pointer | `/clovapi/latest.txt` |
| install script | `/install.sh`, `/clovapi/install.sh` |

Desktop builds use `.github/workflows/release-desktop.yml` on `main` pushes to `electron/**` (see `electron/README.md`).

| Artifact | R2 path |
|----------|---------|
| macOS desktop | `/desktop/latest/clovapi-desktop-darwin-universal.dmg` |
| Windows desktop | `/desktop/latest/clovapi-desktop-windows-x64.exe` |

GitHub Actions secrets: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, optional `R2_ARTIFACT_PREFIX` (default `clovapi`).

Local upload: `./scripts/r2-publish.sh` (see `core/README.zh.md`).

`npm i -g @clovapi/cli`, `clovapi update`, and `landing/public/install.sh` prefer R2; GitHub Releases is the fallback.

## DeepSeek + Claude Code (Anthropic-compatible)

Use API style **`claude`** and Anthropic base URL from DeepSeek docs:

- **Base URL:** `https://api.deepseek.com/anthropic`
- **API key:** your DeepSeek key (prefer env `DEEPSEEK_API_KEY` or `CLOVAPI_API_KEY`, do not commit keys)
- **Model (required):** e.g. `deepseek-v4-flash` or `deepseek-v4-pro` via `--model` (also prompted if omitted)

Connectivity check (during `clovapi add`): **`POST …/v1/messages`** with your model (Anthropic headers). If that returns **404** on the Messages path, **`add` retries** **`POST https://<same-host>/v1/chat/completions`** with **Bearer** the same key (unified gateways).

```bash
clovapi add --api-style claude \
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

clovapi add --api-style openai-responses \
  --name deepseek-codex \
  --base-url https://api.deepseek.com/v1 \
  --model deepseek-v4-pro \
  --api-key "$DEEPSEEK_API_KEY"

clovapi switch --cli codex
```

`switch` writes `~/.codex/config.toml` with provider **`clovapi`**, sets **`model`** from the binding, and points **`model_provider`** at that block.

### Still seeing 401 or auth conflict?

After **`go build`**, run **`clovapi switch --cli claude-code`** again (with **`clovapi add`** already saved). Open **`%USERPROFILE%\.claude\settings.json`**: you should see **`env.ANTHROPIC_AUTH_TOKEN`** (and **`ANTHROPIC_BASE_URL`**) but **no `env.ANTHROPIC_API_KEY`**. Remove duplicate credentials from **system/user environment variables** if you set them globally (`setx` / System Properties).
