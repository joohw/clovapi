# clovapi core

clovapi 的 Go CLI 与本地代理核心。

Agent CLI 切换已迁移到 [clovagent](https://github.com/joohw/clovagent)。

## 命令

```bash
go build ./cmd/clovapi
go test ./...
```

```bash
clovapi proxy start
clovapi proxy status
clovapi profiles load --json
clovapi profiles save --json
clovapi profiles test --provider custom-api --model my-model --json
```

## 代理入口

本地代理默认监听：

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
