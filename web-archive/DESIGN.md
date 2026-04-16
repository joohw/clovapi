# 前端布局与视觉规范（App Shell）

本文档描述站点级外壳：顶栏、主区域边距、与大型内容卡片的对齐方式。实现集中在 `src/routes/+layout.svelte` 的 `:global` 样式与 CSS 变量中；组件级 UI 仍优先使用 shadcn 的 `border-border` 等语义类名。

## 1. 布局变量（`:root`）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `--app-header-height` | `3.5rem` | 顶栏高度 |
| `--app-header-float-top` | `1.25rem` | 顶栏距视口顶部的悬浮偏移 |
| `--app-header-float-gap` | `0.5rem` | 顶栏底边与主内容区之间的额外间距 |
| `--app-main-padding-top` | 上三者之和（calc） | `<main class="app-main">` 的 `padding-top`，避免内容钻进顶栏下方 |
| `--app-layout-max-width` | `80rem` | 主列最大宽度（与顶栏、内容同宽对齐） |
| `--app-page-pad-x` | `2rem` | 页面左右「槽」边距，并参与顶栏宽度计算 |

**窄屏（`max-width: 639px`）覆盖：**

| 变量 | 值 |
|------|-----|
| `--app-page-pad-x` | `1rem` |
| `--app-header-float-top` | `0.625rem` |
| `--app-header-float-gap` | `0.375rem` |

顶栏宽度使用 `--app-content-slot-width`：在不超过 `--app-layout-max-width` 的前提下，与「视口宽度减去左右各 `--app-page-pad-x`」一致，保证顶栏与正文同宽。

## 2. 顶栏（`.app-header`）

- **位置**：`position: fixed`，水平居中，`top: var(--app-header-float-top)`，`width: var(--app-content-slot-width)`。
- **圆角**：`rounded-2xl`。
- **边框（与大型内容卡片一致，避免过浅）**  
  - 浅色：`border-gray-200`（不使用半透明灰边）。  
  - 深色：`dark:border-zinc-700`（与首页主卡片、管理后台主卡片等大型面板一致）。
- **背景**：浅色 `bg-white/75`，深色 `dark:bg-black/35`，配合 `backdrop-blur` / `shadow` 形成悬浮条。
- **内边距**：`px-3` → `sm:px-4` → `md:px-6`。

### 2.1 品牌区（窄屏）

- **断点**：`max-width: 639px`（与 Tailwind `sm` 以下一致）。
- **行为**：仅显示 favicon；像素字标（`.header-brand-pixel`）隐藏，保留 `aria-label` 与 `.sr-only` 文案供无障碍使用。
- **间距**：品牌区 `gap: 0`，略减 `margin-right`，为导航留出空间。

## 3. 页面边距与容器

| 类名 | 规范 |
|------|------|
| `.page-wrap` | `p-4 md:p-8`：与 `--app-page-pad-x` 配合，控制正文相对视口边缘的内边距；大屏与变量中的水平留白层次一致。 |
| `.admin-console-root` | 与 `.page-wrap` 相同：`p-4 md:p-8`，避免管理页与其它页边距不一致。 |

管理后台主卡片（`.admin-console-card`）使用与首页大型面板相同的边框语言：`border-gray-200` + `dark:border-zinc-700`，`rounded-2xl`，浅色背景 `bg-neutral-50` / 深色 `dark:bg-zinc-950/70`。

## 4. 背景

`.app-shell::before` 提供全屏铺底：

- 浅色：`#fafafa` + 40×40px 网格线（低对比度）。
- 深色：`#09090b` + 更亮的网格线。

与文档页、模型页等内层卡片使用的 `neutral-50` / `zinc-950` 系配色说明一致（见 `+layout.svelte` 内注释）。

## 5. 设置类卡片（控制台等）

仪表盘「账号与安全」等处，**同一列表内的设置块**应统一为：

- `rounded-xl border border-border p-4`

避免混用 `border-gray-200` + 独立底色块，除非刻意与外壳级大卡片区分。警告/强调区域（如琥珀色提示框）可单独保留。

## 6. 语义化 HTML（可访问性 / 爬虫 / Agent 解析）

优先用 landmark 与标题层级表达结构，少用无含义的嵌套 `div` 代替整块区域。

- **全局外壳**（`+layout.svelte`）：`<header class="app-header">`（内含 `<nav>`）、`<main class="app-main">`；顶栏右侧会话区容器带 `aria-label="账户与登录"`。
- **首页**：每个页面仅一个可见的 `<h1>`；英雄区用 `<header>` 包住引子段落与 `h1`；「常用接口示例」「支持 300+ 模型 API」等独立区块用 `<section>` + `aria-labelledby` 指向对应 `<h2>`。
- **文档页**：双栏时左侧互补说明用 `<aside aria-labelledby="...">`，右侧主说明用 `<section aria-labelledby="...">`；栏内已有标题统一为带 `id` 的 `<h2>`；页面级增加 `h1.sr-only`（与浏览器标题一致），页面根节点可 `aria-labelledby` 指向该 `h1`。
- **模型广场 / 在线试用**：同样使用 `h1.sr-only` + 根节点 `aria-labelledby`，避免无标题页面；试用页对话列表用 `role="region"` + `aria-label`，每条消息 `<article>`，角色标签放在 `<header>` 内；发送区 `<form aria-label="发送消息">`。

新增页面时：至少提供一级标题（可见或 `sr-only`），且 `h1`→`h2`→`h3` 层级不断档。

## 7. 修改时自检清单

1. 调整顶栏垂直位置时，只改 `--app-header-float-top` / `--app-header-float-gap`（及窄屏覆盖），勿漏掉 `--app-main-padding-top` 的联动（已由 calc 自动计算）。
2. 新增全宽悬浮元素时，宽度应基于 `--app-content-slot-width` 或同样的 `max-width` + 水平 padding规则，避免与顶栏错位。
3. 大型内容面板边框优先与 `.app-header`、`.admin-console-card`、首页主 `section` 对齐：`gray-200` / `zinc-700`；表单、列表小卡片可用 `border-border`。
4. 新内容块是否具备合适 landmark / 标题，便于读屏与机器解析（参见上一节）。

---

*文档与实现对齐版本：以 `src/routes/+layout.svelte` 中实际变量与类名为准。*
