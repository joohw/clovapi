"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight, Check, ChevronDown, Copy } from "lucide-react";
import type { AppLanguage } from "@/i18n/config";
import { FAQ_ITEMS, localizedPath } from "@/lib/seo-data";
import { GITHUB_REPO_URL } from "@/lib/site";
import styles from "./shared-landing.module.css";

const API_COMMANDS = [
  "export OPENAI_API_KEY=YOUR_CLOVAPI_KEY",
  "export OPENAI_BASE_URL=https://api.clovapi.com/v1",
  'curl $OPENAI_BASE_URL/models -H "Authorization: Bearer $OPENAI_API_KEY"',
];

export function SharedLanding({ language }: { language: AppLanguage }) {
  const tr = (zh: string, en: string) => language === "en" ? en : zh;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const consoleUrl = localizedPath("/console", language);
  const cliDocsUrl = localizedPath("/docs/quick-start", language);
  const steps = [
    tr("复制平台 API Key", "Copy your platform API key"),
    tr("使用统一共享接口", "Use the shared API endpoint"),
    tr("查看当前在线模型", "List models currently online"),
  ];
  const features = [
    {
      title: tr("直接调用", "Start calling"),
      text: tr("使用平台 API Key 调用在线模型，无需先贡献 API。", "Call online models with a platform API key. No contribution required."),
    },
    {
      title: tr("共享余量", "Share capacity"),
      text: tr("复制控制台的连接命令，即可自动共享本地可用模型。", "Copy the console connection command to automatically share your available local models."),
    },
    {
      title: tr("自主控制", "Stay in control"),
      text: tr("设置节点每日请求上限，随时暂停共享或断开节点。", "Set a daily request limit for the node. Pause sharing or disconnect it when needed."),
    },
  ];

  async function copyCommands() {
    try {
      await navigator.clipboard.writeText(API_COMMANDS.join("\n"));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className={styles.landing}>
      <div className={styles.container}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroCopy}>
            <h1 id="hero-title">{tr("共享型 API 网络", "A shared API network")}</h1>
            <p className={styles.heroIntro}>
              {tr("一键连接，创造更多价值", "Connect in one click. Create more value.")}
            </p>
            <div className={styles.heroActions}>
              <Link href={consoleUrl} className={styles.primaryButton}>
                {tr("进入控制台", "Open console")}<ArrowUpRight size={15} aria-hidden />
              </Link>
              <Link href={cliDocsUrl} className={styles.secondaryButton}>
                {tr("查看 CLI", "Explore the CLI")}<ArrowUpRight size={15} aria-hidden />
              </Link>
            </div>
          </div>

          <div className={styles.terminal} aria-label={tr("共享模型 API 调用示例", "Shared model API example")}>
            <div className={styles.terminalHeader}>
              <span className={styles.terminalDots} aria-hidden><i /><i /><i /></span>
              <span>clovapi / {tr("共享 API", "Shared API")}</span>
              <button type="button" className={styles.copyButton} onClick={copyCommands}>
                {copyState === "copied" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
                <span aria-live="polite">
                  {copyState === "copied" ? tr("已复制", "Copied") : copyState === "failed" ? tr("重试复制", "Retry copy") : tr("复制命令", "Copy commands")}
                </span>
              </button>
            </div>
            <div className={styles.terminalBody}>
              <div className={styles.commands}>
                {API_COMMANDS.map((command, index) => (
                  <div key={command}>
                    <p className={styles.commandComment}># {steps[index]}</p>
                    <div className={styles.commandLine}>
                      <span className={styles.prompt} aria-hidden>$</span>
                      <code><span className={styles.commandName}>{command.split(" ")[0]}</span>{command.slice(command.indexOf(" "))}</code>
                    </div>
                  </div>
                ))}
              </div>
              <aside className={styles.terminalAside}>
                <h2>{tr("共享接口", "Shared endpoint")}</h2>
                <dl>
                  <div>
                    <dt>{tr("API 地址", "API base URL")}</dt>
                    <dd><code>https://api.clovapi.com/v1</code></dd>
                  </div>
                  <div>
                    <dt>{tr("模型目录", "Model catalog")}</dt>
                    <dd><code>/v1/models</code></dd>
                  </div>
                </dl>
                <p className={styles.platforms}>macOS / Windows / Linux</p>
              </aside>
            </div>
          </div>
        </section>

        <section className={styles.features} aria-label={tr("共享机制", "How sharing works")}>
          {features.map((feature) => (
            <div key={feature.title}>
              <h2>{feature.title}</h2>
              <p>{feature.text}</p>
            </div>
          ))}
        </section>

        <section className={styles.faq} id="faq" aria-labelledby="faq-title">
          <h2 id="faq-title">{tr("常见问题", "Questions & answers")}</h2>
          <div className={styles.faqList}>
            {FAQ_ITEMS[language].map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}<ChevronDown size={16} aria-hidden /></summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <footer className={styles.footer}>
          <Link href={localizedPath("/", language)} className={styles.footerBrand}>CLOVAPI</Link>
          <nav aria-label={tr("页脚导航", "Footer navigation")}>
            <Link href={localizedPath("/about", language)}>{tr("关于", "About")}</Link>
            <Link href={localizedPath("/privacy", language)}>{tr("隐私", "Privacy")}</Link>
            <Link href={cliDocsUrl}>{tr("CLI 文档", "CLI docs")}</Link>
            <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">GitHub<ArrowUpRight size={12} aria-hidden /></a>
          </nav>
        </footer>
      </div>
    </div>
  );
}
