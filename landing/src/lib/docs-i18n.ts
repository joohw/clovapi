import { defineI18n } from "fumadocs-core/i18n";
import { defineI18nUI } from "fumadocs-ui/i18n";

export const docsI18n = defineI18n({
  defaultLanguage: "zh-CN",
  languages: ["zh-CN", "en"],
  parser: "dir",
});

export const docsI18nUI = defineI18nUI(docsI18n, {
  "zh-CN": {
    displayName: "简体中文",
    "Search(search trigger)": "搜索",
    "Search(search dialog)": "搜索文档",
    "Open Search(search trigger)(aria-label)": "打开搜索",
    "Close Search(search dialog)(aria-label)": "关闭搜索",
    "No results found(search dialog)": "没有找到结果",
    "On this page(table of contents)": "本页内容",
    "Table of Contents(inline table of contents)": "目录",
    "Collapse Sidebar(sidebar)(aria-label)": "收起侧栏",
    "Close Sidebar(sidebar)(aria-label)": "关闭侧栏",
    "Open Sidebar(sidebar)(aria-label)": "打开侧栏",
    "Copy Anchor Link(heading anchor)(aria-label)": "复制标题链接",
    "Previous Page(pagination)": "上一页",
    "Next Page(pagination)": "下一页",
    "Edit on GitHub(edit page)": "在 GitHub 上编辑",
    "Last updated on(page footer)": "最后更新于",
    "Copy Text(code block)(aria-label)": "复制代码",
    "Copied Text(code block)(aria-label)": "已复制",
  },
  en: { displayName: "English" },
});
