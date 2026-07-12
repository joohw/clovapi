# clovapi 日志实现

本文说明 clovapi 当前的日志边界、触发条件、数据结构、存储与读取方式，以及后续演进约束。文中的“当前实现”描述已经落地的行为；“后续规划”不代表当前已经支持。

## 日志分类

clovapi 使用两套相互独立的持久化日志：

| 类型 | 用途 | 默认数据库 |
| --- | --- | --- |
| 调用日志（call logs） | 记录经过本地代理的请求、路由、上游响应和 token 用量 | `~/.config/clovapi/logs/call-logs.sqlite` |
| 系统日志（system logs） | 记录配置更新和需要排查的错误事件 | `~/.config/clovapi/logs/system-logs.sqlite` |

Windows 使用 clovapi 的 `%APPDATA%` 配置目录替代 `~/.config/clovapi`。两套日志均使用 SQLite WAL 模式，互不依赖，也可以分别清空。

系统日志不是代理进程所有 stdout/stderr 的自动归档。后台代理进程的原始输出仍写入独立的 `proxy.log`；只有显式调用 `internal/syslog` 的事件才会进入 `system-logs.sqlite`。

## 系统日志何时写入

当前系统日志采用低频白名单策略，只记录配置更新和错误。代理正常启动、停止、健康轮询等生命周期事件不会写入系统日志。

### Profiles 保存

- `profiles.json` 规范化后的内容发生实质变化并原子保存成功后写入 `system`，例如 `profiles saved vendors=4`。
- 桌面端重复提交与当前配置等价的内容时，不重写文件，也不写系统日志。
- 临时文件重命名失败时写入 `stderr`，并带有错误信息。
- 创建目录、序列化或写入临时文件等更早阶段的错误会返回给调用方，但当前不会额外写入系统日志。

### 订阅 OAuth

Codex 和 Claude Code 的订阅登录只记录最终配置更新与错误：

- 凭据保存成功；
- 登录失败；
- 回调路径不匹配；
- OAuth 回调被拒绝。

登录开始、回调监听、打开浏览器、收到 code 和 token 交换成功等正常中间步骤不会写入。OAuth 日志只应包含阶段、provider 和错误摘要，不应写入 access token、refresh token、authorization code 或完整授权 URL。

### 无效代理探测

对无法解析为合法 provider 路由的 `GET`/`HEAD` 探测请求，系统日志会记录类似：

```text
probe GET /unknown/v1/models -> HTTP 404: provider route not found
```

以下请求不会形成这类系统日志：

- 合法的模型列表请求；它们属于调用日志；
- 裸 `/v1/...` 兼容探测；
- `/health`；
- `/__debug/...`。

### 显式 CLI 写入

以下命令也可以直接产生系统日志：

```bash
clovapi proxy syslogs append --json '[{"stream":"system","message":"example"}]'
clovapi proxy syslogs log-profiles
```

`log-profiles` 是内部辅助命令。`append` 接受任意 stream；当前自动写入主要使用 `system`、`stderr` 和 `proxy`。

## 调用日志何时写入

调用日志针对合法的 provider 代理入口创建完整 trace：

```text
/{providerId}/v1/...
```

当前规则如下：

- 合法入口上的非 `GET`/`HEAD` 请求会记录，包括最终返回错误的请求；
- 合法的模型列表 `GET`/`HEAD` 请求会记录；
- 无效入口不创建调用日志；
- `/health` 和 `/__debug/...` 不记录；
- 普通 `GET`/`HEAD` 探测不记录，避免健康检查污染调用历史。

trace 在请求进入时创建，在请求处理结束时写入 SQLite。一次调用日志包含：

- 请求开始、完成时间和耗时；
- 入站方法、URL、HTTP 版本、Headers 和 Body；
- API Key 脱敏标签及 SHA-256 指纹前 12 位；
- 最终后端、provider、请求模型、上游模型和尝试过的后端列表；
- 上游请求 URL、脱敏 Headers、状态码、响应 Headers 和 Body；
- input、output、total、cache read、cache creation、reasoning token；
- tool call 数量；
- 代理或上游错误摘要。

路由失败或发生回退时，同一条调用日志会保留 `attemptCount` 和 `attemptBackends`，最终后端信息对应最后一次实际尝试。

## 数据结构

### 系统日志

`system_logs` 表：

| 字段 | 说明 |
| --- | --- |
| `id` | SQLite 自增 ID |
| `at` | RFC3339Nano UTC 时间 |
| `stream` | 事件通道 |
| `message` | 文本消息 |

索引为 `(at DESC, id DESC)`，默认读取最近 20 条。

### 调用日志

`call_logs` 使用字符串 ID，并分别存储时间、耗时、API Key 摘要、路由 JSON、请求 JSON、上游 JSON、token 计数、tool call 计数和错误文本。索引为 `(started_at DESC, id DESC)`。

调用日志列表默认每页 20 条。API Key 聚合基于 fingerprint，覆盖数据库中的全部调用日志，而不是只聚合当前页。

## 敏感信息处理

调用日志在持久化前执行以下处理：

- `Authorization`、`X-API-Key`、`API-Key`、`X-Goog-API-Key` Header 的值会替换为 `[redacted]`；
- API Key 展示标签不含 `Bearer`，长 Key 只保留前 6 位和后 4 位；
- API Key 聚合仅使用 SHA-256 指纹前 12 位，不保存完整 Key；
- JSON Body 中常见的 secret、token、password、authorization 等字段会递归替换为 `[redacted]`；
- OpenAI Responses 响应中的请求回显字段会被移除。

这些处理不等同于完整的数据防泄漏方案。用户 prompt、模型输出、非标准 Header 和未被识别的 JSON 字段仍可能包含敏感信息。因此：

- 日志数据库应按敏感本地数据管理；
- 导出调用日志前必须人工检查；
- 新增日志字段时不得直接写入凭据、cookie、OAuth code 或完整授权 URL；
- 系统日志消息同样必须在调用 `syslog.Write` 前完成脱敏。

## 大小限制与保留策略

当前限制：

- 入站代理 Body 最大 4 MiB，超过后请求会失败；
- 非流式上游响应最多缓冲 64 MiB；
- 流式 SSE 响应最多保留前 8 MiB，超出部分标记为 truncated；
- 系统日志单条消息当前没有额外长度限制。

当前没有自动 TTL、数量上限、数据库轮转、定期压缩或 VACUUM。调用日志包含请求和响应 Body，数据库可能持续增长。桌面端和 CLI 的“清空”操作执行 `DELETE`，不保证 SQLite 文件立即缩小。

## 读取和管理

### CLI

```bash
# 系统日志
clovapi proxy syslogs list
clovapi proxy syslogs list --limit 100 --json
clovapi proxy syslogs clear --yes

# 调用日志
clovapi proxy logs path
clovapi proxy logs list --limit 20 --offset 0 --json
clovapi proxy logs read <id>
clovapi proxy logs export --out call-logs.jsonl
clovapi proxy logs clear --yes
```

### 本地调试 API

```text
GET    /__debug/system-log?limit=20
DELETE /__debug/system-log
GET    /__debug/call-log?limit=20&offset=0
DELETE /__debug/call-log
```

调试接口属于本地代理的内部管理面。桌面端通过这些接口读取、分页和清理日志。

## 实现约束

新增日志行为时遵守以下规则：

1. 用户请求级信息进入调用日志；配置更新和低频错误进入系统日志。
2. 高频事件不得进入系统日志，避免把事件表变成第二份调用日志。
3. 日志失败不得中断正常代理请求；当前写入采用 best-effort 语义。
4. 写入前完成脱敏，不依赖 UI 隐藏敏感字段。
5. 新增系统事件时，同时补充本文的触发场景。
6. 修改调用日志结构时，必须兼容旧 SQLite 列并增加迁移测试。
7. 涉及路由回退的日志必须保留所有尝试过的 backend，便于解释最终选择。

## 后续规划

建议按以下顺序演进：

1. **保留策略**：支持按天数、总大小或最大条数清理，并在清理后按需 checkpoint/VACUUM。
2. **聚合性能**：将 API Key 聚合改为增量统计或可索引的结构化列，避免大型调用日志数据库的全表扫描。
3. **系统日志分页与过滤**：支持 offset/cursor、stream、时间范围和关键词过滤。
4. **结构化系统事件**：增加稳定的 event code 和 metadata，同时保留可读 message。
5. **隐私模式**：允许关闭 Body 持久化，或只保存大小、哈希和 token 统计。
6. **可观测性**：增加数据库大小、最后写入时间、丢弃/截断数量和清理结果指标。
