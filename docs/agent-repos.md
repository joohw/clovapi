# Agent reference repositories

Catalog of open-source agent repos cloned under `ref/` for Harbor / Terminal-Bench / clovapi switcher research. Use this file to reproduce the same layout on another machine.

`ref/` is gitignored in this repo — clones live only on your disk.

## Quick replicate (all open-source clones)

From the repository root:

```bash
mkdir -p ref
cd ref

repos=(
  harbor-framework/harbor
  Hyper66666/claude-code-sourcemap
  anthropics/claude-code
  huangdijia/ccswitch
  anthropics/claude-agent-sdk
  openai/codex
  openai/openai-agents-python
  openai/openai-agents-js
  google-gemini/gemini-cli
  aws/amazon-q-developer-cli
  anomalyco/opencode
  OpenHands/OpenHands
  OpenHands/software-agent-sdk
  NVIDIA/NeMo-Agent-Toolkit
  SWE-agent/mini-swe-agent
  SWE-agent/SWE-agent
  OpenAutoCoder/Agentless
  cline/cline
  RooCodeInc/Roo-Code
  earendil-works/pi
  badlogic/pi-terminal-bench
  NousResearch/hermes-agent
  MoonshotAI/kimi-cli
  openclaw/openclaw
  block/goose
  QwenLM/qwen-code
  bytedance/trae-agent
  Aider-AI/aider
)

for spec in "${repos[@]}"; do
  name="${spec##*/}"
  case "$spec" in
    Hyper66666/claude-code-sourcemap) name="claude-code" ;;
    anthropics/claude-code)             name="claude-code-official" ;;
    huangdijia/ccswitch)                name="ccswitch" ;;
    anthropics/claude-agent-sdk)        name="claude-agent-sdk" ;;
    openai/codex)                       name="codexcli" ;;
    openai/openai-agents-python)        name="openai-agents-python" ;;
    openai/openai-agents-js)            name="openai-agents-js" ;;
    google-gemini/gemini-cli)           name="gemini-cli" ;;
    aws/amazon-q-developer-cli)         name="amazon-q-cli" ;;
    OpenHands/software-agent-sdk)       name="openhands-sdk" ;;
    NVIDIA/NeMo-Agent-Toolkit)          name="nemo-agent-toolkit" ;;
    SWE-agent/mini-swe-agent)           name="mini-swe-agent" ;;
    SWE-agent/SWE-agent)                name="swe-agent" ;;
    OpenAutoCoder/Agentless)            name="agentless" ;;
    RooCodeInc/Roo-Code)                name="roo-code" ;;
    earendil-works/pi)                  name="pi" ;;
    badlogic/pi-terminal-bench)          name="pi-terminal-bench" ;;
    NousResearch/hermes-agent)          name="hermes-agent" ;;
    MoonshotAI/kimi-cli)                name="kimi-cli" ;;
    QwenLM/qwen-code)                   name="qwen-code" ;;
    bytedance/trae-agent)               name="trae-agent" ;;
    Aider-AI/aider)                     name="aider" ;;
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

## By category

### Benchmark harness

| Local dir | GitHub | Harbor agent | Notes |
|-----------|--------|--------------|-------|
| `ref/harbor` | https://github.com/harbor-framework/harbor | — | Terminal-Bench runner; adapters in `src/harbor/agents/` |

### Terminal CLI agents (Harbor installed agents)

| Local dir | GitHub | Harbor `-a` | Notes |
|-----------|--------|-------------|-------|
| `ref/codexcli` | https://github.com/openai/codex | `codex` | OpenAI Codex CLI |
| `ref/gemini-cli` | https://github.com/google-gemini/gemini-cli | `gemini-cli` | |
| `ref/opencode` | https://github.com/anomalyco/opencode | `opencode` | |
| `ref/cline` | https://github.com/cline/cline | `cline-cli` | Harbor may install `cline@nightly` from npm |
| `ref/goose` | https://github.com/block/goose | `goose` | Block Goose |
| `ref/hermes-agent` | https://github.com/NousResearch/hermes-agent | `hermes` | |
| `ref/kimi-cli` | https://github.com/MoonshotAI/kimi-cli | `kimi-cli` | |
| `ref/openclaw` | https://github.com/openclaw/openclaw | — | Not a Harbor built-in name; useful for gateway study |
| `ref/qwen-code` | https://github.com/QwenLM/qwen-code | `qwen-coder` | npm `@qwen-code/qwen-code` |
| `ref/trae-agent` | https://github.com/bytedance/trae-agent | `trae-agent` | ByteDance |
| `ref/pi` | https://github.com/earendil-works/pi | `pi` | Monorepo; CLI in `packages/coding-agent` |
| `ref/pi-terminal-bench` | https://github.com/badlogic/pi-terminal-bench | — | Pi Harbor adapter layer |
| `ref/amazon-q-cli` | https://github.com/aws/amazon-q-developer-cli | — | AWS terminal agent; not in Harbor |

Legacy Pi monorepo (redirects to `earendil-works/pi`): https://github.com/badlogic/pi-mono

### Programmatic agent SDKs

| Local dir | GitHub | Harbor | Notes |
|-----------|--------|--------|-------|
| `ref/claude-agent-sdk` | https://github.com/anthropics/claude-agent-sdk | — | Anthropic official SDK (Python / TypeScript) |
| `ref/openai-agents-python` | https://github.com/openai/openai-agents-python | — | OpenAI **Agents SDK** (Python); not cloned by default on all machines |
| `ref/openai-agents-js` | https://github.com/openai/openai-agents-js | — | OpenAI Agents SDK (JavaScript/TypeScript) |
| `ref/openhands-sdk` | https://github.com/OpenHands/software-agent-sdk | `openhands-sdk` | Lightweight SDK; PyPI `openhands-sdk` |
| `ref/nemo-agent-toolkit` | https://github.com/NVIDIA/NeMo-Agent-Toolkit | `nemo-agent` | Multi-provider (NIM, OpenAI, Azure, Bedrock, LiteLLM) |

Older OpenAI experiment (superseded by Agents SDK): https://github.com/openai/swarm

### Full-stack / SWE agents

| Local dir | GitHub | Harbor `-a` | Notes |
|-----------|--------|-------------|-------|
| `ref/openhands` | https://github.com/OpenHands/OpenHands | `openhands` | Full OpenHands platform |
| `ref/mini-swe-agent` | https://github.com/SWE-agent/mini-swe-agent | `mini-swe-agent` | Minimal SWE loop |
| `ref/swe-agent` | https://github.com/SWE-agent/SWE-agent | `swe-agent` | Classic SWE-agent |
| `ref/agentless` | https://github.com/OpenAutoCoder/Agentless | — | SWE-bench “no agent loop” baseline |
| `ref/aider` | https://github.com/Aider-AI/aider | `aider` | Pair-programming CLI |

### Forks & variants

| Local dir | GitHub | Notes |
|-----------|--------|-------|
| `ref/roo-code` | https://github.com/RooCodeInc/Roo-Code | Active Cline fork |

### Claude Code (proprietary CLI)

| Local dir | GitHub | Notes |
|-----------|--------|-------|
| `ref/claude-code` | https://github.com/Hyper66666/claude-code-sourcemap | Third-party npm source-map restore; **not** official Anthropic source |
| `ref/claude-code-official` | https://github.com/anthropics/claude-code | Official repo — **plugins / docs only**; CLI body ships as proprietary npm `@anthropic-ai/claude-code` |
| `ref/ccswitch` | https://github.com/huangdijia/ccswitch | Community Claude Code profile switcher; same `env.ANTHROPIC_AUTH_TOKEN` pattern as clovapi switcher |

Harbor agent: `claude-code` → runs the proprietary `claude` CLI.

---

## Harbor agents without public source

These appear in Harbor (`ref/harbor/src/harbor/agents/factory.py`) but have **no meaningful open-source repo** to clone:

| Harbor `-a` | Upstream | Notes |
|-------------|----------|-------|
| `cursor-cli` | Cursor / Anysphere | Proprietary |
| `copilot-cli` | GitHub Copilot CLI | Proprietary |
| `rovodev-cli` | Atlassian Rovo Dev | Proprietary |
| `devin` | Cognition Devin CLI | Proprietary install script |
| `terminus-2` | Built into Harbor | LiteLLM bash loop in `ref/harbor` |

---

## clovapi switcher targets (for cross-reference)

Switcher currently writes config for these CLIs (see `switcher/internal/apply/target_*.go`):

| CLI | Typical upstream repo |
|-----|----------------------|
| Claude Code | (proprietary CLI; see `ref/claude-code-official` plugins; community switcher: `ref/ccswitch`) |
| Codex | `ref/codexcli` |
| OpenCode | `ref/opencode` |
| OpenClaw | `ref/openclaw` |
| Hermes | `ref/hermes-agent` |
| Kimi CLI | `ref/kimi-cli` |

---

## Related docs

- [Harbor agent API wiring](harbor-agents.md) · [中文](harbor-agents.zh.md)
- Terminal-Bench: https://www.tbench.ai/
- Harbor paper (TB 2.0): https://arxiv.org/html/2601.11868v1

**中文索引：** [agent-repos.zh.md](agent-repos.zh.md)
