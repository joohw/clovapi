[English](../switcher/README.md) | 中文 · [仓库首页](../README.md)

# clovapi — 按 CLI 管理 API profiles

小型跨平台 CLI：**保存按 CLI 维度的上游 API 配置**（Base URL、密钥、`api_style`、模型），并**写入**你使用的各类编程 Agent 二进制对应的配置——Claude Code、Codex、OpenCode、OpenClaw、Hermes、Kimi Code CLI 等。

流程：**`clovapi add --name …`**（保存并探测连通性）→ **`clovapi switch --cli …`** 或交互式 **`clovapi switch`**（每次下发到单一 CLI 配置）。

**Claude Code** 的环境变量写法与社区 **cc-switch** / **ccswitch** 一致；详见下文 **与社区 cc-switch / ccswitch 的对比**。

## 命令

| 命令 | 说明 |
|------|------|
| `clovapi list` | 展示已保存的 profiles、CLI ↔ API 形态矩阵、上次下发的 CLI（别名：**`profiles`**、**`ls`**） |
| `clovapi add --name NAME` | 保存一个上游 profile（CLI 在 switch 时再选择）；持久化前先测连通（`--name` 必填，别名：**`set`**、**`new`**） |
| `clovapi remove <name>` | 删除一条已保存 profile（别名：**`rm`**、**`delete`**） |
| `clovapi switch [--cli KIND] [PROFILE_NAME]` | 将某个 profile 应用到某一 CLI（`--cli` 或交互选择）。交互流程：先选 CLI，再选 profile，或 **`0)` 仅重置该 CLI**。别名 **`use`** |
| `clovapi proxy` | 运行并查看内置本地代理核心（`start`、`status`、`config`） |
| `clovapi reset` | 清空所有 profile 与绑定记录（**`--yes`** / **`-y`** 跳过确认） |

## 构建

```bash
cd switcher
go build -o clovapi ./cmd/clovapi
```

在仓库根目录：

```bash
npm run switcher:build   # 输出 switcher/clovapi（Windows 上为 clovapi.exe）
npm run switcher:test
```

## 测试

```bash
cd switcher && go test ./...
```

## 配置文件位置

- **Unix**（macOS/Linux）：`$XDG_CONFIG_HOME/clovapi` 或 `~/.config/clovapi`
- **Windows**：`%APPDATA%\clovapi`

状态文件：`profiles.json`（权限 0600）。内含 **`profiles`**（全部保存配置）和 **`active`**（每个 CLI 上次下发的 profile 名）。

`clovapi switch` 始终只针对单一 CLI。脚本场景用 `--cli` 指定目标。各 CLI 适配器会在内部自动选择最合适的上游 API 形态，无需手动对照风格表。

## 下发行为摘要

- **claude-code** + `claude`：写入 `~/.claude/settings.json`，设置 **`env.ANTHROPIC_AUTH_TOKEN`** 与 **`ANTHROPIC_BASE_URL`**（与 ccswitch 同款）。从 `env` 中**移除 `ANTHROPIC_API_KEY`**，避免 Claude Code 提示「Auth conflict: Both a token and an API key are set」。
- **codex** + `openai-responses`：合并 `~/.codex/config.toml`——配置 `[model_providers.clovapi-relay]`（`base_url`、`wire_api`、`experimental_bearer_token`）、`model_provider = "clovapi-relay"`，以及顶层 **`model`**（来自已保存的绑定）。
- **opencode** + 任意支持的风格：与 [OpenCode 配置加载说明](https://opencode.ai/docs/config) 一致——**全局**文件位于 `~/.config/opencode/`（Windows：优先 `%AppData%\opencode\`，其次 `~/.config\opencode\`），按 **`config.json` → `opencode.json` → `opencode.jsonc`** 合并（后者覆盖冲突项）。clovapi **写入与 OpenCode 自身相同的全局文件**（上游中的 `globalConfigFile`）：在 **`opencode.jsonc`**、**`opencode.json`**、**`config.json`** 中取首个已存在的，若都不存在则新建 **`opencode.jsonc`**，从而使新设置优先于旧版 `config.json`。**Anthropic** 形态网关：`provider.anthropic.options` + `model` `anthropic/…`。**OpenAI** 形态：**`provider.clovapi`** + **`npm`**、`options`、`models`，顶层 **`model`** `clovapi/…`。**Gemini** 中继：`provider.gemini` + `model` `gemini/…`。**项目级** `opencode.json` / `.opencode/` 仍会覆盖全局；若「切换无效」，请检查仓库内项目配置或 `OPENCODE_CONFIG` / `OPENCODE_CONFIG_CONTENT`。可选环境变量 **`CLOVAPI_SWITCHER_OPENCODE_DIR`** 可强制指定全局配置目录（测试中使用）。
- **openclaw** + 任意支持的风格：合并 **`~/.openclaw/openclaw.json`**（可用 **`OPENCLAW_CONFIG_PATH`** 覆盖）：`models.mode=merge`，**`models.providers.clovapi`**（`baseUrl`、`apiKey`、`api` = `anthropic-messages` \| `openai-completions` \| `openai-responses` \| `google-generative-ai`），**`agents.defaults.model.primary`** `clovapi/<model-id>`。合并要求文件为**合法 JSON**（JSON5 注释无法被解析）。
- **hermes** + 任意支持的风格：合并 **`~/.hermes/config.yaml`**——`model.default`、`model.provider`（`anthropic` \| `custom` \| `gemini`）、`model.base_url`、`model.api_key`。
- **kimi-code** + 任意支持的风格：合并 **`~/.kimi/config.toml`**——`default_model`、**`[providers.clovapi]`**（`type` 由 api-style 映射）、**`[models.<id>]`** 中 `provider = "clovapi"` 及来自配置的 `model`。

**cc-switch / ccswitch** 只处理 Claude Code 的 JSON；OpenCode / OpenClaw / Hermes / Kimi 为 **clovapi 独有**适配（与各上游文档对齐）。

在 Windows 上会正确展开用户目录与 AppData 路径。

## 与社区 cc-switch / ccswitch（「cc-switcher」）对比

**Claude Code 路径：** clovapi 与 [huangdijia/ccswitch](https://github.com/huangdijia/ccswitch) / [HoBeedzc/cc-switch](https://github.com/HoBeedzc/cc-switch) 使用相同的**凭据结构**：**`env.ANTHROPIC_AUTH_TOKEN`**（+ **`ANTHROPIC_BASE_URL`**），**不含** `ANTHROPIC_API_KEY`（避免 Claude Code「认证冲突」）。**`settings.json`** 为合并写入（保留其他顶层键）；**`model`** 与 **`env.ANTHROPIC_*_MODEL`** 来自本次绑定。

**扩展：** clovapi 将**同一套上游设置**同步到 **Codex**、**OpenCode**、**OpenClaw**、**Hermes**、**Kimi Code CLI**——超出常见 npm cc-switch 的范围。

### 命令别名（沿用 cc-switch / ccswitch 肌肉记忆）

| clovapi | 别名 | 类似 |
|---------|------|------|
| `profiles` | `list`、`ls` | `cc-switch list`、`ccswitch list` |
| `add` | `set`、`new` | 一次性保存上游绑定 |
| `switch [--cli …]` | `use …` | 将单个 profile 推入单一工具 |
| `remove NAME` | `rm`、`delete` | 删除单条 profile |

### 状态存放位置

| 工具 | 配置存放 |
|------|----------|
| [cc-switch](https://github.com/HoBeedzc/cc-switch) | `~/.claude/profiles/*.json` + `.current` |
| [ccswitch](https://github.com/huangdijia/ccswitch) | `~/.ccswitch/ccs.json` |
| **clovapi** | Windows：`%APPDATA%\clovapi\profiles.json`；Unix：`~/.config/clovapi/profiles.json`——`profiles` 数组 + `active` 映射 |

本模块内 **`go test ./...`** 可通过；真实上游调用需在本地配置密钥。

## 相关链接

### Agent 配置切换

- [CC Switch（CCSwitch）](https://github.com/farion1231/cc-switch) — 桌面版 All-in-One Agent API 切换（Claude Code、Codex、OpenCode、OpenClaw 等）
- [cc-switch-cli](https://github.com/saladday/cc-switch-cli) — CC Switch 的 CLI fork
- [cc-switch](https://github.com/HoBeedzc/cc-switch) — 社区 Claude Code profile 切换（npm）
- [ccswitch](https://github.com/huangdijia/ccswitch) — 社区 Claude Code 配置切换

### 系统提示与工具变更追踪

- [cchistory](https://github.com/badlogic/cchistory) — 提取并对比不同 Claude Code 版本的 system prompt 与 tool 定义
- [claude-code-changelog](https://github.com/marckrenn/claude-code-changelog) — 社区维护的 Claude Code prompt / feature flag 演进追踪

### 评测与 Agent 生态

- [Harbor](https://github.com/harbor-framework/harbor) — Terminal-Bench 官方 harness
- [Terminal-Bench](https://www.tbench.ai/) — 终端 Agent 基准数据集
- [Harbor 与各 Agent 的 API 控制](harbor-agents.zh.md) · [Agent 仓库索引](agent-repos.zh.md)

### 上游模型与套餐

- [OpenCode](https://github.com/anomalyco/opencode) — 开源 Agent IDE/CLI（[配置文档](https://opencode.ai/docs/config)）
- [OpenRouter](https://openrouter.ai/) — 聚合多家模型与免费/折扣套餐的 API 网关

## DeepSeek + Claude Code（Anthropic 兼容）

使用 API 形态 **`claude`**，Base URL 以 DeepSeek 文档为准：

- **Base URL：** `https://api.deepseek.com/anthropic`
- **API key：** DeepSeek 密钥（建议用环境变量 `DEEPSEEK_API_KEY` 或 `CLOVAPI_API_KEY`，勿提交密钥）
- **模型（必填）：** 例如 `deepseek-v4-flash` 或 `deepseek-v4-pro`，通过 `--model` 指定（省略时会提示输入）

连通性检测（`clovapi add` 保存时）：对 **`POST …/v1/messages`** 携带模型（Anthropic 头）。若 Messages 路径返回 **404**，**`add`** 会改用 **`POST https://<同一主机>/v1/chat/completions`**，**Bearer** 为同一密钥（统一网关场景）。

```bash
clovapi add --api-style claude \
  --name deepseek-claude \
  --base-url https://api.deepseek.com/anthropic \
  --model deepseek-v4-flash \
  --api-key "$DEEPSEEK_API_KEY"

clovapi switch --cli claude-code
```

## DeepSeek + Codex（OpenAI 兼容）

使用 **`codex`** + **`openai-responses`**（旧写法 **`openai`** 仍接受并会存为 responses）。DeepSeek 的 OpenAI Base URL 为 **`https://api.deepseek.com`**（列举模型用 `GET /v1/models`）。Codex 的 `model_providers.*.base_url` 请带上 **`/v1`** 后缀以匹配 OpenAI 风格路由：

```bash
export DEEPSEEK_API_KEY="..."   # 勿把密钥粘贴到聊天记录

clovapi add --api-style openai-responses \
  --name deepseek-codex \
  --base-url https://api.deepseek.com/v1 \
  --model deepseek-v4-pro \
  --api-key "$DEEPSEEK_API_KEY"

clovapi switch --cli codex
```

`switch` 会写入 `~/.codex/config.toml`，提供 **`clovapi-relay`** 提供商，根据绑定设置 **`model`**，并将 **`model_provider`** 指向该块。

### 仍出现 401 或认证冲突？

在 **`go build`** 之后，再次运行 **`clovapi switch --cli claude-code`**（前提是已执行 **`clovapi add`**）。打开 **`%USERPROFILE%\.claude\settings.json`**：应能看到 **`env.ANTHROPIC_AUTH_TOKEN`**（以及 **`ANTHROPIC_BASE_URL`**），且**不应出现 `env.ANTHROPIC_API_KEY`**。若在系统/用户环境变量里全局设置过凭据（`setx` / 系统属性），请移除重复项。
