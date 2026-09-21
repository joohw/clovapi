"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Copy } from "lucide-react";
import { DigitalGlobe } from "./digital-globe";
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
  const modelsUrl = localizedPath("/models", language);
  const sharingDocsUrl = localizedPath("/docs/sharing", language);
  const steps = [
    tr("复制平台 API Key", "Copy your platform API key"),
    tr("使用统一共享接口", "Use the shared API endpoint"),
    tr("查看当前在线模型", "List models currently online"),
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
          <div className={styles.heroMain}>
            <div className={styles.heroCopy}>
              <h1 id="hero-title">{tr("接入共享模型网络", "Connect to the shared model network")}</h1>
              <p className={styles.heroIntro}>
                {tr("一个平台 API Key，发现并调用在线模型。也可以连接自己的节点，让可用模型加入网络。", "Discover and call online models with one platform API key. Connect your own node to bring available models into the network.")}
              </p>
              <div className={styles.heroActions}>
                <Link href={modelsUrl} className={styles.primaryButton}>
                  {tr("浏览在线模型", "Explore models")}<ArrowUpRight size={16} aria-hidden />
                </Link>
                <Link href={consoleUrl} className={styles.secondaryButton}>
                  {tr("获取 API Key", "Get an API key")}<ArrowUpRight size={16} aria-hidden />
                </Link>
              </div>
              <p className={styles.heroNote}>{tr("无需安装 CLI，也无需先贡献资源，即可开始调用。", "No CLI installation or contribution is required to start calling.")}</p>
            </div>
            <div className={styles.heroVisual}>
              <DigitalGlobe />
            </div>
          </div>
        </section>

        <section className={styles.network} id="network" aria-labelledby="network-title">
          <div className={styles.sectionHeading}>
            <h2 id="network-title">{tr("分散的模型供给，汇入一个入口。", "Distributed model supply. One API entry point.")}</h2>
            <p>{tr("贡献节点与平台供给共同构成在线模型目录。你通过同一个平台 API Key 发现模型并发送请求。", "Contribution nodes and platform capacity form one online model catalog. Discover models and send requests with the same platform API key.")}</p>
          </div>
          <div className={styles.networkFlow}>
            <div className={styles.flowSources}>
              <div><span>01</span>{tr("在线贡献节点", "Online contribution nodes")}</div>
              <div><span>02</span>{tr("平台供给", "Platform capacity")}</div>
            </div>
            <ArrowRight className={styles.flowArrow} size={22} aria-hidden />
            <div className={styles.flowCore}><span>clovapi</span><strong>/v1 API</strong><small>{tr("统一模型目录与调用入口", "One catalog and calling endpoint")}</small></div>
            <ArrowRight className={styles.flowArrow} size={22} aria-hidden />
            <div className={styles.flowClient}><span>03</span><strong>{tr("你的应用或 Agent", "Your app or agent")}</strong><small>{tr("使用平台 API Key", "Use a platform API key")}</small></div>
          </div>
        </section>

        <section className={styles.participate} aria-labelledby="participate-title">
          <div className={styles.sectionHeading}>
            <h2 id="participate-title">{tr("先调用，也可以选择贡献。", "Call models. Contribute when you choose.")}</h2>
          </div>
          <div className={styles.roleGrid}>
            <article className={styles.roleCard}>
              <h3>{tr("作为调用方", "For callers")}</h3>
              <p>{tr("创建平台 API Key，在模型目录中查看当前在线供给，然后通过统一接口调用。", "Create a platform API key, browse currently online models, and call them through one API endpoint.")}</p>
              <ul>
                <li>{tr("无需运行本地节点", "No local node required")}</li>
                <li>{tr("按实际在线模型选择", "Choose from models currently online")}</li>
              </ul>
              <Link href={modelsUrl}>{tr("查看模型目录", "Browse models")}<ArrowUpRight size={16} aria-hidden /></Link>
            </article>
            <article className={styles.roleCard}>
              <h3>{tr("作为贡献方", "For contributors")}</h3>
              <p>{tr("在自己的设备运行开源 CLI，将本地可用模型接入网络；上游凭证留在节点上。", "Run the open-source CLI on your own device to connect available models. Upstream credentials stay on the node.")}</p>
              <ul>
                <li>{tr("设置每日请求上限", "Set a daily request limit")}</li>
                <li>{tr("随时暂停或断开节点", "Pause or disconnect at any time")}</li>
              </ul>
              <Link href={sharingDocsUrl}>{tr("了解节点接入", "Learn about contribution")}<ArrowUpRight size={16} aria-hidden /></Link>
            </article>
          </div>
        </section>

        <section className={styles.example} aria-labelledby="example-title">
          <div className={styles.sectionHeading}>
            <h2 id="example-title">{tr("兼容多种 API 格式", "Compatible with multiple API formats")}</h2>
            <p>{tr("获取平台 API Key 后，先查看在线模型，再选用完整模型 ID 发起调用。", "Once you have a platform API key, list online models and use a complete model ID for your request.")}</p>
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

        <section className={styles.faq} id="faq" aria-labelledby="faq-title">
          <div><h2 id="faq-title">{tr("常见问题", "Questions & answers")}</h2></div>
          <div className={styles.faqList}>
            {FAQ_ITEMS[language].map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}<ChevronDown size={16} aria-hidden /></summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.finalCta} aria-label={tr("开始使用 clovapi", "Get started with clovapi")}>
          <div><h2>{tr("从在线模型开始。", "Start with the models online now.")}</h2></div>
          <Link href={consoleUrl} className={styles.primaryButton}>{tr("进入控制台", "Open console")}<ArrowUpRight size={16} aria-hidden /></Link>
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
