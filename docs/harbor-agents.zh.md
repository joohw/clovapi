# Harbor：不同 Agent 如何控制上游 API

配合 [Terminal-Bench](https://www.tbench.ai/) 与 clovapi 研究 Agent 时用。Harbor 源码在 [`ref/harbor/`](../ref/harbor/)，各 Agent 适配器在 `ref/harbor/src/harbor/agents/installed/`。

Harbor **不会**用统一的 HTTP 客户端调所有模型。它通过 **`--agent` 选适配器**、**`--model` 选模型**，再把「模型 + 凭据 + 可选 base URL」**翻译成各 Agent CLI 自己的配置方式**（环境变量、配置文件、CLI 参数）。

## 架构

```
harbor run --agent / --model / --ae
        │
        ▼
AgentFactory.create_agent_from_config()
        │
        ▼
installed/<agent>.py（适配器）
        │
        ▼
Docker 沙箱  →  claude / codex / gemini / …  →  上游 API
```

| 类型 | 代表 | 谁真正调 LLM API |
|------|------|------------------|
| **Installed Agent** | Claude Code、Codex、Gemini CLI、OpenCode… | 容器内的第三方 CLI；Harbor 只注入配置 |
| **内置 Agent** | Terminus 2 | Harbor 经 **LiteLLM** 直接调 API（纯 bash 工具循环） |

## 统一入口：`--model` 与 `--ae`

```bash
harbor run -d terminal-bench@2.0 \
  -a claude-code \
  -m anthropic/claude-opus-4-6 \
  --ae ANTHROPIC_BASE_URL=https://your-proxy/v1 \
  --ae ANTHROPIC_API_KEY=sk-...
```

| 参数 | 映射 | 作用 |
|------|------|------|
| `-m` / `--model` | `AgentConfig.model_name` | 传给适配器的 `self.model_name` |
| `--ae` / `--agent-env` | `AgentConfig.env` | 适配器的 `extra_env`；在沙箱内执行时**优先于**宿主机 `os.environ` |

工厂逻辑见 `ref/harbor/src/harbor/agents/factory.py`：`create_agent_from_config()` 解析 `config.env`，把 `model_name` 与 `extra_env` 传入各适配器。`BaseInstalledAgent`（`installed/base.py`）用 `CLI_FLAGS` / `ENV_VARS` 把 kwargs 或环境变量映射成 CLI 参数。

## 思考强度（reasoning / thinking effort）

Harbor **没有**全局统一的「思考强度」枚举。每个 Agent 暴露的是**该 CLI / SDK 原生支持的旋钮**，通过 `AgentConfig.kwargs` 注入；CLI 上等价于 **`--ak` / `--agent-kwarg key=value`**（可重复）。

```bash
# 示例：Claude Code 提高 effort；Codex 改 reasoning；Terminus 2 走 LiteLLM
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

`BaseInstalledAgent` 里声明为 `CLI_FLAGS` 的 kwargs 会拼进子进程命令行；构造函数参数（如 Gemini 的 `reasoning_effort`）或 `ENV_VARS` 则走 env / 配置文件。具体可用项见各适配器 `__init__` 与 `CLI_FLAGS` / `ENV_VARS`。

### 设计要点

| 路径 | 谁解析 thinking | 说明 |
|------|-----------------|------|
| **Installed Agent** | 容器内的 claude / codex / gemini … | Harbor 只转发 CLI flag、env 或 settings 片段 |
| **Terminus 2** | Harbor → **LiteLLM** | 同一套 `reasoning_effort` / `max_thinking_tokens` 由 `llms/lite_llm.py` 转成各厂商 API 字段 |

LiteLLM 层（Terminus 2 与 OpenHands SDK 等）行为摘要：

- **Chat Completions**：`reasoning_effort` 传入 `litellm.acompletion`
- **Responses API**（`use_responses_api=true`）：映射为 `reasoning.effort`
- **Anthropic extended thinking**：`max_thinking_tokens`（≥1024）→ `thinking.type=enabled` + `budget_tokens`

### 各 Agent 支持的 thinking 参数

| Agent | Harbor kwarg / flag | 取值 / 默认 | 落到哪里 |
|-------|---------------------|-------------|----------|
| **Terminus 2** | `reasoning_effort` | `none` \| `minimal` \| `low` \| `medium` \| `high` \| `xhigh` \| `max` \| `default`；默认 `None` | LiteLLM |
| | `max_thinking_tokens` | Anthropic thinking budget，最小 1024 | LiteLLM `thinking.budget_tokens` |
| | `interleaved_thinking` | bool；是否把 reasoning 写回对话历史 | Terminus `Chat` |
| **Claude Code** | `reasoning_effort` | `low` \| `medium` \| `high` \| `xhigh` \| `max` → CLI `--effort` | `claude` 子进程 |
| | `thinking` | `enabled` \| `adaptive` \| `disabled` → `--thinking` | 同上 |
| | `max_thinking_tokens` | int → `--max-thinking-tokens`；也可 env `MAX_THINKING_TOKENS` | 同上 |
| | `thinking_display` | `summarized` \| `omitted` → `--thinking-display` | 同上 |
| | （env） | `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1` 关闭 adaptive | 宿主机 env → 容器 |
| **Codex CLI** | `reasoning_effort` | 任意字符串；适配器默认 **`high`** → `-c model_reasoning_effort=…` | Codex config |
| | `reasoning_summary` | `auto` \| `concise` \| `detailed` \| `none` → `-c model_reasoning_summary=…` | 同上 |
| **Gemini CLI** | `reasoning_effort` | `minimal` \| `low` \| `medium` \| `high` | 写 `~/.gemini/settings.json` 的 `thinkingConfig.thinkingLevel`（经 custom alias） |
| | | Gemini **2.5** 不支持；`minimal`/`medium` 仅 **Flash** 系 | 构造时校验 |
| **OpenHands** | `reasoning_effort` | 字符串；默认 **`high`** → env `LLM_REASONING_EFFORT` | OpenHands 运行时 |
| **OpenHands SDK** | `reasoning_effort` | `low` \| `medium` \| `high`；默认 **`high`** | SDK LLM 配置 |
| **Mini-SWE-Agent** | `reasoning_effort` | 任意；运行时追加 `-c model.model_kwargs.extra_body.reasoning_effort=…` | mini-swe-agent / LiteLLM |
| **Aider** | `reasoning_effort` | → CLI `--reasoning-effort` | aider |
| | `thinking_tokens` | int → `--thinking-tokens` | 同上 |
| **Copilot CLI** | `reasoning_effort` | `low` \| `medium` \| `high` \| `xhigh` → `--effort`；可 env `COPILOT_CLI_EFFORT` | copilot |
| **Pi** | `thinking` | `off` \| `minimal` \| `low` \| `medium` \| `high` \| `xhigh` → `--thinking` | pi |
| **OpenCode** | `--thinking`（固定开启） | **不是**强度旋钮——仅让 JSON 输出包含 thinking 块 | `opencode run --format=json --thinking` |

未在上表列出的 Installed Agent（Hermes、Kimi CLI 等）若需 thinking，需查对应 `installed/*.py` 是否声明 `CLI_FLAGS`；Harbor 侧无统一抽象。

### Job / YAML 配置

与 CLI 的 `--ak` 等价，在 job 配置里写 `agents[].kwargs`：

```yaml
agents:
  - name: claude-code
    model_name: anthropic/claude-opus-4-6
    kwargs:
      reasoning_effort: high
      thinking: enabled
      max_thinking_tokens: 10000
```

Terminus 2 完整选项见 Harbor 文档 `ref/harbor/docs/content/docs/agents/terminus-2.mdx`。

## 各 Agent 的 API 控制

每个适配器在 `run()` 里把 Harbor 的 `--model` 转成该 CLI 能识别的形态。

### Claude Code（`claude-code`）

源码：`ref/harbor/src/harbor/agents/installed/claude_code.py`

| 控制项 | 机制 |
|--------|------|
| 模型 | `ANTHROPIC_MODEL`（官方 API 会去掉 `anthropic/` 前缀） |
| 认证 | `ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN`、`CLAUDE_CODE_OAUTH_TOKEN` |
| 自定义网关 | `ANTHROPIC_BASE_URL` — 保留完整 model id，并把 Sonnet/Opus/Haiku/子 agent 别名设为同一模型 |
| Bedrock | `CLAUDE_CODE_USE_BEDROCK=1` + AWS 凭据 |

CLI：`claude --print --output-format=stream-json …`

### Codex CLI（`codex`）

源码：`ref/harbor/src/harbor/agents/installed/codex.py`

| 控制项 | 机制 |
|--------|------|
| 模型 | `codex exec --model <id>`（去掉 `openai/` 前缀） |
| 认证 | 默认 `OPENAI_API_KEY` 写入 `auth.json`；订阅：`CODEX_AUTH_JSON_PATH` 或 `CODEX_FORCE_AUTH_JSON=1` |
| 自定义网关 | `OPENAI_BASE_URL` → `config.toml` 的 `openai_base_url`（Codex ≥0.118 不能单靠 env） |

### Gemini CLI（`gemini-cli`）

源码：`ref/harbor/src/harbor/agents/installed/gemini_cli.py`

| 控制项 | 机制 |
|--------|------|
| 模型 | `gemini --model=…`（需 `google/<model>` 格式） |
| 认证 | `GEMINI_API_KEY`、`GOOGLE_*`、Vertex 相关变量 |
| 扩展 | 写 `~/.gemini/settings.json`（MCP、reasoning effort 别名） |

### OpenCode（`opencode`）

源码：`ref/harbor/src/harbor/agents/installed/opencode.py`

| 控制项 | 机制 |
|--------|------|
| 模型 | `opencode --model=provider/model run …` |
| Provider | 写 `~/.config/opencode/opencode.json` |
| OpenAI 代理 | `OPENAI_BASE_URL` → `provider.openai.options.baseURL` |
| 认证 | 按 provider 前缀选 env（`anthropic` → `ANTHROPIC_API_KEY` 等） |

### Mini-SWE-Agent 等

源码示例：`ref/harbor/src/harbor/agents/installed/mini_swe_agent.py`

| 控制项 | 机制 |
|--------|------|
| 模型 | 原样传 `provider/model` |
| 认证 | `agents/utils.py` 的 `get_api_key_var_names_from_model_name()` 推断 `*_API_KEY` |
| 代理 | 透传 `OPENAI_API_BASE` 等 |

### Terminus 2（`terminus-2`）

源码：`ref/harbor/src/harbor/agents/terminus_2/terminus_2.py`

Harbor 直接用 **LiteLLM**（`api_base`、`reasoning_effort`、`use_responses_api` 等），适合在排除各厂商 CLI 差异后公平对比模型。

## 模型名格式

Harbor 约定：**`provider/model-id`**

```bash
-m anthropic/claude-opus-4-6
-m openai/gpt-5.2
-m google/gemini-3-pro
```

各适配器对 provider 前缀的处理不同。Provider → API Key 环境变量见 `ref/harbor/src/harbor/agents/utils.py` 的 `PROVIDER_KEYS`。

## 与 clovapi switcher 的对应

| Harbor（评测） | clovapi（日常） |
|----------------|-----------------|
| `--agent claude-code` + env 注入 | `target_claude_code.go` → `~/.claude/settings.json` |
| `--agent codex` + `OPENAI_BASE_URL` | `target_codex.go` → `~/.codex/config.toml` |
| `--agent opencode` + `opencode.json` | `target_opencode.go` → `~/.config/opencode/*.json` |
| `--ae ANTHROPIC_BASE_URL=…` | Profile 的 `BaseURL` + 本地 proxy ingress |

### 经 clovapi 代理跑 Terminal-Bench

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:27483/claude-code/claude-sonnet-4-6/claude"
export ANTHROPIC_API_KEY="clovapi-local"

harbor run -d terminal-bench@2.0 \
  -a claude-code \
  -m anthropic/claude-sonnet-4-6 \
  --task-id hello-world \
  -k 1
```

Codex 订阅在 Harbor 里用 `CODEX_AUTH_JSON_PATH=~/.codex/auth.json` 或 `CODEX_FORCE_AUTH_JSON=1`，而不是 `OPENAI_API_KEY`。

## 本地参考仓库（`ref/`）

与 Harbor 适配器对照阅读的开源 clone（`ref/` 已在 `.gitignore` 中）：

| 目录 | 上游 |
|------|------|
| `ref/harbor` | harbor-framework/harbor |
| `ref/claude-code` | source map 还原（CLI 本体闭源） |
| `ref/codexcli` | openai/codex |
| `ref/gemini-cli` | google-gemini/gemini-cli |
| `ref/opencode` | anomalyco/opencode |
| `ref/openhands`、`ref/mini-swe-agent`、`ref/hermes-agent` 等 | 见 `ref/` 目录 |

## 延伸阅读

- Terminal-Bench：[tbench.ai](https://www.tbench.ai/)
- Harbor：`harbor run --help`
- 论文（TB 2.0）：[arXiv:2601.11868](https://arxiv.org/html/2601.11868v1)

**English:** [harbor-agents.md](harbor-agents.md)
