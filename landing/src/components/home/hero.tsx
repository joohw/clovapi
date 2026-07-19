"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClientDownloadButtons } from "@/components/home/client-download-buttons";
import styles from "@/app/page.module.css";

const WORKFLOW_LINES = [
  { prompt: true, text: "npm i -g @clovapi/cli" },
  { prompt: true, text: "clovapi auth login --provider codex" },
  { prompt: false, text: "✓ Codex subscription connected" },
  { prompt: true, text: "clovapi profiles add --provider custom --api-style responses --model my-model" },
  { prompt: false, text: "✓ Profile custom saved" },
  { prompt: true, text: "clovapi proxy start" },
  { prompt: false, text: "✓ Proxy listening on http://127.0.0.1:27483" },
  { prompt: true, text: "clovapi profiles test --provider custom --model my-model --json" },
  { prompt: false, text: '{"provider":"custom","status":"ok","model":"my-model"}' },
  { prompt: true, text: 'curl -s "http://127.0.0.1:27483/usage?refresh=1"' },
  { prompt: false, text: "✓ Codex · 5-hour 24% used · weekly 12% used" },
] as const;

type RenderedWorkflowLine = {
  sourceIndex: number;
  prompt: boolean;
  text: string;
};

const COMPLETE_WORKFLOW: RenderedWorkflowLine[] = WORKFLOW_LINES.map((line, sourceIndex) => ({
  sourceIndex,
  prompt: line.prompt,
  text: line.text,
}));

function renderCommand(command: string) {
  const tokens = command.match(/"[^"]*"|'[^']*'|\s+|[^\s]+/g) ?? [command];
  let wordIndex = -1;
  let previousWord = "";

  return tokens.map((token, index) => {
    if (/^\s+$/.test(token)) return token;

    wordIndex += 1;
    let className = "text-foreground/85";

    if (wordIndex === 0) {
      className = "font-semibold text-foreground";
    } else if (token.startsWith("-")) {
      className = "text-[#9a5f32] dark:text-[#d8a170]";
    } else if (
      token.startsWith('"') ||
      token.startsWith("'") ||
      token.startsWith("http") ||
      token.startsWith("@") ||
      previousWord.startsWith("-")
    ) {
      className = "text-[#486f7c] dark:text-[#88b3c0]";
    } else if (wordIndex <= 2) {
      className = "font-medium text-[#66518a] dark:text-[#b5a0d5]";
    }

    previousWord = token;
    return (
      <span key={`${index}-${token}`} className={className}>
        {token}
      </span>
    );
  });
}

function renderOutput(output: string) {
  if (output.startsWith("✓")) {
    return (
      <>
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">✓</span>
        <span className="text-foreground/70">{output.slice(1)}</span>
      </>
    );
  }

  return <span className="text-[#486f7c] dark:text-[#88b3c0]">{output}</span>;
}

export function HomeHero() {
  const { t, i18n } = useTranslation();
  const english = i18n.language.startsWith("en");
  const [renderedLines, setRenderedLines] = useState<RenderedWorkflowLine[]>(COMPLETE_WORKFLOW);
  const [proxyRunning, setProxyRunning] = useState(true);
  const [usageLoaded, setUsageLoaded] = useState(true);
  const proxyStatusLabel = proxyRunning
    ? english ? "Running" : "运行中"
    : english ? "Starting" : "启动中";

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const wait = (duration: number) =>
      new Promise<void>((resolve) => {
        timeoutId = setTimeout(resolve, duration);
      });

    async function animateWorkflow() {
      await wait(1200);

      while (!cancelled) {
        setRenderedLines([]);
        setProxyRunning(false);
        setUsageLoaded(false);
        await wait(450);
        if (cancelled) return;

        for (let sourceIndex = 0; sourceIndex < WORKFLOW_LINES.length; sourceIndex += 1) {
          const line = WORKFLOW_LINES[sourceIndex];

          if (line.prompt) {
            setRenderedLines((current) => [
              ...current,
              { sourceIndex, prompt: true, text: "" },
            ]);

            for (let length = 1; length <= line.text.length; length += 1) {
              await wait(18);
              if (cancelled) return;
              setRenderedLines((current) =>
                current.map((item) =>
                  item.sourceIndex === sourceIndex
                    ? { ...item, text: line.text.slice(0, length) }
                    : item,
                ),
              );
            }
            await wait(320);
          } else {
            await wait(260);
            if (cancelled) return;
            setRenderedLines((current) => [
              ...current,
              { sourceIndex, prompt: false, text: line.text },
            ]);
            if (sourceIndex === 6) setProxyRunning(true);
            if (sourceIndex === 10) setUsageLoaded(true);
            await wait(420);
          }

          if (cancelled) return;
        }

        await wait(3600);
      }
    }

    void animateWorkflow();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return (
    <section className="relative z-[1] px-5 pb-14 pt-8 sm:px-6 sm:pb-20 sm:pt-10 md:pb-24 md:pt-12 lg:pt-14">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-3xl">
          <h1 className="text-balance text-2xl font-medium leading-relaxed tracking-[-0.015em] text-foreground">
            {t("home.title")}
          </h1>

          <p className="mt-2 text-pretty text-2xl leading-relaxed tracking-[-0.015em] text-muted-foreground">
            {t("home.subtitle")}
          </p>

          <ClientDownloadButtons className="mt-7" />
        </div>

        <div className={`${styles.terminalCard} mt-12 sm:mt-14`}>
          <div className={styles.terminalHeader}>
            <div className="flex gap-1.5" aria-hidden>
              <span className={styles.terminalDot} />
              <span className={styles.terminalDot} />
              <span className={styles.terminalDot} />
            </div>
            <span className="ml-3 text-xs font-medium text-muted-foreground">clovapi / {t("home.quickStart")}</span>
          </div>

          <div className="grid lg:min-h-[40rem] lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div
              className="space-y-2 p-5 font-mono text-[0.8125rem] leading-relaxed sm:p-6 sm:text-sm lg:border-r lg:border-border/80"
              aria-label={english ? "Animated clovapi command demo" : "clovapi 动态命令演示"}
            >
              {renderedLines.map((line, index) => {
                const sourceLine = WORKFLOW_LINES[line.sourceIndex];
                const isTyping =
                  line.prompt &&
                  index === renderedLines.length - 1 &&
                  line.text.length < sourceLine.text.length;

                return (
                  <div
                    key={line.sourceIndex}
                    className="flex gap-2.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
                  >
                    {line.prompt ? (
                      <>
                        <span className="shrink-0 select-none text-muted-foreground">$</span>
                        <code className="min-w-0 break-words">
                          {renderCommand(line.text)}
                          {isTyping ? (
                            <span className="ml-0.5 inline-block h-[1em] w-px translate-y-[0.12em] bg-foreground motion-safe:animate-pulse" aria-hidden />
                          ) : null}
                        </code>
                      </>
                    ) : (
                      <>
                        <span className="shrink-0 select-none text-muted-foreground/50">›</span>
                        <code className="min-w-0 break-words">{renderOutput(line.text)}</code>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <aside className="border-t border-border/80 p-5 sm:p-6 lg:border-t-0">
              <div className="flex items-center justify-between gap-4">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {english ? "Local proxy" : "本地代理"}
                </p>
                <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
                  <span
                    className={`size-1.5 rounded-full transition-colors duration-500 ${
                      proxyRunning ? "bg-emerald-500" : "bg-amber-400 motion-safe:animate-pulse"
                    }`}
                  />
                  {proxyStatusLabel}
                </span>
              </div>

              <p className="mt-4 break-all font-mono text-xs text-muted-foreground">http://127.0.0.1:27483</p>
              <div
                className={`mt-5 space-y-3 border-t border-border/80 pt-5 text-xs transition-opacity duration-500 ${
                  proxyRunning ? "opacity-100" : "opacity-35"
                }`}
              >
                <div>
                  <p className="font-medium text-foreground">Codex · Responses</p>
                  <code className="mt-1 block break-all text-muted-foreground">/codex/v1/responses</code>
                </div>
                <div>
                  <p className="font-medium text-foreground">Claude · Messages</p>
                  <code className="mt-1 block break-all text-muted-foreground">/claude-code/v1/messages</code>
                </div>
                <div>
                  <p className="font-medium text-foreground">Custom · OpenAI</p>
                  <code className="mt-1 block break-all text-muted-foreground">/custom/v1/chat/completions</code>
                </div>
              </div>

              <div
                className={`mt-6 border-t border-border/80 pt-5 transition-opacity duration-500 ${
                  usageLoaded ? "opacity-100" : "opacity-35"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {english ? "Subscription quota" : "订阅额度"}
                  </p>
                  <span className="text-[0.6875rem] text-muted-foreground">
                    {usageLoaded
                      ? english ? "Updated" : "已更新"
                      : english ? "Waiting" : "等待查询"}
                  </span>
                </div>

                <div className="mt-4 space-y-4 text-xs">
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-foreground">{english ? "5-hour" : "5 小时"}</span>
                      <span className="text-muted-foreground">{english ? "76% left" : "剩余 76%"}</span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-border/70">
                      <div
                        className={`h-full rounded-full bg-foreground/70 transition-[width] duration-700 ${
                          usageLoaded ? "w-[76%]" : "w-0"
                        }`}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium text-foreground">{english ? "Weekly" : "每周"}</span>
                      <span className="text-muted-foreground">{english ? "88% left" : "剩余 88%"}</span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-border/70">
                      <div
                        className={`h-full rounded-full bg-foreground/70 transition-[width] duration-700 ${
                          usageLoaded ? "w-[88%]" : "w-0"
                        }`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>

      </div>
    </section>
  );
}
