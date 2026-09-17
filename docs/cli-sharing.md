# CLI 共享节点

一个贡献节点代表一个 CLI 实例。CLI 自动发现并同步本地已配置的可用模型，无需在网页手动创建节点，也无需为共享选择 profile 或填写模型 ID。在控制台复制连接命令，粘贴到本地终端运行，平台会自动关联账户并创建节点。

## 运行一个节点

先准备本地上游配置，可在 `clovapi serve` 管理页面填写上游地址、API 密钥和模型，也可使用 CLI：

```bash
clovapi add --name shared-api --api-style chat --base-url https://YOUR-UPSTREAM/v1 --api-key YOUR_UPSTREAM_KEY --model YOUR_MODEL_ID
```

登录控制台，在“贡献节点”中复制 CLI 连接命令，直接运行：

```bash
clovapi share start --key YOUR_CLI_CONNECTION_KEY
```

首次打开“贡献节点”时，控制台自动分配连接密钥并显示完整连接命令。命令里的连接密钥已包含平台地址，CLI 自动识别远程平台或本地开发平台，不需要额外填写 `--platform`。运行命令后直接接入并共享，不需要再次打开浏览器确认。分配密钥时不会预先创建节点；实际运行 CLI 后，平台才创建或恢复该实例的账户节点。

CLI 连接成功后会保存独立的节点凭证，后续在同一配置目录启动时只需：

```bash
clovapi share start
```

`share start` 在前台运行，适合交给系统服务或容器管理；终止进程即停止该节点。需要重新连接时，先停止正在运行的共享进程，再执行网页提供的带 `--key` 命令。同一实例重新连接会沿用原节点和当天用量。

`share start` 支持可选的 `--daily-limit N` 设置本地每日请求上限，首次默认值为 100。网页设置的是平台侧节点上限；两侧限制同时生效，实际可接受请求数受较低的一侧约束。

```bash
clovapi share status
clovapi share pause
clovapi share resume
```

节点主动建立到平台的 WebSocket 长连接（HTTPS 平台使用 WSS），不需要公网 IP、端口转发或运行 `proxy start`。平台通过这条连接即时推送请求，CLI 使用现有代理的协议转换能力执行，并逐块回传响应。任务派发不使用轮询。

## 模型同步与节点管理

CLI 自动同步本地可用模型的 ID 列表；增加、移除或变更本地配置后，节点的模型列表随之更新。暂时没有可用模型时，节点仍可保持连接，配置好模型后再提供调用。显式模型别名保持不变；本地通用 ID `default` 使用其实际模型 ID 对外发布。平台不接收上游 API 密钥或 Base URL，不要求为每个模型创建独立节点。授权连接的范围是该 CLI 实例中可用的本地模型。

控制台的“贡献节点”显示已连接实例、同步的模型、在线状态和每日请求用量，可暂停或恢复共享、修改节点每日请求上限，也可断开节点。断开会撤销节点凭证并终止该节点的共享任务；再次接入需执行有效的连接命令。暂停只阻止新请求，正在执行的请求可以完成。

CLI 连接密钥归属于账户，分配后保持固定，可以用于连接多个 CLI 实例。停止某个节点使用该节点的“断开”操作。CLI 连接密钥、节点凭证和消费者 API Key 分别用于接入、运行节点和调用模型，不能互换。

控制台持续显示完整连接命令，刷新页面后仍可复制。新密钥的随机部分使用 22 个字符，CLI 仍支持旧版 43 个字符的随机部分。平台使用 `AUTH_SECRET` 派生的密钥加密保存 CLI 连接密钥；旧版只存哈希的密钥或更换 `AUTH_SECRET` 后无法恢复的密钥，会在下次打开页面时自动替换一次，已连接节点不受影响。

## 消费者调用

在控制台创建消费者 API Key。调用者不需要安装 CLI，使用平台的 `/v1` 作为 API Base URL。以下 `localhost:3100` 是开发平台示例地址，请替换为实际平台地址。

```bash
curl http://localhost:3100/v1/models \
  -H "Authorization: Bearer YOUR_CONSUMER_API_KEY"

curl http://localhost:3100/v1/chat/completions \
  -H "Authorization: Bearer YOUR_CONSUMER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"YOUR_MODEL_ID","messages":[{"role":"user","content":"Hello"}],"stream":true}'
```

支持 `POST /v1/chat/completions`、`POST /v1/responses` 的普通和流式响应。模型列表取自已授权且在线、可接收任务的贡献节点同步的模型 ID。调用时使用列表中的完整 ID；没有匹配供给时返回错误，不替换成其他模型。

## 公开模型目录

首页的“模型”入口打开 `/zh-CN/models` 或 `/en/models`，无需登录即可查看可用模型、供给节点数、近 24 小时与近 7 天的调用量。`GET /api/models` 提供相同的公开聚合数据；`GET /v1/models` 仍要求消费者 API Key。

模型供给取自 relay 当前可接收请求的节点，按模型 ID 合并。目录不发布账户、节点身份、密钥或上游地址。页面中的调用量汇总仅针对本次快照里可用的模型；模型暂时没有可用节点时不会出现在列表里，已有使用统计仍然保留。

Relay 将目录快照缓存在内存中，每 60 秒更新一次，同一轮请求共用一次更新。页面每分钟自动读取快照，并显示更新时间。短暂更新失败时最多保留 5 分钟旧快照并标明数据延迟；没有可用缓存时返回 503，不把故障显示成零模型。

调用量在平台成功接收请求时计数，后续失败或取消仍计入；鉴权、模型、限额或并发检查拒绝的请求不计入。匿名的分钟聚合独立于原始请求记录保存至少 7 天，只包含模型 ID、时间段和请求数。近 24 小时与近 7 天的窗口截止到最近一个完整分钟，趋势按 UTC 日期展示。升级时仅回填仍保留的请求元数据，页面会说明统计开始时间，不补造更早的历史。

## 平台运行

平台由两个解耦容器组成：Go Platform Backend 监听 API 域名，Next.js Web App 只提供页面。Backend 同时承载控制面、消费者 `/v1` API 和贡献节点 WebSocket，不再通过内部 HTTP 回调 Next.js 完成准入。

```bash
cp backend/env.example backend/.env
docker compose --env-file backend/.env -f backend/compose.yaml up -d --build
docker build -f landing/Dockerfile.frontend --build-arg NEXT_PUBLIC_CLOVAPI_API_URL=https://api.clovapi.com -t clovapi-web .
```

Backend 的 `/data` 卷持有 SQLite 平台状态；Next.js 不挂载数据库。生产环境将 `api.clovapi.com` 指向 Backend，将 `clovapi.com` 指向 Web App，并在 Backend 的 `CLOVAPI_ALLOWED_ORIGINS` 中允许网页 origin。

公网 HTTPS 反向代理须为 Backend 转发原始 Host、WebSocket Upgrade，并将读取超时设为至少 130 秒。`CLOVAPI_RELAY_SECRET` 只用于迁移期旧内部事件接口；进程内控制面不需要它。

平台与 CLI 应一同升级到长连接版本。原有账户、连接密钥、节点身份和每日用量保留；旧轮询接口返回升级提示，旧任务及响应缓冲表会在初始化时移除。

## 运行边界

- 一个 CLI 实例连接一个账户节点，可共享多个本地模型；所有模型合计最多同时执行 5 个请求，共用该节点的每日请求上限。所有匹配节点都满载时立即返回错误，不进入轮询任务池。需要多个节点时使用独立的运行环境和配置目录。
- 一个节点最多同步 256 个有效模型 ID，每个 ID 最长 160 个 ASCII 字符。
- 每日上限按 UTC 自然日计算，平台与 CLI 分别执行，任一侧达到上限就停止接受新请求。平台准入时原子预留一次额度，CLI 执行前持久化本地计数；上游失败不退回，重新启动不能清空当天本地计数。
- 每日请求上限不是 token 或金额预算，不能保证上游费用或剩余 token 数。自动判断空闲、自用优先和按时段共享尚未实现。
- 暂停阻止新请求，正在执行的请求可以完成；客户端取消、任务超时或凭证撤销会终止任务。上游取消取决于网络传播和上游行为。
- 本版共享请求不扣减基础免费额度、不生成贡献积分，不进行 token 计价或结算。控制台的积分余额不代表共享请求的用量。
- 上游密钥只供本地代理使用，不会放入平台任务或消费者响应。请求和响应经过平台、贡献节点及上游，不能视为对这些处理方保密。
- Go relay 在内存中转发请求和流式响应；SQLite 只保存准入、用量和终态元数据，不写入请求正文或响应块。每个请求具有独立流控窗口，慢消费者和单个请求取消不阻塞同节点的其他请求。
- 单次请求最长 120 秒，请求正文最多 512 KiB，响应正文最多 8 MiB。断线会取消在途请求；CLI 自动重连后接受新请求，不自动重放可能已经产生上游费用的请求。
- 当前部署使用一个 relay 持有节点连接。多实例部署需要先实现连接归属和跨 relay 路由，不能将多个独立 relay 直接放在随机负载均衡后。

## 验证

```bash
cd core
go test ./...
cd ../landing
npm run test:sharing
npm exec tsc -- --noEmit --incremental false
```

端到端测试在隔离数据库、隔离 CLI 配置和本地模拟上游之间运行真实 Go relay、CLI 与平台 Route Handler，覆盖 5 并发、流式交付、取消、动态模型、限额和断线重连，不使用真实上游密钥或发送真实模型请求。
