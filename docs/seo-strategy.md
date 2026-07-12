# clovapi SEO / GEO 完整策略与执行规范

> 版本：1.0
>
> 审计日期：2026-07-12
>
> 适用范围：`https://clovapi.com`、`landing/`、博客与指南内容
>
> 目标读者：产品、开发、内容运营、发布负责人

## 1. 执行摘要

clovapi 的 SEO 目标不是追逐泛流量，而是获取有明确问题和使用意图的开发者：需要本地 LLM API 代理、模型协议转换、订阅接入、统一上游管理或请求调试的人。

当前代码已经具备 title、description、canonical、Open Graph、Twitter Card、robots、sitemap、JSON-LD、博客和 `llms.txt` 等基础设施。主要问题不在“缺少关键词”，而在可索引性、多语言 URL、内容深度与生产一致性：

1. 生产镜像未携带运行时读取的 `content/blog`，导致 sitemap 中的文章线上全部返回 404。这是最高优先级问题，本次已在代码中修复。
2. 中英文使用同一个 URL，通过 Cookie、`Accept-Language` 和 `?lang=` 切换；所有语言版本又指向同一个 canonical。搜索引擎难以稳定发现、索引和归因两个语言版本。
3. sitemap 曾把每次请求时间写成所有页面的 `lastmod`，会制造不可信的更新信号。本次已改为只给文章写真实内容日期。
4. 所有主要页面因读取 Cookie 和请求头而动态渲染，线上响应为 `private, no-cache, no-store`，不利于 CDN 缓存和稳定性能。
5. 当前只有少量短文章，尚不足以覆盖“发现问题 → 比较方案 → 安装 → 配置 → 调试”的完整搜索旅程。
6. Cloudflare Managed Robots 与应用 robots 对部分 AI crawler 给出了相反指令，需要在 Cloudflare 控制台统一策略。

未来 90 天应按以下顺序执行：先保证所有 sitemap URL 返回 200，再完成路径化国际化和静态化，然后建设高价值主题集群，最后才扩大程序化页面规模。

## 2. 边界：不做搜索垃圾

本文所说的“规模化 SEO”是程序化生产有独立价值、可验证、可维护的页面，不是 spam。

禁止：

- 关键词堆砌、隐藏文字、隐藏链接或对爬虫展示不同内容；
- 批量生成只有 provider/model 名称不同的近重复页面；
- doorway pages、城市/语言关键词换皮页和无价值聚合页；
- 购买传递排名权重的链接、自动群发评论或论坛签名链接；
- 抄袭、轻度改写或无原创验证的 AI 批量内容；
- 伪造发布日期、下载量、用户评价、性能数据或“官方”关系；
- 在没有页面可见 FAQ 内容时只注入 FAQ Schema；
- 自动查询 Google SERP 或绕过平台条款抓取排名。

Google 将主要为操纵排名而批量生成低价值页面定义为 scaled content abuse，并明确禁止 doorway abuse、keyword stuffing 和 link spam。详见 [Google Search spam policies](https://developers.google.com/search/docs/essentials/spam-policies) 与 [生成式 AI 内容指南](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)。

允许且建议：

- 根据真实支持矩阵生成 provider、协议和客户端兼容性页；
- 页面包含真实配置、已测试版本、命令、错误示例、限制与更新时间；
- 用自动化完成模板渲染、链接检查、Schema 校验和过期检测；
- 人工审核搜索意图、事实、差异化价值和可读性；
- 不满足质量门槛的页面保持草稿或 `noindex`。

## 3. 业务目标与 KPI

### 3.1 北极星指标

来自自然搜索且完成以下任一行为的有效访问：

- 点击 GitHub；
- 复制安装命令；
- 下载桌面客户端；
- 访问 `/skill` 或获取 `skill.md`；
- 从教程进入产品页后继续阅读或安装。

### 3.2 领先指标

| 指标 | 30 天目标 | 90 天目标 |
| --- | ---: | ---: |
| sitemap URL 的 200 比例 | 100% | 100% |
| 有效 canonical 比例 | 100% | 100% |
| 中英文互相 hreflang 覆盖 | 完成架构 | 100% |
| 非品牌词有效展示查询数 | 建立基线 | 持续增长 |
| 被索引的高质量内容页 | 8+ | 20+ |
| CWV “Good” URL 比例 | 建立基线 | ≥ 90% |
| 内容发布后 30 天内产生有效展示的比例 | 建立基线 | ≥ 70% |

流量、CTR 和排名目标必须在接入 Search Console 后以真实基线制定，不能凭空填写。

## 4. 受众与搜索意图

| 人群 | 典型问题 | 意图 | 目标落地页 |
| --- | --- | --- | --- |
| AI 应用开发者 | 如何统一 OpenAI/Anthropic/Gemini API | 方案研究 | 协议转换总览、兼容矩阵 |
| Codex/Claude 用户 | 订阅如何在 localhost 作为 API 使用 | 操作教程 | 订阅接入指南 |
| 多供应商用户 | 如何统一管理不同 base URL 和 key | 方案比较 | 本地代理能力页 |
| 调试人员 | 401/404/模型名/流式响应为什么失败 | 问题解决 | 错误排查与日志指南 |
| 隐私敏感团队 | 是否会上传 key、日志存在哪里 | 风险评估 | 架构、安全和数据边界页 |
| AI agent | clovapi 是什么、如何调用 | 实体理解 | `llms.txt`、`skill.md`、文档页 |

## 5. 关键词与主题集群

以下是种子主题，不代表搜索量结论。上线前应在 Search Console、Google Trends 或合规关键词数据源中验证需求、语言和 SERP 类型。

### 5.1 核心产品词

- 中文：本地模型 API 代理、本地 LLM API、模型 API 网关、AI API 代理、统一模型接口、模型协议转换；
- 英文：local LLM API proxy, local model API gateway, AI API proxy, unified LLM API, model API protocol converter；
- 品牌：clovapi、clovapi CLI、clovapi desktop。

### 5.2 协议转换集群

- OpenAI Responses to Anthropic Messages；
- Anthropic API to OpenAI compatible；
- Gemini OpenAI compatible proxy；
- Chat Completions vs Responses API；
- streaming、tool calls、usage、error mapping 的兼容差异。

### 5.3 订阅接入集群

- Codex subscription local API；
- Claude subscription local API；
- localhost OpenAI compatible endpoint；
- subscription vs API key；
- OAuth 凭据、本地存储与刷新边界。

### 5.4 客户端与排障集群

- 客户端连接自定义 OpenAI base URL；
- 401、403、404、429、模型不存在、协议不匹配；
- SSE/streaming、tool call、token usage 调试；
- 查看入站请求、上游响应和路由选择。

### 5.5 比较与替代页

只在能给出事实和适用场景时创建：

- local proxy vs cloud gateway；
- direct provider API vs local proxy；
- subscription access vs API key；
- clovapi 与具体替代方案的差异。

比较页不得使用虚假“最好”、贬损性陈述或无法验证的功能表。

## 6. 推荐信息架构

目标结构：

```text
/
├── /zh-cn/
│   ├── docs/
│   ├── guides/
│   ├── integrations/
│   ├── protocols/
│   ├── troubleshooting/
│   └── compare/
├── /en/
│   └── 与中文相同的可对齐结构
├── /skill
├── /skill.md              # 可访问但 noindex
├── /llms.txt
└── /sitemap.xml
```

推荐让 `/` 成为 `x-default` 的语言选择/默认入口，正文页面使用稳定的 `/zh-cn/...` 和 `/en/...` URL。若短期不迁移，至少不要把 `?lang=` 版本同时作为 hreflang 又 canonical 到无参数 URL。

每个内容页必须属于一个可浏览的 hub，并从 hub、相关内容和正文上下文获得内部链接；不要创建只能从 sitemap 发现的孤儿页。

## 7. 技术 SEO 规范

### 7.1 状态码与可索引性

- sitemap 中只允许最终返回 200 的 canonical URL；
- 永久迁移用 308/301，临时跳转用 307/302；
- 软 404 必须改为真实 404；
- 删除页若有等价替代则永久重定向，否则返回 404/410；
- `/api/**`、预览、测试、搜索参数页不进入 sitemap；
- `skill.md` 保持可抓取，但用 `X-Robots-Tag: noindex, follow` 避免与 HTML 页竞争。

发布后必须自动检查：sitemap URL → 状态码 → canonical → robots → 标题 → H1。

### 7.2 Canonical

- 每个可索引页使用绝对、自引用 canonical；
- canonical URL 必须返回 200，不能被 robots 阻止或 `noindex`；
- 内部链接、sitemap、hreflang 和结构化数据统一使用 canonical URL；
- 参数只改变跟踪而不改变主要内容时 canonical 到无参数页；
- 语言内容不同，应使用独立 URL，不应全部 canonical 到同一 URL。

参考：[Google canonical 指南](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)。

### 7.3 多语言

- 路径使用小写固定格式：`/zh-cn/`、`/en/`；
- 每页输出 self + reciprocal hreflang；
- `zh-CN`、`en` 和 `x-default` 组成完整集合；
- 缺少对应翻译时不要生成不存在的 hreflang；
- 页面 `<html lang>`、正文、metadata、OG locale 和 JSON-LD `inLanguage` 必须一致；
- 不根据 IP 强制跳转；允许用户切换并保持选择；
- SSR 首次响应必须直接包含正确语言，而不是依赖客户端切换。

参考：[管理多区域和多语言网站](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)。

### 7.4 Sitemap

- 只包含 canonical、200、允许索引的 URL；
- `lastmod` 来自实际内容修改时间，不使用请求时间或部署时间冒充；
- 内容系统增加 `updated` frontmatter，只有事实或正文发生实质变化时更新；
- 当 URL 超过 50,000 或文件超过 50 MB 时拆分 sitemap index；
- 国际化完成后在 sitemap 中增加语言 alternates；
- 每次部署验证 sitemap XML、URL 总数、重复 URL 和 4xx/5xx。

### 7.5 Robots 与 crawler 策略

- 搜索抓取和 AI 训练是两类决策，不要混为一谈；
- Googlebot/Bingbot 保持可抓取公开页面；
- `/api/`、内部预览和无穷参数空间应阻止抓取；
- Cloudflare Managed Robots 当前与应用对 GPTBot、ClaudeBot、Google-Extended 等存在冲突，必须在 Cloudflare 控制台选择单一策略；
- `robots.txt` 不是访问控制，敏感内容必须鉴权；
- 调整 AI crawler 策略前由项目所有者确认内容授权立场。

### 7.6 渲染、缓存与性能

当前主要页面因 `cookies()` 和 `headers()` 变成动态页面，线上返回私有 no-store 缓存。国际化迁移后应：

- 让语言由 URL 决定；
- 首页、文章、指南尽量 SSG；
- 文章在构建时读取 Markdown，避免生产运行时文件缺失；
- 只让真正请求相关的接口动态渲染；
- 配置 CDN 缓存并在发布后验证 `Cache-Control`；
- 移除不必要的 `unoptimized` 图片，生成 AVIF/WebP 和响应式尺寸；
- 为首屏 LCP 图保留明确尺寸和合理 preload，其余图片延迟加载；
- 用真实用户数据观察 LCP、INP、CLS，不以单次实验室分数代替。

Core Web Vitals 目标：LCP ≤ 2.5s、INP ≤ 200ms、CLS ≤ 0.1（以第 75 百分位为准）。参考 [Web Vitals](https://web.dev/articles/vitals)。

### 7.7 URL 与重定向

- URL 使用英文小写 slug 和连字符；
- 不在 URL 中放版本易变信息，除非页面就是版本文档；
- `/guides/...` 与 `/blog/...` 只保留一个 canonical 体系；现有重定向必须加入自动测试；
- 避免多跳重定向；
- 历史 URL 迁移表应长期保留。

## 8. 页面级 SEO 模板

### 8.1 首页

- Title：核心品类 + 关键差异 + 品牌，避免泛化口号；
- H1：一句话说明“本地 API 代理 + 订阅/自定义上游 + 协议转换”；
- 首屏正文回答是什么、为谁、解决什么问题；
- 可见区加入支持协议、操作系统和本地数据边界；
- 主要 CTA：安装/下载；次要 CTA：查看文档/GitHub；
- 内链到协议、订阅、调试和安全四个 hub。

### 8.2 教程页

```yaml
title: "清晰结果 + 具体对象"
description: "说明前提、操作和最终结果"
date: "YYYY-MM-DD"
updated: "YYYY-MM-DD"
testedVersion: "clovapi x.y.z"
reviewer: "维护者或组织"
```

正文结构：

1. 直接答案/完成后的结果；
2. 适用条件与不适用条件；
3. 前置要求；
4. 可复制命令；
5. 预期输出；
6. 常见错误；
7. 安全和数据说明；
8. 验证步骤；
9. 相关指南；
10. 测试版本和更新时间。

### 8.3 协议/集成页

每页至少包含：

- 支持状态：支持、部分支持、不支持；
- 请求和响应映射；
- streaming、tool calls、usage、error 的差异；
- 真实、可运行的最小示例；
- 已测试的 clovapi 版本；
- 已知限制和失败模式；
- 与上下游官方文档的引用；
- 指向安装、配置和排障页的内链。

这类页面满足质量门槛后可程序化生成，但数据源必须来自代码中的真实 registry/协议测试，而不是手写营销表。

### 8.4 排障页

- Title/H1 使用实际错误或症状；
- 开头给出快速诊断树；
- 展示安全脱敏后的错误输出；
- 按原因而非关键词重复分节；
- 给出验证命令和修复后的预期结果；
- 明确哪些日志可能包含敏感数据。

## 9. Metadata 规范

- Title 建议约 30–60 个英文字符或 15–30 个中文字符，但以准确、独特、可读为优先；
- Description 通常 70–160 个英文字符或约 40–80 个中文字符，不保证一定被搜索引擎采用；
- 每页 title、description、H1 独特且意图一致；
- 不添加 `meta keywords`，主流搜索引擎不以其作为排名依据；
- OG/Twitter 图片使用 1200×630 的专用社交图，不复用接近方形的产品截图；
- 文章图至少包含标题、品牌和简洁的主题视觉；
- 图片 `alt` 描述图像信息，不堆关键词；装饰图使用空 alt；
- Article metadata 提供真实 `publishedTime`、`modifiedTime`、author 和 image。

## 10. 结构化数据

建议保留：

- 全站：`Organization`、`WebSite`；
- 产品首页：`SoftwareApplication`；
- 文章：`BlogPosting`；
- 层级页：`BreadcrumbList`；
- FAQ：只有页面可见问题与答案完全一致时使用。

规则：

- JSON-LD 中的 URL、语言、标题、日期必须与页面可见内容一致；
- 不标记用户看不到的内容；
- `dateModified` 只在实质更新时变化；
- 发布前通过 [Schema Markup Validator](https://validator.schema.org/) 和 Google Rich Results Test 验证；
- Schema 提高机器可理解性，不承诺 rich result 或排名。

注意：Google 的 FAQ rich results 主要面向权威政府和健康网站；clovapi 不应把 FAQ Schema 当作流量策略。参考 [FAQ structured data](https://developers.google.com/search/docs/appearance/structured-data/faqpage)。

## 11. 内容生产与质量门槛

### 11.1 发布门槛

页面必须同时满足：

- 有一个明确、可验证的用户任务；
- 与现有页面有显著差异；
- 至少一个原创资产：真实命令、测试结果、兼容矩阵、错误样本、架构图或维护者经验；
- 所有产品能力由代码/测试/官方文档验证；
- 无秘密、token、真实用户日志或未经脱敏的数据；
- 有作者/组织、发布日期、更新时间和测试版本；
- 有上行 hub、下行步骤和横向相关内容内链；
- 元数据、canonical、Schema、状态码和移动端展示通过检查。

### 11.2 AI 辅助内容

AI 可用于提纲、改写、翻译、链接建议和 QA，但必须：

- 由人或基于测试的自动化验证事实；
- 不凭空生成产品功能、性能、版本和用户评价；
- 翻译后由目标语言读者或高质量审校检查；
- 保留来源与验证记录；
- 未审核内容不得自动发布。

### 11.3 内容更新

- 每 90 天检查高流量教程；
- 每次协议、认证、CLI 命令或路径变化触发相关内容检查；
- 失效内容优先更新或合并，不为保留 URL 而保留错误信息；
- 内容合并后设置永久重定向并更新所有内链。

## 12. 合规的程序化 SEO

### 12.1 候选页面类型

1. `/protocols/{source}-to-{target}`：真实协议桥接矩阵；
2. `/integrations/{client}`：客户端如何连接 clovapi；
3. `/providers/{provider}`：已支持上游、认证方式和限制；
4. `/troubleshooting/{error}`：由真实错误分类生成的排障页；
5. `/compare/{option-a}-vs-{option-b}`：有实证差异的比较页。

### 12.2 最低数据字段

```text
slug
displayName
searchIntent
supportStatus
testedVersion
lastVerifiedAt
setupSteps
workingExample
limitations
errorCases
sourceReferences
relatedPages
reviewStatus
```

### 12.3 自动发布质量闸门

- `supportStatus !== unknown`；
- 至少一个由测试验证的示例；
- 至少一个具体限制或差异；
- 正文与同模板页面的实质重复度低于内部阈值；
- 页面可从 hub 访问；
- 标题、描述和 H1 不重复；
- canonical、hreflang、Schema、状态码通过；
- `reviewStatus = approved`；
- 不通过则不构建或输出 `noindex`。

先手工完成每类 3–5 个标杆页面并观察索引和转化，再扩张。不要一次生成数百页。

## 13. 内链策略

- 首页链接到四个核心 hub：本地代理、协议转换、订阅接入、调试；
- hub 链接到所有子页，子页用面包屑回到 hub；
- 教程中的链接锚文本描述目标任务，不使用大量完全匹配关键词；
- 每篇文章至少有 2 个上下文相关内链和 1 个下一步 CTA；
- 定期检查孤儿页、404 内链和重定向链；
- `/skill.md` 与 `llms.txt` 可指向 canonical HTML 文档，但不要代替用户可浏览导航。

## 14. 外部发现与数字公关

优先获取真实使用场景中的自然引用：

- GitHub README、release notes 和 Discussions；
- npm package 页面；
- 协议兼容性研究、开源工具清单和开发者教程；
- 基于真实测试发布的工程文章；
- 对相关开源项目提交有价值的文档或兼容性贡献。

不得购买传递权重的链接或自动群发。赞助、广告和商业合作链接使用 `rel="sponsored"`；无法背书的用户链接使用 `nofollow` 或 `ugc`。

## 15. GEO / AI 搜索可引用性

- 保持实体表述一致：clovapi 是开源、本地运行的模型 API 代理；
- 每个关键页前 1–2 段直接回答“是什么、解决什么、限制是什么”；
- 用清晰标题、表格、步骤、定义和可引用事实，而不是营销口号；
- 对版本、支持状态和更新时间进行明确标注；
- `llms.txt` 提供高价值 canonical 页面清单；
- `skill.md` 面向 agent 使用，HTML 文档面向搜索和用户；
- 公开架构、安全边界、存储位置和协议支持矩阵；
- 不把 crawler allow 当成必然收录，也不把 `llms.txt` 当成排名因子。

## 16. 分析、监控与实验

### 16.1 必接工具

- Google Search Console；
- Bing Webmaster Tools；
- 支持隐私要求的 Web Analytics；
- PageSpeed Insights / CrUX；
- 服务端 4xx/5xx 与爬虫日志；
- CI 链接、metadata、Schema、sitemap 检查。

### 16.2 事件建议

```text
install_copy
github_click
desktop_download
docs_click
skill_view
language_switch
article_to_install
```

不得采集 API key、OAuth token、请求正文或用户模型内容。

### 16.3 周报

- 点击、展示、CTR、平均排名，按品牌/非品牌、国家、设备、语言拆分；
- 新增索引、排除原因、404、服务器错误；
- landing page → 转化事件；
- CWV 和慢页面；
- 新内容 7/30/90 天表现；
- 需要更新、合并或删除的内容。

### 16.4 实验原则

- 一次只改变一个主要变量；
- 记录假设、页面集合、开始时间和成功指标；
- 小站不因短期排名波动过早下结论；
- 不把索引量当目标，优先看有效展示和产品行为。

## 17. 90 天执行路线图

### P0：第 1 周，恢复索引可信度

- [x] 修复生产镜像缺少 `content/blog` 导致文章 404；
- [x] sitemap 使用文章真实修改时间；
- [x] `/api/` 从通用抓取范围排除；
- [x] `skill.md` 使用 `X-Robots-Tag: noindex, follow`；
- [x] 补齐文章 OG/Twitter 图片、modified time 和 Breadcrumb Schema；
- [ ] 部署后确认 sitemap 内每个 URL 返回 200；
- [ ] 在 Search Console 提交 sitemap 并检查 Page Indexing；
- [ ] 统一 Cloudflare 与应用的 crawler 策略。

### P1：第 2–4 周，多语言和性能

- [ ] 迁移到 `/zh-cn/` 与 `/en/`；
- [ ] 建立 reciprocal hreflang 和 x-default；
- [ ] 把首页、博客和指南改为 SSG；
- [ ] 移除语言 Cookie 对主要页面缓存的影响；
- [ ] 生成 1200×630 OG 图片；
- [ ] 建立 Lighthouse/链接/Schema CI 基线；
- [ ] 添加隐私合规的转化事件。

### P2：第 2 个月，主题权威

- [ ] 发布协议转换 hub 与 3 篇深度子页；
- [ ] 发布订阅接入 hub 与 Codex/Claude 指南；
- [ ] 发布错误排查 hub 与 4 篇真实错误页；
- [ ] 发布架构、安全、数据存储边界页；
- [ ] 所有文章补 tested version、updated 和 reviewer；
- [ ] 从 README、npm 和 GitHub release notes 建立一致入口。

### P3：第 3 个月，受控扩张

- [ ] 用真实 registry 和测试数据建立 provider/protocol 页面数据源；
- [ ] 先上线每类 3–5 个标杆页面；
- [ ] 观察 30 天索引、查询和转化；
- [ ] 通过质量闸门后逐批扩大；
- [ ] 合并无展示、无差异或意图重叠页面；
- [ ] 建立内容漂移与失效链接监控。

## 18. 发布检查清单

### 每个页面

- [ ] 返回 200；
- [ ] 只有一个清晰 H1；
- [ ] title、description 独特且与意图一致；
- [ ] 自引用 canonical 正确；
- [ ] HTML lang、正文、metadata 和 Schema 语言一致；
- [ ] 需要时存在完整 reciprocal hreflang；
- [ ] 可从站内导航到达；
- [ ] 图片有尺寸、压缩和正确 alt；
- [ ] Schema 与可见内容一致；
- [ ] 移动端无布局和交互问题；
- [ ] 无敏感信息、虚构数据或失效命令。

### 每次部署

- [ ] `npm run lint`；
- [ ] `npm run build`；
- [ ] sitemap XML 可解析且所有 URL 为 200；
- [ ] robots 指令符合策略；
- [ ] canonical 不指向 3xx/4xx/noindex；
- [ ] 所有内部链接无 4xx；
- [ ] 关键页面 SSR HTML 含 title、description、H1 和正文；
- [ ] JSON-LD 可解析并通过验证；
- [ ] 首页和文章页移动端 Lighthouse 无明显回退；
- [ ] Docker 生产镜像内存在运行时需要的内容文件。

## 19. 本次代码改动与待决策项

本次已落地：

- 生产 Docker 镜像复制 `content/`，恢复文章运行时读取；
- robots 排除 `/api/`；
- `skill.md` 与内部 Markdown API 返回 `noindex, follow`；
- sitemap 移除 `skill.md`，文章使用真实修改时间；
- 文章 metadata 增加 OG/Twitter image 和 `modifiedTime`；
- 文章 JSON-LD 增加 `BreadcrumbList`，并改进作者和更新时间；
- 全局 metadata 增加站点、作者、发布者和分类信息；
- 扩充 `llms.txt` 的关键入口与实体主题。

仍需产品/架构决策：

1. 中文与英文哪个是根路径，还是根路径只做 x-default；
2. Cloudflare 是否允许 AI 检索 crawler、是否禁止训练 crawler；
3. 是否把 Markdown 内容改为构建时导入，彻底静态化文章；
4. 分析工具、隐私政策和转化事件方案；
5. 第一批主题优先级：协议转换、订阅接入还是错误排查。

## 20. 参考资料

- [Google Search Essentials](https://developers.google.com/search/docs/essentials)
- [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- [Canonical URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
- [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Structured data general guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)
- [Web Vitals](https://web.dev/articles/vitals)
- [Schema.org](https://schema.org/)

## 21. SEO skill 调研记录

OpenAI 官方 curated/experimental skill 列表脚本在本机因 Python TLS 证书链错误未能完成读取；未绕过证书校验。网页检索找到第三方 [AgriciDaniel/codex-seo](https://github.com/AgriciDaniel/codex-seo)，其范围包括技术 SEO、Schema、内容质量、CWV、GEO/AEO、hreflang、程序化 SEO、backlink 和审计报告。

该套件不是 OpenAI 官方精选 skill，安装过程会写入 `~/.codex/skills`、`~/.codex/agents`，创建 Python 虚拟环境并安装依赖。本次未在没有明确安装授权的情况下执行其安装器；本文采用其公开审计维度作为交叉检查，并以 Google 官方文档和本项目实际代码/线上响应作为结论依据。
