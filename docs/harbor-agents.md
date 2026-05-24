# Harbor: how different agents call upstream APIs

Reference for studying [Terminal-Bench](https://www.tbench.ai/) agents alongside clovapi. Harbor source lives in [`ref/harbor/`](../ref/harbor/); per-agent adapters are under `ref/harbor/src/harbor/agents/installed/`.

Harbor does **not** route every agent through one shared HTTP client. It picks an **agent adapter** with `--agent`, picks a model with `--model`, then translates model + credentials + optional base URL into **each CLI’s native config** (env vars, config files, CLI flags).

## Architecture

```
harbor run --agent / --model / --ae
        │
        ▼
AgentFactory.create_agent_from_config()
        │
        ▼
installed/<agent>.py  (adapter)
        │
        ▼
Docker sandbox  →  claude / codex / gemini / …  →  upstream API
```

| Agent kind | Examples | Who calls the LLM API |
|------------|----------|------------------------|
| **Installed agents** | Claude Code, Codex, Gemini CLI, OpenCode, … | The third-party CLI inside the container; Harbor only injects config |
| **Built-in agents** | Terminus 2 | Harbor via **LiteLLM** (bash-only tool loop) |

## Unified CLI: `--model` and `--ae`

```bash
harbor run -d terminal-bench@2.0 \
  -a claude-code \
  -m anthropic/claude-opus-4-6 \
  --ae ANTHROPIC_BASE_URL=https://your-proxy/v1 \
  --ae ANTHROPIC_API_KEY=sk-...
```

| Flag | Maps to | Effect |
|------|---------|--------|
| `-m` / `--model` | `AgentConfig.model_name` | Passed to the adapter as `self.model_name` |
| `--ae` / `--agent-env` | `AgentConfig.env` | `extra_env` on the adapter; **overrides** host `os.environ` when executing in the sandbox |

Factory wiring (`ref/harbor/src/harbor/agents/factory.py`):

- `create_agent_from_config()` resolves `config.env` and passes `model_name` + `extra_env` into each adapter.
- `BaseInstalledAgent` (`installed/base.py`) declares `CLI_FLAGS` / `ENV_VARS` to map kwargs or env fallbacks to CLI arguments.

## Reasoning / thinking effort

Harbor does **not** define one global reasoning-effort enum. Each agent exposes **native knobs** from its CLI or SDK via `AgentConfig.kwargs`; on the CLI this is **`--ak` / `--agent-kwarg key=value`** (repeatable).

```bash
# Examples
harbor run -d terminal-bench@2.0 \
  -a claude-code \
  -m anthropic/claude-opus-4-6 \
  --ak reasoning_effort=high \
  --ak thinking=enabled

harbor run -d terminal-bench@2.0 \
  -a codex \
  -m openai/gpt-5.2 \
  --ak reasoning_effort=high

harbor run -d terminal-bench@2.0 \
  -a terminus-2 \
  -m anthropic/claude-opus-4-6 \
  --ak reasoning_effort=medium \
  --ak max_thinking_tokens=8192
```

Kwargs declared as `CLI_FLAGS` on `BaseInstalledAgent` become CLI flags on the subprocess; constructor args (e.g. Gemini `reasoning_effort`) or `ENV_VARS` go through env or config files. See each adapter’s `__init__`, `CLI_FLAGS`, and `ENV_VARS` for valid keys.

### Design split

| Path | Who applies thinking | Notes |
|------|----------------------|-------|
| **Installed agents** | claude / codex / gemini … inside the container | Harbor forwards flags, env, or settings snippets only |
| **Terminus 2** | Harbor → **LiteLLM** | Shared `reasoning_effort` / `max_thinking_tokens` mapped in `llms/lite_llm.py` |

LiteLLM layer (Terminus 2, OpenHands SDK, etc.):

- **Chat Completions**: `reasoning_effort` passed to `litellm.acompletion`
- **Responses API** (`use_responses_api=true`): `reasoning.effort`
- **Anthropic extended thinking**: `max_thinking_tokens` (min 1024) → `thinking.type=enabled` + `budget_tokens`

### Per-agent thinking parameters

| Agent | Harbor kwarg / flag | Values / default | Wired to |
|-------|---------------------|------------------|----------|
| **Terminus 2** | `reasoning_effort` | `none` \| `minimal` \| `low` \| `medium` \| `high` \| `xhigh` \| `max` \| `default`; default `None` | LiteLLM |
| | `max_thinking_tokens` | Anthropic thinking budget, min 1024 | LiteLLM `thinking.budget_tokens` |
| | `interleaved_thinking` | bool; include reasoning in chat history | Terminus `Chat` |
| **Claude Code** | `reasoning_effort` | `low` \| `medium` \| `high` \| `xhigh` \| `max` → `--effort` | `claude` subprocess |
| | `thinking` | `enabled` \| `adaptive` \| `disabled` → `--thinking` | same |
| | `max_thinking_tokens` | int → `--max-thinking-tokens`; or env `MAX_THINKING_TOKENS` | same |
| | `thinking_display` | `summarized` \| `omitted` → `--thinking-display` | same |
| | (env) | `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1` disables adaptive | host env → container |
| **Codex CLI** | `reasoning_effort` | any string; adapter default **`high`** → `-c model_reasoning_effort=…` | Codex config |
| | `reasoning_summary` | `auto` \| `concise` \| `detailed` \| `none` → `-c model_reasoning_summary=…` | same |
| **Gemini CLI** | `reasoning_effort` | `minimal` \| `low` \| `medium` \| `high` | `~/.gemini/settings.json` `thinkingConfig.thinkingLevel` via custom alias |
| | | Gemini **2.5** unsupported; `minimal`/`medium` only on **Flash** | validated at construct time |
| **OpenHands** | `reasoning_effort` | string; default **`high`** → env `LLM_REASONING_EFFORT` | OpenHands runtime |
| **OpenHands SDK** | `reasoning_effort` | `low` \| `medium` \| `high`; default **`high`** | SDK LLM config |
| **Mini-SWE-Agent** | `reasoning_effort` | any; appended as `-c model.model_kwargs.extra_body.reasoning_effort=…` | mini-swe-agent / LiteLLM |
| **Aider** | `reasoning_effort` | → CLI `--reasoning-effort` | aider |
| | `thinking_tokens` | int → `--thinking-tokens` | same |
| **Copilot CLI** | `reasoning_effort` | `low` \| `medium` \| `high` \| `xhigh` → `--effort`; env `COPILOT_CLI_EFFORT` | copilot |
| **Pi** | `thinking` | `off` \| `minimal` \| `low` \| `medium` \| `high` \| `xhigh` → `--thinking` | pi |
| **OpenCode** | `--thinking` (always on in adapter) | **Not** a strength knob — only includes thinking blocks in JSON output | `opencode run --format=json --thinking` |

Agents not listed (Hermes, Kimi CLI, …) may have no Harbor thinking wrapper; check `installed/*.py` for `CLI_FLAGS`.

### Job / YAML config

Same as `--ak`, under `agents[].kwargs`:

```yaml
agents:
  - name: claude-code
    model_name: anthropic/claude-opus-4-6
    kwargs:
      reasoning_effort: high
      thinking: enabled
      max_thinking_tokens: 10000
```

Full Terminus 2 options: `ref/harbor/docs/content/docs/agents/terminus-2.mdx`.

## Per-agent API control

Each adapter implements `run()` and maps Harbor’s `--model` to that CLI’s expectations.

### Claude Code (`claude-code`)

Source: `ref/harbor/src/harbor/agents/installed/claude_code.py`

| Control | Mechanism |
|---------|-----------|
| Model | `ANTHROPIC_MODEL` (prefix `anthropic/` stripped for official API) |
| Auth | `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN` |
| Custom gateway | `ANTHROPIC_BASE_URL` — keeps full model id; sets Sonnet/Opus/Haiku/subagent aliases to the same model |
| Bedrock | `CLAUDE_CODE_USE_BEDROCK=1` + AWS credentials |

CLI invocation: `claude --print --output-format=stream-json …`

### Codex CLI (`codex`)

Source: `ref/harbor/src/harbor/agents/installed/codex.py`

| Control | Mechanism |
|---------|-----------|
| Model | `codex exec --model <id>` (`openai/` prefix stripped) |
| Auth | Default: `OPENAI_API_KEY` written to `auth.json`; subscription: `CODEX_AUTH_JSON_PATH` or `CODEX_FORCE_AUTH_JSON=1` |
| Custom gateway | `OPENAI_BASE_URL` → `config.toml` `openai_base_url` (Codex ≥0.118 ignores the env var alone) |

### Gemini CLI (`gemini-cli`)

Source: `ref/harbor/src/harbor/agents/installed/gemini_cli.py`

| Control | Mechanism |
|---------|-----------|
| Model | `gemini --model=…` (requires `google/<model>` format) |
| Auth | `GEMINI_API_KEY`, `GOOGLE_*`, Vertex flags |
| Extra | Writes `~/.gemini/settings.json` (MCP, reasoning-effort aliases) |

### OpenCode (`opencode`)

Source: `ref/harbor/src/harbor/agents/installed/opencode.py`

| Control | Mechanism |
|---------|-----------|
| Model | `opencode --model=provider/model run …` |
| Provider block | Writes `~/.config/opencode/opencode.json` |
| OpenAI proxy | `OPENAI_BASE_URL` → `provider.openai.options.baseURL` |
| Auth | Env chosen by provider prefix (`anthropic` → `ANTHROPIC_API_KEY`, `openai` → `OPENAI_API_KEY`, …) |

### Mini-SWE-Agent / OpenHands-style agents

Source e.g. `ref/harbor/src/harbor/agents/installed/mini_swe_agent.py`

| Control | Mechanism |
|---------|-----------|
| Model | Passed through as `provider/model` (e.g. `--model=anthropic/claude-sonnet-4-5`) |
| Auth | `get_api_key_var_names_from_model_name()` in `agents/utils.py` maps LiteLLM provider → `*_API_KEY` |
| Proxy | Forwards `OPENAI_API_BASE` when set |

### Terminus 2 (`terminus-2`)

Source: `ref/harbor/src/harbor/agents/terminus_2/terminus_2.py`

Harbor calls **LiteLLM** directly (`api_base`, `reasoning_effort`, `use_responses_api`, …). Use this scaffold when comparing models on equal footing without vendor-specific CLI behavior.

## Model name format

Harbor convention: **`provider/model-id`**

```bash
-m anthropic/claude-opus-4-6
-m openai/gpt-5.2
-m google/gemini-3-pro
-m openrouter/anthropic/claude-3-5-sonnet
```

Adapters may strip or keep the provider prefix depending on what the target CLI expects. Provider → API key env names are listed in `ref/harbor/src/harbor/agents/utils.py` (`PROVIDER_KEYS`).

## Relation to clovapi switcher

Same idea, different lifecycle:

| Harbor (benchmark) | clovapi (daily dev) |
|--------------------|---------------------|
| `--agent claude-code` + env injection | `target_claude_code.go` → `~/.claude/settings.json` |
| `--agent codex` + `OPENAI_BASE_URL` | `target_codex.go` → `~/.codex/config.toml` |
| `--agent opencode` + `opencode.json` | `target_opencode.go` → `~/.config/opencode/*.json` |
| `--ae ANTHROPIC_BASE_URL=…` | Profile `BaseURL` + local proxy ingress |

### Example: run Terminal-Bench through clovapi proxy

```bash
# Point Claude Code at clovapi local proxy (host env → Harbor → container CLI)
export ANTHROPIC_BASE_URL="http://127.0.0.1:27483/claude-code/claude-sonnet-4-6/claude"
export ANTHROPIC_API_KEY="clovapi-local"

harbor run -d terminal-bench@2.0 \
  -a claude-code \
  -m anthropic/claude-sonnet-4-6 \
  --task-id hello-world \
  -k 1
```

For Codex subscription in Harbor, use `CODEX_AUTH_JSON_PATH=~/.codex/auth.json` or `CODEX_FORCE_AUTH_JSON=1` instead of `OPENAI_API_KEY`.

## Local reference clones (`ref/`)

Open-source agent repos cloned for reading alongside Harbor adapters:

| Directory | Upstream |
|-----------|----------|
| `ref/harbor` | [harbor-framework/harbor](https://github.com/harbor-framework/harbor) |
| `ref/claude-code` | Source-map restore (CLI body is proprietary) |
| `ref/claude-code-official` | [anthropics/claude-code](https://github.com/anthropics/claude-code) (plugins) |
| `ref/codexcli` | [openai/codex](https://github.com/openai/codex) |
| `ref/gemini-cli` | [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) |
| `ref/opencode` | [anomalyco/opencode](https://github.com/anomalyco/opencode) |
| `ref/openhands` | [OpenHands/OpenHands](https://github.com/OpenHands/OpenHands) |
| `ref/mini-swe-agent` | [SWE-agent/mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent) |
| `ref/hermes-agent`, `ref/kimi-cli`, `ref/openclaw`, … | See `ref/` |

`ref/` is gitignored; refresh with shallow clones as needed.

## Further reading

- Terminal-Bench: [tbench.ai](https://www.tbench.ai/)
- Harbor CLI: `harbor run --help`
- Paper (TB 2.0): [arXiv:2601.11868](https://arxiv.org/html/2601.11868v1)
