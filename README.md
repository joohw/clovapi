# clovapi

clovapi 是一个共享模型 API 网络。用户创建平台 API Key 后，即可通过统一的 OpenAI 兼容接口选择并调用当前在线的共享模型；无需安装 CLI、配置上游或先贡献 API。

拥有可共享模型资源的用户可以运行 clovapi CLI 作为贡献节点。上游地址和密钥保留在节点本地，平台只接收可用模型 ID，并通过节点的出站连接转发请求与流式响应。

Agent CLI 配置切换与管理已经迁移到 [clovagent](https://github.com/joohw/clovagent)。

## 核心能力

- 一套平台 API Key 调用在线共享模型。
- 通过 `/v1/models` 查看当前可用模型，通过 `/v1/chat/completions` 或 `/v1/responses` 发起调用。
- 无需贡献即可使用共享网络；贡献者可通过 CLI 节点增加模型供给。
- 贡献节点自动同步本地可用模型，并可设置每日上限、暂停或断开。
- 节点侧支持 OpenAI、Anthropic、Gemini 等协议适配，上游凭据不会上传到平台。

## 快速开始

在控制台创建 Consumer API Key，然后查询在线模型：

```bash
curl https://api.clovapi.com/v1/models \
  -H "Authorization: Bearer YOUR_CONSUMER_API_KEY"
```

```bash
curl https://api.clovapi.com/v1/chat/completions \
  -H "Authorization: Bearer YOUR_CONSUMER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"MODEL_FROM_LIST","messages":[{"role":"user","content":"Hello"}]}'
```

要贡献你有权共享的模型资源，请安装 CLI，在本地配置 Provider 后运行控制台生成的连接命令：

```bash
npm i -g @clovapi/cli
clovapi share start --key YOUR_CLI_CONNECTION_KEY
```

CLI 会自动同步当前配置目录中的可用模型。完整说明见[共享节点](docs/cli-sharing.md)。本地代理仍作为贡献节点的执行与协议适配能力保留，也可用于高级本地调用。

## 目录

| Directory | Role |
| --- | --- |
| `core/` | Go CLI、贡献节点执行器、协议适配与 Relay 核心 |
| `npm/` | npm launcher package (`@clovapi/cli`) |
| `web/` | React + Vite 浏览器管理界面 |
| `landing/` | 部署到 Workers Static Assets 的 clovapi.com 站点 |
| `platform/` | Cloudflare Worker 平台 API、D1 控制面与 Durable Object Relay |

## 文档

- [日志实现](docs/logs.md)：系统日志和调用日志的触发条件、存储、脱敏与管理方式。
- [智能路由设计](docs/smart-routing-design.md)
- [CLI 共享节点](docs/cli-sharing.md)：接入贡献节点并自动同步本地可用模型。
- [Cloudflare 迁移方案](docs/cloudflare-migration.md)：服务拆分、状态归属、迁移顺序和上线验收清单。
- [在线文档](https://clovapi.com/zh-CN/docs)：创建调用凭证、选择共享模型并接入应用。

## 开发

```bash
npm ci --prefix web
npm run dev
```

打开 `http://127.0.0.1:31873`，前端支持热更新，Go 修改后自动重新编译并重启服务。生产构建使用 `npm run build`，不要跳过静态资源构建直接发布 Go 二进制。

```bash
cd core
go test ./...
```

前端检查：`npm run check:web`。更多说明见 [web/README.md](web/README.md)。

Cloudflare 目标平台可独立启动和检查：

```bash
npm ci --prefix platform
npm run check:platform
npm run dev:platform
```

日常开发使用 `dev` 分支，合并并推送到 `main` 后由 Cloudflare Workers Builds 自动构建、部署生产环境；`dev` 不产生预览部署。无需 GitHub Actions、人工审批或仓库中的 `CLOUDFLARE_API_TOKEN`。`clovapi-platform` 的发布脚本会校验配置、应用 D1 migration 并部署 Worker；`clovapi-landing` 生成静态站并部署到现有 DNS 上的 Worker Routes。运行时 secrets 仅保存在 Cloudflare，手动 Wrangler 发布保留作紧急回滚。旧 VPS 发布仅作为迁移期回滚入口保留在 `npm run deploy:legacy-vps`。完整设置见 [Cloudflare 迁移方案](docs/cloudflare-migration.md)。
