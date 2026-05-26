# Agent 参考仓库索引

记录 `ref/` 下用于 Harbor / Terminal-Bench / clovapi switcher 研究的开源 agent 仓库地址。换机器时按本文复刻即可。

`ref/` 在本仓库 `.gitignore` 中，clone 只存在于本地磁盘。

## 一键复刻（全部开源 clone）

在仓库根目录执行：

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

浅克隆（`--depth 1`）足够阅读源码；需要完整 git 历史时去掉该参数。

---

## 按类别

### 基准框架

| 本地目录 | GitHub | Harbor agent | 说明 |
|----------|--------|--------------|------|
| `ref/harbor` | https://github.com/harbor-framework/harbor | — | Terminal-Bench 运行器；适配器在 `src/harbor/agents/` |

### 终端 CLI agent（Harbor installed agents）

| 本地目录 | GitHub | Harbor `-a` | 说明 |
|----------|--------|-------------|------|
| `ref/codexcli` | https://github.com/openai/codex | `codex` | OpenAI Codex CLI |
| `ref/gemini-cli` | https://github.com/google-gemini/gemini-cli | `gemini-cli` | |
| `ref/opencode` | https://github.com/anomalyco/opencode | `opencode` | |
| `ref/cline` | https://github.com/cline/cline | `cline-cli` | Harbor 也可能从 npm 装 `cline@nightly` |
| `ref/goose` | https://github.com/block/goose | `goose` | Block Goose |
| `ref/hermes-agent` | https://github.com/NousResearch/hermes-agent | `hermes` | |
| `ref/kimi-cli` | https://github.com/MoonshotAI/kimi-cli | `kimi-cli` | |
| `ref/openclaw` | https://github.com/openclaw/openclaw | — | 非 Harbor 内置名；gateway 研究用 |
| `ref/qwen-code` | https://github.com/QwenLM/qwen-code | `qwen-coder` | npm `@qwen-code/qwen-code` |
| `ref/trae-agent` | https://github.com/bytedance/trae-agent | `trae-agent` | 字节 |
| `ref/pi` | https://github.com/earendil-works/pi | `pi` | monorepo；CLI 在 `packages/coding-agent` |
| `ref/pi-terminal-bench` | https://github.com/badlogic/pi-terminal-bench | — | Pi 的 Harbor 适配层 |
| `ref/amazon-q-cli` | https://github.com/aws/amazon-q-developer-cli | — | AWS 终端 agent；Harbor 未内置 |

Pi 旧 monorepo（已迁到 `earendil-works/pi`）：https://github.com/badlogic/pi-mono

### Programmatic agent SDK

| 本地目录 | GitHub | Harbor | 说明 |
|----------|--------|--------|------|
| `ref/claude-agent-sdk` | https://github.com/anthropics/claude-agent-sdk | — | Anthropic 官方 SDK（Python / TypeScript） |
| `ref/openai-agents-python` | https://github.com/openai/openai-agents-python | — | OpenAI **Agents SDK**（Python） |
| `ref/openai-agents-js` | https://github.com/openai/openai-agents-js | — | OpenAI Agents SDK（JavaScript/TypeScript） |
| `ref/openhands-sdk` | https://github.com/OpenHands/software-agent-sdk | `openhands-sdk` | 轻量 SDK；PyPI `openhands-sdk` |
| `ref/nemo-agent-toolkit` | https://github.com/NVIDIA/NeMo-Agent-Toolkit | `nemo-agent` | 多后端（NIM / OpenAI / Azure / Bedrock / LiteLLM） |

OpenAI 早期实验项目（已被 Agents SDK 取代）：https://github.com/openai/swarm

### 全栈 / SWE agent

| 本地目录 | GitHub | Harbor `-a` | 说明 |
|----------|--------|-------------|------|
| `ref/openhands` | https://github.com/OpenHands/OpenHands | `openhands` | OpenHands 全栈 |
| `ref/mini-swe-agent` | https://github.com/SWE-agent/mini-swe-agent | `mini-swe-agent` | 极简 SWE 循环 |
| `ref/swe-agent` | https://github.com/SWE-agent/SWE-agent | `swe-agent` | 经典 SWE-agent |
| `ref/agentless` | https://github.com/OpenAutoCoder/Agentless | — | SWE-bench 无 agent 循环基线 |
| `ref/aider` | https://github.com/Aider-AI/aider | `aider` | 结对编程 CLI |

### Fork 与变体

| 本地目录 | GitHub | 说明 |
|----------|--------|------|
| `ref/roo-code` | https://github.com/RooCodeInc/Roo-Code | Cline 活跃 fork |

### Claude Code（CLI 闭源）

| 本地目录 | GitHub | 说明 |
|----------|--------|------|
| `ref/claude-code` | https://github.com/Hyper66666/claude-code-sourcemap | 第三方 npm source-map 还原；**非** Anthropic 官方源码 |
| `ref/claude-code-official` | https://github.com/anthropics/claude-code | 官方仓库 — **仅插件/文档**；CLI 本体为闭源 npm `@anthropic-ai/claude-code` |
| `ref/ccswitch` | https://github.com/huangdijia/ccswitch | 社区 Claude Code 配置切换工具；与 clovapi switcher 同款 `env.ANTHROPIC_AUTH_TOKEN` 写法 |

Harbor agent：`claude-code` → 运行闭源 `claude` CLI。

---

## Harbor 支持但无公开源码

以下在 Harbor 中有适配器（见 `ref/harbor/src/harbor/agents/factory.py`），**没有可 clone 的开源仓库**：

| Harbor `-a` | 上游 | 说明 |
|-------------|------|------|
| `cursor-cli` | Cursor / Anysphere | 闭源 |
| `copilot-cli` | GitHub Copilot CLI | 闭源 |
| `rovodev-cli` | Atlassian Rovo Dev | 闭源 |
| `devin` | Cognition Devin CLI | 闭源安装脚本 |
| `terminus-2` | 内建在 Harbor | LiteLLM bash 循环，源码在 `ref/harbor` |

---

## clovapi switcher 对照

Switcher 当前会写入配置的 CLI（见 `switcher/internal/apply/target_*.go`）：

| CLI | 对应上游仓库 |
|-----|-------------|
| Claude Code | （闭源 CLI；插件见 `ref/claude-code-official`；社区切换器见 `ref/ccswitch`） |
| Codex | `ref/codexcli` |
| OpenCode | `ref/opencode` |
| OpenClaw | `ref/openclaw` |
| Hermes | `ref/hermes-agent` |
| Kimi CLI | `ref/kimi-cli` |

---

## 延伸阅读

- [Harbor 与各 Agent 的 API 控制](harbor-agents.zh.md) · [English](harbor-agents.md)
- Terminal-Bench：https://www.tbench.ai/
- Harbor 论文（TB 2.0）：https://arxiv.org/html/2601.11868v1

**English:** [agent-repos.md](agent-repos.md)
