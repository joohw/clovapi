# Agent reference repositories

Catalog of open-source repos cloned under `ref/` for clovapi core research (reading upstream config formats and CLI behavior). Use this file to reproduce the same layout on another machine.

`ref/` is gitignored in this repo — clones live only on your disk.

## Quick replicate

From the repository root:

```bash
mkdir -p ref
cd ref

repos=(
  anthropics/claude-code
  huangdijia/ccswitch
  farion1231/cc-switch
  openai/codex
  anomalyco/opencode
  openclaw/openclaw
  NousResearch/hermes-agent
  MoonshotAI/kimi-cli
  earendil-works/pi
)

for spec in "${repos[@]}"; do
  name="${spec##*/}"
  case "$spec" in
    anthropics/claude-code) name="claude-code-official" ;;
    huangdijia/ccswitch)    name="ccswitch" ;;
    farion1231/cc-switch)   name="cc-switch" ;;
    openai/codex)           name="codexcli" ;;
    anomalyco/opencode)     name="opencode" ;;
    openclaw/openclaw)      name="openclaw" ;;
    NousResearch/hermes-agent) name="hermes-agent" ;;
    MoonshotAI/kimi-cli)    name="kimi-cli" ;;
    earendil-works/pi)      name="pi" ;;
  esac
  if [ -d "$name/.git" ]; then
    echo "skip $name"
  else
    echo "clone $name <- $spec"
    git clone --depth 1 "https://github.com/$spec.git" "$name"
  fi
done
```

Shallow clone (`--depth 1`) is enough for reading source. Drop `--depth 1` if you need full history.

---

## clovapi core targets

Core writes config for these CLIs (see `core/internal/apply/target_*.go`):

| CLI | Upstream repo | Local `ref/` dir |
|-----|---------------|------------------|
| Claude Code | https://github.com/anthropics/claude-code | `ref/claude-code-official` |
| Codex | https://github.com/openai/codex | `ref/codexcli` |
| OpenCode | https://github.com/anomalyco/opencode | `ref/opencode` |
| OpenClaw | https://github.com/openclaw/openclaw | `ref/openclaw` |
| Hermes | https://github.com/NousResearch/hermes-agent | `ref/hermes-agent` |
| Kimi CLI | https://github.com/MoonshotAI/kimi-cli | `ref/kimi-cli` |

Claude Code CLI itself is proprietary (npm `@anthropic-ai/claude-code`); the Anthropic repo above is **plugins / docs only**.

---

## Profile switcher peers (Claude Code credentials)

Useful when comparing `env.ANTHROPIC_AUTH_TOKEN` / `settings.json` wiring:

| Local dir | GitHub | Notes |
|-----------|--------|-------|
| `ref/ccswitch` | https://github.com/huangdijia/ccswitch | Community Claude Code config switcher |
| `ref/cc-switch` | https://github.com/farion1231/cc-switch | Desktop all-in-one Agent API switcher |

---

## Other agent CLIs (reference)

| Local dir | GitHub | Notes |
|-----------|--------|-------|
| `ref/pi` | https://github.com/earendil-works/pi | Pi coding agent monorepo; CLI in `packages/coding-agent` |
