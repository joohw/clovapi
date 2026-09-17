# clovapi core

clovapi 共享模型 API 网络的 Go CLI、贡献节点执行器与本地协议适配核心。

Agent CLI 切换已迁移到 [clovagent](https://github.com/joohw/clovagent)。

## 贡献共享模型

消费者直接通过 clovapi 平台调用在线共享模型，不需要安装本 CLI。CLI 面向贡献者：先配置你有权共享的 Provider，再运行控制台生成的连接命令：

```bash
clovapi share start --key YOUR_CLI_CONNECTION_KEY
```

节点会自动同步当前配置目录里的可用模型。上游 Base URL 和 API Key 留在本地；平台只接收模型 ID。可使用 `share status`、`share pause` 和 `share resume` 管理节点。

## 开发命令

```bash
go build ./cmd
go test ./...
```

```bash
clovapi proxy start
clovapi proxy status
clovapi profiles load --json
clovapi profiles save --json
clovapi profiles test --provider custom --model my-model --json
```

## 高级本地代理

本地代理是贡献节点执行和协议转换的底层能力，也可以独立使用；它不是 clovapi 的主要产品定位。默认监听：

```text
http://127.0.0.1:27483
```

Provider 作用域入口：

```text
http://127.0.0.1:27483/{providerId}/v1/...
```

代理根据 `profiles.json` 解析 `{providerId}`，转发到对应上游，并按需转换请求/响应协议。

## 存储

Profiles 存放在：

| OS | Path |
| --- | --- |
| Windows | `%APPDATA%\clovapi\profiles.json` |
| macOS / Linux | `~/.config/clovapi/profiles.json` 或 `$XDG_CONFIG_HOME/clovapi/profiles.json` |

## Browser UI

Build from the repository root with `npm ci --prefix web` and `npm run build`, then run `core/clovapi serve` (`core\clovapi.exe serve` on Windows). Open http://127.0.0.1:27484. The embedded Vite UI is served by Go on a loopback listener independent of the proxy. A direct `go build` without first building the UI produces a CLI-only development binary with a build-instructions page.
