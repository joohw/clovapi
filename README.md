# clovapi

clovapi 是一个本地 API 代理：保存上游 provider/model 配置，在本机启动 HTTP 代理，并在 OpenAI / Anthropic / Gemini 兼容请求之间做路由与协议转换。

Agent CLI 配置切换与管理已经迁移到 [clovagent](https://github.com/joohw/clovagent)。

## 核心能力

- 保存本地 profiles：base URL、API key、API style、模型。
- 启动本地代理：默认 `http://127.0.0.1:27483`。
- Provider 路由：`/{providerId}/v1/...`。
- 协议转换：Anthropic Messages、OpenAI Chat Completions、OpenAI Responses、Gemini。
- 桌面端查看 profiles、代理状态、调用日志和系统日志。

## 快速开始

```bash
cd core
go build ./cmd/clovapi
./clovapi proxy start
```

常用命令：

```bash
clovapi profiles load --json
clovapi profiles test --provider custom --model my-model --json
clovapi proxy status
clovapi proxy logs list
```

## 目录

| Directory | Role |
| --- | --- |
| `core/` | Go CLI 与本地代理核心 |
| `npm/` | npm launcher package (`@clovapi/cli`) |
| `electron/` | Electron + Svelte 桌面端 |
| `landing/` | clovapi.com 站点 |

## 文档

- [日志实现](docs/logs.md)：系统日志和调用日志的触发条件、存储、脱敏与管理方式。
- [智能路由设计](docs/smart-routing-design.md)

## 开发

```bash
cd core
go test ./...
```
