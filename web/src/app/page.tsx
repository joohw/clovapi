"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Copy, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast-provider";
import { HOME_CLI_CLIENTS, SITE_NAME } from "@/lib/site";
import styles from "./page.module.css";

type HomeOriginalDoc = {
  label: string;
  href: string;
  description: string;
};

type HomeInstallCommand = {
  id: string;
  label: string;
  command: string;
};

const ORIGINAL_DOCS: HomeOriginalDoc[] = [
  {
    label: "OpenAI Chat Completions",
    href: "https://platform.openai.com/docs/api-reference/chat/create",
    description: "原始文档：/v1/chat/completions",
  },
  {
    label: "Anthropic Messages",
    href: "https://docs.anthropic.com/en/api/messages",
    description: "原始文档：/v1/messages",
  },
  {
    label: "OpenAI Responses",
    href: "https://platform.openai.com/docs/api-reference/responses",
    description: "原始文档：/v1/responses",
  },
  {
    label: "Google Gemini API",
    href: "https://ai.google.dev/gemini-api/docs",
    description: "原始文档：Gemini GenerateContent",
  },
];

const INSTALL_COMMANDS: HomeInstallCommand[] = [
  { id: "curl", label: "curl", command: "curl -fsSL https://clovapi.com/install.sh | bash" },
  { id: "npm", label: "npm", command: "npm i -g @clovapi/cli" },
  { id: "brew", label: "Homebrew", command: "brew install joohw/homebrew-tap/clovapi" },
  { id: "winget", label: "winget", command: "winget install Clovapi.Clovapi" },
];

const PROVIDER_LOGOS = [
  { id: "openai", alt: "OpenAI" },
  { id: "anthropic", alt: "Anthropic" },
  { id: "google", alt: "Google Gemini" },
  { id: "mistral", alt: "Mistral AI" },
  { id: "deepseek", alt: "DeepSeek" },
  { id: "xai", alt: "xAI" },
  { id: "azure", alt: "Microsoft Azure" },
  { id: "groq", alt: "Groq" },
  { id: "nvidia", alt: "NVIDIA" },
  { id: "cohere", alt: "Cohere" },
  { id: "huggingface", alt: "Hugging Face" },
  { id: "openrouter", alt: "OpenRouter" },
];

/** 底层中性灰雾 + 静态点阵（Dot Grid 风格）+ 淡入页面背景 */
function LandingQuietBackdrop() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-background"
      aria-hidden
    >
      <div className={`absolute inset-0 ${styles.landingBackdrop}`} />
      <div className={`absolute inset-0 ${styles.landingBackdropVeil}`} />
      <div className={`absolute inset-0 ${styles.landingDotGrid}`} />
    </div>
  );
}

export default function HomePage() {
  const { showError, showSuccess } = useToast();
  const [clientOrigin, setClientOrigin] = useState("");
  const [cliIndex, setCliIndex] = useState(0);
  const [installTab, setInstallTab] = useState(INSTALL_COMMANDS[0]?.id || "npm");

  const showDefaultLanding = true;

  useEffect(() => {
    document.title = `将 ${HOME_CLI_CLIENTS[cliIndex]} 切换为任意上游 · ${SITE_NAME}`;
  }, [cliIndex]);

  useEffect(() => {
    const intervalMs = 3200;
    const id = window.setInterval(() => {
      setCliIndex((i) => (i + 1) % HOME_CLI_CLIENTS.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, []);

  const publicSiteUrl = useMemo(
    () => (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "") || clientOrigin || "/",
    [clientOrigin],
  );

  useEffect(() => {
    setClientOrigin(window.location.origin);
  }, []);

  async function copyInstallCommand(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      showSuccess("安装命令已复制到剪贴板");
    } catch {
      showError("复制失败");
    }
  }

  const showLandingBackdrop = true;

  return (
    <div className={`page-wrap ${styles.home} relative `}>
      {showLandingBackdrop ? <LandingQuietBackdrop /> : null}
      {showDefaultLanding ? (
        <div className="relative z-[1] w-full min-w-0">
          <div className="home-landing relative mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-8 pb-14 pt-1 sm:gap-10 sm:pb-16 sm:pt-2 md:pt-4">
            <section className="relative z-[1] w-full min-w-0 overflow-hidden rounded-2xl px-5 py-8 text-left  sm:py-10  md:py-12">
              <header className="relative">
                <p className="inline-flex items-center gap-2 font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  <Sparkles className="size-3.5 shrink-0 text-muted-foreground/90" aria-hidden />
                  Agent-first · High-performance API
                </p>
                <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl md:text-6xl">
                  开源 API 切换器
                </h1>
                <p className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-[1.05rem]">
                  在 Claude Code、Codex、OpenCode 等Agent CLI 中保持同一套接入方式，无需反复改配置；clovapi 帮你把请求切换到不同上游，实现故障切换与灵活选路。
                </p>
              </header>

              <div className="mt-10 inline-flex max-w-full min-w-0 flex-col items-start gap-2 text-left">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  安装命令
                </span>
                <Tabs value={installTab} onValueChange={setInstallTab} className="max-w-full">
                  <TabsList variant="line" className="w-fit justify-start p-0">
                    {INSTALL_COMMANDS.map((item) => (
                      <TabsTrigger key={item.id} value={item.id} className="px-3">
                        {item.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  {INSTALL_COMMANDS.map((item) => (
                    <TabsContent key={item.id} value={item.id} className="mt-3 min-w-0">
                      <div className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-md bg-muted/35 px-2.5 py-1.5">
                        <code className="break-all font-mono text-sm leading-snug text-foreground sm:text-base">
                          {item.command}
                        </code>
                        <button
                          type="button"
                          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-muted/40 hover:text-foreground"
                          aria-label={`复制 ${item.label} 安装命令`}
                          onClick={() => void copyInstallCommand(item.command)}
                        >
                          <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        </button>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-start gap-3">
                <Link
                  href="/docs"
                  className="btn btn-outline inline-flex h-11 min-h-11 items-center gap-2 px-8 text-sm font-medium sm:h-12 sm:min-h-12 sm:px-10 sm:text-base"
                >
                  查看教程
                  <ArrowRight className="size-4 opacity-70" aria-hidden />
                </Link>
              </div>
            </section>

            <section className="relative z-[1] overflow-hidden rounded-2xl">
              <div className="pb-0 pt-2 sm:pt-3 p-6">
                <h2 className="text-sm font-medium tracking-tight text-foreground/90">
                  兼容4种 API 风格
                </h2>
              </div>
              <ul className="m-0 grid list-none grid-cols-1 gap-2.5 p-3 pt-2 sm:p-4 sm:pt-3">
                {ORIGINAL_DOCS.map((item) => {
                  const docIsExternal = /^https?:\/\//i.test(item.href);
                  return (
                    <li
                      key={item.label}
                      className="group relative m-0 min-w-0 overflow-hidden rounded-xl border border-border/40 bg-transparent text-left transition-colors duration-150 hover:border-border/70 hover:bg-muted/10"
                    >
                      {docIsExternal ? (
                        <a
                          href={item.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="absolute inset-0 z-0 outline-offset-[-1px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          aria-label={`查看「${item.label}」（新标签页打开）`}
                        />
                      ) : (
                        <Link
                          href={item.href}
                          className="absolute inset-0 z-0 outline-offset-[-1px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                          aria-label={`查看「${item.label}」`}
                        />
                      )}
                      <div className="pointer-events-none relative z-[1] p-4 sm:p-5">
                        <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-foreground/85">
                          {item.label}
                          <ArrowRight className="size-3.5 opacity-0 transition-opacity duration-150 group-hover:opacity-60" aria-hidden />
                        </span>
                        <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>

            <div className="relative z-[1] overflow-hidden rounded-2xl px-5 py-8 sm:px-7 sm:py-9">
              <section>
                <div className="mb-6 flex flex-col gap-2 text-left sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold tracking-tight text-foreground md:text-xl">
                      多家供应商，一处切换
                    </h2>
                    <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted-foreground">
                      同一套 SDK / CLI / Agent 配置，后端按需映射通道——对标 IDE 里「切换服务商」，只是把切换放到了网关侧。
                    </p>
                  </div>
                </div>
                <div className={`${styles.providerStrip} flex w-full flex-wrap items-center justify-start gap-x-5 gap-y-4 px-0 py-1 leading-none md:gap-x-7 md:px-1`}>
                  {PROVIDER_LOGOS.map((provider) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={provider.id}
                      src={`/vendor-icons/${provider.id}.svg`}
                      alt={provider.alt}
                      className={`${styles.providerIcon} opacity-90 transition-opacity duration-200 hover:opacity-100`}
                      width="32"
                      height="32"
                      loading="lazy"
                      decoding="async"
                    />
                  ))}
                </div>
              </section>
            </div>

            <footer className="relative z-[1] mt-4 flex w-full flex-col items-start gap-2 px-5 pt-10 text-left sm:px-8 md:px-10">
              <p className="text-[0.95rem] font-semibold tracking-tight">
                <a href={publicSiteUrl} className="text-foreground transition-colors hover:text-muted-foreground">
                  CLOVAPI
                </a>
              </p>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                © 2026 CLOVAPI
              </p>
            </footer>
          </div>
        </div>
      ) : null}

    </div>
  );
}
