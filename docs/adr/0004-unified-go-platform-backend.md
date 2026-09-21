# 0004: 合并控制面与 Relay 为统一 Go Platform Backend

> 状态：已由 [ADR-0005](0005-cloudflare-native-platform.md) 取代；本文件保留迁移前决策背景。

- Status: Accepted
- Date: 2026-09-14

本决策取代 ADR-0001 中“Next.js Route Handler 实现 Control Plane”的实现选择，以及 ADR-0003 中“Relay 通过内部 HTTP 回调 Next.js Control Plane”的部署选择。Contribution Node 与平台的信任边界不变。

## Context

消费请求的准入、节点选择、连接状态和请求终态属于同一条实时事务链。将 Relay 放在 Go 进程、把账户和准入放在 Next.js，会引入内部共享密钥、跨进程回调、两个运行时和额外故障模式；Next.js 也因此无法作为可独立替换的前端部署。

## Decision

建立统一的 Go Platform Backend。它在一个服务内承载账户与认证、Consumer 和 Node 凭证、贡献规则、请求准入、积分账本、模型目录、节点 WebSocket 连接及 `/v1` 消费 API。Control Plane 与 Relay 保留为代码和领域上的两个子系统，但共享进程、数据库事务和生命周期。

Next.js 只负责站点、文档和控制台界面，通过公开的 Backend API 读写平台状态。生产入口使用 `api.clovapi.com`，消费协议位于 `/v1`；网页不再持有平台数据库，也不实现平台业务 Route Handler。

贡献节点继续保存上游凭据并执行上游协议转换。Platform Backend 只看到节点声明的模型、准入元数据和经过 Relay 的请求流，不接收贡献者的 Base URL 或 API Key。

迁移期保留旧 Relay 到 Next.js 内部控制接口的兼容适配器；新 Backend 使用进程内 Controller。兼容接口在前端完成 API 切换和数据库迁移后移除。

## Consequences

- 消费数据面不再依赖 Next.js 可用性或内部 HTTP 回调。
- 准入、限额和请求终态可以使用同一数据库与事务实现，减少分布式失败窗口。
- Next.js 可以独立扩缩容、替换或静态化，不影响节点连接和 API 消费。
- Go Backend 成为平台安全边界，需要负责 CORS、Cookie、邮件验证码、数据库迁移和运维可观测性。
- 单实例阶段可以继续使用 SQLite；横向扩展前必须迁移到共享事务数据库，并设计节点连接归属。

## Alternatives Considered

- **维持 Next.js Control Plane + 独立 Relay**：代码拆分清晰，但内部回调处于消费关键路径，部署和故障处理复杂。
- **全部放入 Next.js**：减少一种进程，却不适合长期 WebSocket、流式转发和 Go 协议核心复用。
- **只把业务 API 迁到 Go，Relay 仍独立**：适合短期过渡，但仍保留跨服务准入事务和额外部署单元。
