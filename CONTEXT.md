# clovapi Shared API Network

clovapi exists to make independently supplied model capacity available through one shared API network. Using shared models is the primary product experience; running a local contribution node is optional.

## Domain Glossary

- **Shared API Network**: clovapi 面向 Consumer 提供的统一模型网络，由 Platform Backend 和在线 Contribution Node 共同形成。它是产品本体；本地代理只是节点侧能力。
- **Direct Use**: Consumer 创建平台调用凭证后直接选择并调用在线 Shared Model，无需安装 CLI、配置上游或先贡献资源。
- **Platform Backend**: 统一的 Go 平台服务，拥有账户、平台凭证、节点权限、请求准入、积分账本和消费 API。它不保存贡献者的上游 API 密钥。
- **Control Plane**: Platform Backend 中负责账户、凭证、贡献规则、准入和账本的逻辑子系统，不再是 Next.js 中单独部署的后端。
- **Relay**: Platform Backend 中负责持有节点连接、分配 Consumer 调用并交付响应的逻辑子系统，不再作为依赖 Next.js 回调的独立平台服务。
- **Web App**: Next.js 实现的展示层，负责网页、文档和控制台交互；平台状态与业务规则由 Platform Backend 提供的 API 负责。
- **Contribution Node**: 归属于一个 Account 的贡献执行实例，当前对应一个 clovapi CLI 实例。一个节点可提供多个本地可用模型，模型共享节点的贡献规则与请求上限；节点不等同于单个模型或上游配置。
- **Consumer**: 使用 clovapi 平台凭证调用模型的人或程序。Consumer 不需要安装 CLI。
- **Contributor**: 有权将一项上游资源用于共享，并通过 Contribution Node 提供服务的个人或团队。
- **Upstream Resource**: Contributor 有权使用并允许共享的模型 API 或算力资源。额度来源本身不能证明共享授权。
- **Platform Supply**: clovapi 运营方提供或采购的模型资源，用于基础免费服务和符合策略的回退。
- **Free Allowance**: 平台补贴给 Consumer 的使用权益，无需先贡献；与 Contribution Credit 分账。
- **Contribution Credit**: Contribution Node 完成并结算共享任务后获得的平台使用权益，不代表现金或固定兑换价值。
- **Settlement**: 对一个逻辑请求的实际交付量、Consumer 扣减、Contributor 奖励和预留释放进行一次性记账的过程。
- **Account**: 由已验证邮箱标识的个人身份。API Key、贡献节点、余额与积分记录直接归属于 Account；团队与组织授权后续单独建模。
- **Session**: 邮箱验证成功后创建的服务端登录状态。浏览器持有 HttpOnly Cookie，数据库只保存令牌哈希。
- **Consumer API Key**: Consumer 调用平台模型接口的凭证，不授予运行贡献节点的权限。
- **CLI Connection Key**: Account 用于接入 Contribution Node 的可撤销连接凭证，可供多个实例使用。它不负责已接入节点的日常运行，也不授予 Consumer 的模型调用权限。
- **Node Key**: 授予单个 Contribution Node 的可撤销运行凭证。它独立于 CLI Connection Key，不授予接入其他节点或 Consumer 的模型调用权限。
- **Shared Model**: Contribution Node 当前可提供的模型，以完整模型 ID 标识。同一节点可提供多个 Shared Model，同一模型也可由多个节点提供。
- **Daily Request Limit**: 一个贡献节点在一个 UTC 自然日内可接受的共享请求数上限。它不是 token 额度、费用上限或 Contribution Credit。
- **Node Concurrency**: 一个 Contribution Node 同时执行共享请求的最大数量。节点提供的所有模型共用这一上限。

## Naming Rules

- 产品定位统一使用“共享模型 API 网络”，避免使用“本地代理”指代 clovapi 整体。
- 消费者主路径使用“直接使用共享模型”；“一键使用”可作为营销表达，不表示绕过鉴权、模型选择或用量限制。
- “本地代理”仅指 Contribution Node 内的本地路由与协议适配能力，或独立的高级本地调用模式。
- 产品界面使用“贡献节点”，代码使用 `contribution_node` / `ContributionNode`。
- 产品界面使用“基础免费额度”和“贡献积分”，避免将两者合称为“余额”。
- “官方”只指 clovapi 运营方的 Platform Supply，不表示模型原厂的授权或背书。
- “网页”指 Next.js Web App；涉及整个服务器进程使用“Platform Backend”，涉及授权、准入和账本时使用其“Control Plane”子系统，涉及连接和请求传输时使用其“Relay”子系统。

## Stable Boundaries

- Platform Backend 是 Control Plane 与 Relay 的部署和事务边界；两者在同一个 Go 进程内协作，不通过 Next.js 内部回调完成准入。
- Control Plane 子系统拥有账户、平台凭证、准入规则、调用元数据、结算和账本。
- Relay 子系统持有节点连接，负责按准入规则派发请求、流控和响应交付，不持久化请求正文或响应块。
- Next.js Web App 不拥有平台数据库、认证会话或业务写入接口，只调用 Platform Backend。
- Contribution Node 拥有上游凭据、上游协议适配、本地预算执行和请求执行。
- 上游凭据不从 Contribution Node 发送到 Platform Backend。
- Consumer 只需要平台凭证；CLI 是 Contributor 的运行组件，不是消费 API 的前置条件。
