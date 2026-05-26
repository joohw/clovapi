# Develop Notes

本文档列举当前 clovapi 里围绕「配置 Agent、通过本地代理把订阅/上游转成 API」的主要抽象。

## 核心抽象

### 1. Agent Kind

- 位置：`core/internal/agentkind/`
- 代表一个本地 Agent CLI，例如 `claude-code`、`codex`、`opencode`、`openclaw`、`hermes`、`kimi-code`。
- 主要类型：`agentkind.Kind`
- 作用：作为 apply、active selection、UI 管理和本地代理入口选择的统一 Agent 标识。

### 2. API Style

- 位置：`core/internal/apistyle/`
- 代表请求/响应的协议形状，而不是供应商。
- 当前值：`claude`、`openai-chat`、`openai-responses`、`gemini`。
- 主要类型：`apistyle.Style`
- 作用：区分入口协议和上游协议，让代理可以在不同 wire format 之间转码。

### 3. Provider Registry

- 位置：`core/internal/provider/`
- 代表内置供应商入口。
- 当前固定 provider：`claude-code`、`codex`、`ollama`、`custom-api`。
- 主要类型：`provider.Definition`、`provider.Ingress`
- 作用：生成和解析本地代理路径，例如 `/{providerId}/{modelId}/{apiStyle}/v1/...`。

### 4. Profile / Model / Store

- 位置：`core/internal/profile/`
- 代表持久化的供应商、模型、active selection 和代理配置。
- 主要类型：`profile.Profile`、`profile.Model`、`profile.ActiveSelection`、`profile.Store`、`profile.ProxyConfig`
- 作用：保存 `profiles.json`。`active` 现在直接保存 `{provider_id, model_id}`，旧的 `@model:Vendor/model` 只作为读取迁移和 deprecated CLI 输入兼容存在。

### 5. Provider/Model Resolution

- 位置：`core/internal/profile/desktop.go`、`core/internal/profile/current.go`
- 主要函数：`FindProviderModel`、`FlatProfileForProviderModel`、`ResolveWireModelForIngress`
- 作用：把 `provider_id + model_id` 直接解析成可用于 apply 或 proxy forward 的扁平 profile，不再通过独立 binding 抽象中转。

### 6. Subscription Credentials Hydration

- 位置：`core/internal/profile/subscription_auth.go`
- 主要函数：`HydrateSubscriptionCredentials`
- 作用：订阅 profile 自身不长期保存完整上游凭据；运行时从官方 CLI/OAuth 文件读取并补齐。
- Claude 读取 `~/.claude/.credentials.json`，Codex 读取 `$CODEX_HOME/auth.json` 或 `~/.codex/auth.json`。

### 7. Apply Target

- 位置：`core/internal/apply/`
- 主要接口：`apply.ProfileTarget`
- 主要实现：`target_claude_code.go`、`target_codex.go`、`target_opencode.go`、`target_openclaw.go`、`target_hermes.go`、`target_kimi.go`
- 作用：把一个扁平 profile 写入对应 Agent CLI 的本地配置，并支持恢复默认配置、检测是否安装、声明支持的 API style。

### 8. Local Proxy Server

- 位置：`core/internal/proxy/`
- 主要类型：`proxy.Server`
- 作用：提供本地 HTTP 代理，Agent CLI 只访问 `127.0.0.1:{port}`，代理负责解析入口、转码、加认证头、请求上游、转回响应。

### 9. Proxy Route Resolution

- 位置：`core/internal/proxyresolve/`
- 主要类型：`IngressContext`、`ForwardRoute`、`AuthSummary`、`UpstreamAuth`
- 主要函数：`ResolveIngressContext`、`ResolveForwardRoute`、`UpstreamPathSuffix`、`UpstreamAuthHeaders`、`JoinURL`
- 作用：把本地代理入口解析成真实上游请求信息，包括 `provider_id`、`model_id`、ingress style、egress style、上游 URL、来源和认证头。

### 10. Protocol IR

- 位置：`core/internal/protocol/`
- 主要类型：`Request`、`Message`、`Tool`、`Metadata`、`ResponseEvent`、`ExtensionNode`、`InputSlot`
- 作用：作为协议转码中间层。入口请求先 decode 成 IR，再 encode 成上游 API style；上游响应/SSE decode 成事件，再 encode 成入口 Agent 需要的 SSE。

### 11. Protocol Extension

- 位置：`core/internal/protocol/extension.go`
- 主要类型：`ExtensionNode`
- 作用：保留 IR 无法通用表达的 wire-specific 字段或 SSE 事件，避免在 openai-responses、anthropic 等协议之间转换时丢失工具调用、输入项或上游扩展字段。

### 12. Upstream Request Policy

- 位置：`core/internal/proxy/server.go`
- 主要函数：`applyUpstreamRequestPolicy`
- 作用：按上游来源附加特殊编码策略：Codex 订阅省略 Responses 采样参数，Claude 订阅启用 OAuth 兼容编码。

### 13. Subscription Auth

- 位置：`core/internal/subscriptionauth/`、`core/internal/desktop/`、`electron/preload.js`
- 主要入口：`clovapi desktop auth login|status|logout`、`window.clovapiSubscription`
- 作用：core 负责 OAuth 登录、写入官方 CLI 兼容凭据、查询登录状态、登出订阅；Electron 只作为薄壳调用 core 命令并展示结果。

### 14. Desktop UI Vendor Model

- 位置：`electron/ui/src/lib/helpers.ts`、`electron/ui/src/lib/store/`
- 主要概念：vendor、managed vendor list、subscription vendor、active selection。
- 作用：桌面 UI 固定管理四类供应商，并把用户选择落到 `profiles.json` 的 provider/model selection。

### 15. Test / Probe Client

- 位置：`core/internal/testclient/`、`core/internal/desktop/test.go`
- 作用：通过本地代理入口进行 provider/model 连通性测试，而不是直接测试上游。这样可以覆盖实际的 route resolve、协议转码、认证头和 SSE 转换链路。

## 订阅转本地 API 的抽象链路

1. 桌面端通过 OAuth 登录订阅，并写入 Claude/Codex 官方 CLI 兼容凭据。
2. `profile.Store` 保存订阅 vendor、模型列表和 active provider/model selection。
3. Agent CLI 通过 `apply.ProfileTarget` 被配置为访问本地代理入口。
4. 本地代理从路径解析出 `provider_id`、`model_id`、`api_style`。
5. `proxyresolve.ResolveForwardRoute` 直接用 provider/model 解析上游 URL、上游协议、模型和认证信息。
6. `profile.HydrateSubscriptionCredentials` 在运行时补齐订阅 OAuth token 和 account id。
7. `protocol.PrepareUpstreamRequest` 把入口协议 decode 成 IR，再 encode 成上游协议。
8. `proxyresolve.UpstreamAuthHeaders` 为 Claude/Codex 订阅生成官方后端需要的认证头。
9. 上游响应进入 `protocol` 响应转码层，再以入口 Agent 期望的 SSE/JSON 形态返回。

## 关键边界

- `profile` 只负责配置、provider/model 解析和凭据补齐，不负责 HTTP 转发。
- `provider` 只负责固定供应商和代理入口路径，不保存凭据。
- `proxyresolve` 只负责把入口解析成上游路由和认证信息，不做协议转码。
- `protocol` 只负责协议 IR 和转码，不决定上游 URL、订阅来源或凭据。
- `apply` 只负责改写各 Agent CLI 的本地配置，不直接调用上游。
- `electron` 负责 IPC 和 UI 状态；订阅登录、凭据写入和核心代理均由 Go core 执行。
