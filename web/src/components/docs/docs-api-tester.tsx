"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { flushSync } from "react-dom";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getDocEndpointPath } from "@/lib/docs";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast-provider";
import { Loader2, Play } from "lucide-react";
import { useDocsDarkMode } from "./use-docs-dark-mode";
import jsonEditorStyles from "./docs-json-editor.module.css";

/** 与文档页「原始文档」右侧分栏按钮一致 */
const docsToolbarSegmentClass =
  "flex shrink-0 items-center justify-center gap-1.5 self-stretch border-l border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-40 dark:hover:bg-muted/30 md:px-4";

const DEFAULT_BODIES: Partial<Record<string, string>> = {
  "chat-completions": `{
  "model": "gpt-4.1-mini",
  "stream": true,
  "messages": [{ "role": "user", "content": "Hello" }]
}`,
  responses: `{
  "model": "gpt-4.1-mini",
  "input": "请总结这段文本并输出三点结论"
}`,
  "claude-messages": `{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 1024,
  "messages": [{ "role": "user", "content": "Hello" }]
}`,
  search: `{
  "query": "最新量子计算进展",
  "include_answer": true
}`,
  embeddings: `{
  "model": "text-embedding-3-small",
  "input": "Hello world"
}`,
  rerank: `{
  "model": "rerank-english-v3.0",
  "query": "What is the capital of France?",
  "documents": ["Paris is the capital of France.", "Berlin is the capital of Germany."]
}`,
  "images-generations": `{
  "model": "dall-e-3",
  "prompt": "A minimal line art logo",
  "n": 1,
  "size": "1024x1024"
}`,
  "audio-speech": `{
  "model": "tts-1",
  "input": "Hello from CLOVAPI",
  "voice": "alloy"
}`,
};

type DocsApiTesterProps = {
  apiBaseUrl: string;
  endpointPath: string;
  slug: string;
  /** 多渠道文档时与 slug 组合为 localStorage 键 */
  docSourceId?: string;
  /** 各渠道的默认请求体（优先于 DEFAULT_BODIES[slug]，低于缓存） */
  sourcePresetBodies?: Partial<Record<string, string>>;
};

function formatResponseText(text: string): string {
  const t = text.trim();
  if (!t) return "";
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return text;
  }
}

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  if (e instanceof Error && e.name === "AbortError") return true;
  return false;
}

/** 返回 null 表示合法；否则为简短错误说明 */
function getJsonBodyError(raw: string): string | null {
  const t = raw.trim();
  if (!t) return "请求体不能为空";
  try {
    JSON.parse(t);
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return msg || "JSON 格式无效";
  }
}

const DOCS_TESTER_BODY_STORAGE_KEY = "clovapi.docsTester.requestBodies";

function bodyStorageKey(slug: string, docSourceId?: string | null): string {
  if (docSourceId) return `${slug}::${docSourceId}`;
  return slug;
}

function readCachedRequestBody(slug: string, docSourceId?: string | null): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DOCS_TESTER_BODY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const composite = bodyStorageKey(slug, docSourceId);
    const primary = parsed[composite];
    if (typeof primary === "string" && primary.trim()) return primary;
    if (docSourceId) {
      const legacy = parsed[slug];
      if (typeof legacy === "string" && legacy.trim()) return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

/** 弹窗内流式 `<pre>` 可能晚于 Portal 提交，读流前等到真实 DOM；并供 DOM fallback 查询 */
const DOCS_STREAM_PRE_ID = "docs-api-tester-stream-pre";
/** 与 `<pre>` 并列的状态行，用 textContent 更新（字节/分片），不经过 React setState，避免高频重渲染 */
const DOCS_STREAM_META_ID = "docs-api-tester-stream-meta";

function formatStreamMetaLine(byteLength: number, chunkCount: number): string {
  if (byteLength === 0 && chunkCount === 0) return "连接已建立，等待首包…";
  const n = byteLength;
  const size =
    n >= 1024 * 1024
      ? `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} MB`
      : n >= 1024
        ? `${(n / 1024).toFixed(n >= 10240 ? 0 : 1)} KB`
        : `${n} B`;
  return `已接收 ${size} · ${chunkCount} 次分片 · 流式输出中`;
}

async function waitForStreamPreElement(
  ref: RefObject<HTMLPreElement | null>,
  opts?: { timeoutMs?: number },
): Promise<HTMLPreElement | null> {
  const timeoutMs = opts?.timeoutMs ?? 8000;
  const start = typeof performance !== "undefined" ? performance.now() : 0;
  // Portal 常在微任务 / 下一帧才挂到 document
  await new Promise<void>((r) => queueMicrotask(r));
  for (;;) {
    const el = ref.current ?? document.getElementById(DOCS_STREAM_PRE_ID);
    if (el instanceof HTMLPreElement) return el;
    if (typeof performance !== "undefined" && performance.now() - start > timeoutMs) {
      return null;
    }
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}

function persistRequestBodyForSlug(slug: string, rawBody: string, docSourceId?: string | null) {
  if (typeof window === "undefined") return;
  const trimmed = rawBody.trim();
  if (!trimmed) return;
  try {
    let toStore = trimmed;
    try {
      toStore = JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      // keep raw if not valid JSON (should not happen after send validation)
    }
    const prevRaw = localStorage.getItem(DOCS_TESTER_BODY_STORAGE_KEY);
    const map = (prevRaw ? (JSON.parse(prevRaw) as Record<string, string>) : {}) as Record<string, string>;
    map[bodyStorageKey(slug, docSourceId)] = toStore;
    localStorage.setItem(DOCS_TESTER_BODY_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

export function DocsApiTester({
  slug,
  docSourceId,
  sourcePresetBodies,
}: DocsApiTesterProps) {
  const { showError, showSuccess } = useToast();
  const docsDark = useDocsDarkMode();
  /** 同源相对路径 `/pg/...`，走 Next rewrites → 后端 Playground；依赖 Cookie 会话 + New-Api-User */
  const requestUrl = useMemo(() => {
    const path = getDocEndpointPath(slug);
    if (!path) return "";
    const p = path.startsWith("/") ? path : `/${path}`;
    return `/pg${p}`;
  }, [slug]);

  const [body, setBody] = useState(`{\n  \n}`);
  const [loading, setLoading] = useState(false);
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseText, setResponseText] = useState("");
  const [errorText, setErrorText] = useState("");
  const [responseOpen, setResponseOpen] = useState(false);
  const [bodyBlurred, setBodyBlurred] = useState(false);
  const [sendAttempted, setSendAttempted] = useState(false);
  /** 关闭弹窗、换文档或再次发送时会 abort，避免异步回调继续改状态 */
  const sendAbortRef = useRef<AbortController | null>(null);
  const responseScrollRef = useRef<HTMLDivElement | null>(null);
  /** 流式阶段用 ref 直接写 DOM，避免高频 setState 被合并导致长时间停在占位文案 */
  const streamPreRef = useRef<HTMLPreElement | null>(null);
  const [streamLiveMode, setStreamLiveMode] = useState(false);

  const scrollResponseToBottom = useCallback(() => {
    const el = responseScrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  const bodyJsonError = useMemo(() => getJsonBodyError(body), [body]);
  const showBodyJsonError = Boolean(bodyJsonError && (bodyBlurred || sendAttempted));

  const resetSendState = useCallback(() => {
    sendAbortRef.current?.abort();
    sendAbortRef.current = null;
    setLoading(false);
    setResponseStatus(null);
    setResponseText("");
    setErrorText("");
    setStreamLiveMode(false);
    if (streamPreRef.current) streamPreRef.current.textContent = "";
  }, []);

  const handleResponseOpenChange = useCallback(
    (open: boolean) => {
      setResponseOpen(open);
      if (!open) resetSendState();
    },
    [resetSendState],
  );

  useEffect(() => {
    const cached = readCachedRequestBody(slug, docSourceId);
    const def = DEFAULT_BODIES[slug];
    const preset =
      docSourceId && sourcePresetBodies?.[docSourceId] ? sourcePresetBodies[docSourceId] : undefined;
    setBody(cached ?? preset ?? def ?? `{\n  \n}`);
    resetSendState();
    setResponseOpen(false);
    setBodyBlurred(false);
    setSendAttempted(false);
  }, [slug, docSourceId, sourcePresetBodies, resetSendState]);

  const formatRequestBody = useCallback(() => {
    const err = getJsonBodyError(body);
    if (err) {
      showError(err);
      return;
    }
    try {
      const parsed = JSON.parse(body.trim()) as unknown;
      setBody(JSON.stringify(parsed, null, 2));
      showSuccess("已格式化");
    } catch (e) {
      showError(e instanceof Error ? e.message : "格式化失败");
    }
  }, [body, showError, showSuccess]);

  const send = useCallback(async () => {
    if (!requestUrl) {
      showError("当前文档端点未配置请求路径");
      return;
    }
    setSendAttempted(true);
    const jsonErr = getJsonBodyError(body);
    if (jsonErr) {
      showError(jsonErr);
      return;
    }
    const serialized = JSON.stringify(JSON.parse(body.trim()));
    sendAbortRef.current?.abort();
    const ac = new AbortController();
    sendAbortRef.current = ac;
    setLoading(true);
    setErrorText("");
    setResponseStatus(null);
    setResponseText("");
    setStreamLiveMode(false);
    try {
      const res = await fetch(requestUrl, {
        method: "POST",
        signal: ac.signal,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "New-Api-User": "-1",
        },
        body: serialized,
      });
      if (ac.signal.aborted) return;

      const reader = res.body?.getReader();
      if (!reader) {
        const text = await res.text();
        if (ac.signal.aborted) return;
        flushSync(() => {
          setResponseStatus(res.status);
          setResponseText(text.trim() ? formatResponseText(text) || text : "（空响应）");
          setResponseOpen(true);
        });
        scrollResponseToBottom();
        return;
      }

      // 收到响应头后即打开弹窗；正文用 ref / id 流式写入，避免 React 合并更新导致长时间停在占位
      flushSync(() => {
        setResponseStatus(res.status);
        setStreamLiveMode(true);
        setResponseOpen(true);
        setResponseText("");
        setLoading(false);
      });
      const streamEl = await waitForStreamPreElement(streamPreRef);
      if (typeof document !== "undefined") {
        const meta = document.getElementById(DOCS_STREAM_META_ID);
        if (meta) meta.textContent = "连接已建立，等待首包…";
      }
      if (streamEl) streamEl.textContent = "";

      const decoder = new TextDecoder();
      let acc = "";
      let chunkCount = 0;

      const writeStreamToDom = (nextAcc: string, chunks: number) => {
        const el =
          streamEl ??
          streamPreRef.current ??
          (typeof document !== "undefined" ? document.getElementById(DOCS_STREAM_PRE_ID) : null);
        if (el) el.textContent = nextAcc;
        if (typeof document !== "undefined") {
          const meta = document.getElementById(DOCS_STREAM_META_ID);
          if (meta) meta.textContent = formatStreamMetaLine(nextAcc.length, chunks);
        }
        scrollResponseToBottom();
      };

      while (true) {
        const { done, value } = await reader.read();
        if (ac.signal.aborted) {
          await reader.cancel().catch(() => {});
          return;
        }
        if (done) break;
        if (!value?.length) continue;

        const chunk = decoder.decode(value, { stream: true });
        acc += chunk;
        chunkCount += 1;
        writeStreamToDom(acc, chunkCount);
      }

      const tail = decoder.decode();
      if (tail) {
        acc += tail;
        chunkCount += 1;
        writeStreamToDom(acc, chunkCount);
      }

      const finalText = acc.trim() ? formatResponseText(acc) || acc : "（空响应）";
      flushSync(() => {
        setStreamLiveMode(false);
        setResponseText(finalText);
      });
      scrollResponseToBottom();
    } catch (e) {
      if (ac.signal.aborted || isAbortError(e)) return;
      flushSync(() => {
        setStreamLiveMode(false);
        setErrorText(e instanceof Error ? e.message : String(e));
        setResponseOpen(true);
      });
      scrollResponseToBottom();
    } finally {
      setLoading(false);
      if (ac.signal.aborted) {
        flushSync(() => setStreamLiveMode(false));
      }
      if (!ac.signal.aborted) {
        persistRequestBodyForSlug(slug, body, docSourceId);
      }
    }
  }, [body, docSourceId, requestUrl, showError, slug, scrollResponseToBottom]);

  const canSend = Boolean(requestUrl);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-stretch border-b border-border">
        <div className="flex min-w-0 flex-1 items-center gap-x-3 py-2.5 pl-4 md:pl-5">
          <h2 className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs font-semibold tracking-wide text-zinc-500 dark:text-zinc-400">
            <span className="uppercase">请求测试</span>
            <span className="inline font-normal normal-case tracking-normal text-zinc-500 dark:text-zinc-400">
              （
              {requestUrl ? (
                <span className="text-zinc-600 dark:text-zinc-300">按标准价格计费</span>
              ) : (
                <span className="text-zinc-600 dark:text-zinc-300">当前端点未配置请求路径</span>
              )}
              ）
            </span>
            {showBodyJsonError && bodyJsonError ? (
              <span
                className="min-w-0 max-w-full break-words font-normal normal-case tracking-normal text-destructive sm:max-w-[min(100%,28rem)]"
                role="alert"
                title={bodyJsonError}
              >
                {bodyJsonError}
              </span>
            ) : null}
          </h2>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => formatRequestBody()}
          className={docsToolbarSegmentClass}
        >
          格式化
        </button>
        <button
          type="button"
          disabled={loading || !canSend}
          onClick={() => void send()}
          className={cn(docsToolbarSegmentClass, "min-w-11 px-0 md:min-w-11 md:px-0")}
          aria-label={loading ? "请求中" : "发送"}
          title={loading ? "请求中" : "发送"}
        >
          {loading ? (
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
          ) : (
            <Play className="size-4 shrink-0" aria-hidden />
          )}
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-2.5 md:px-5 md:py-3">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className={jsonEditorStyles.editorWrap}>
            <CodeMirror
              id="docs-tester-body"
              value={body}
              height="100%"
              theme={docsDark ? "dark" : "light"}
              extensions={[
                json(),
                EditorView.domEventHandlers({
                  blur: () => setBodyBlurred(true),
                }),
              ]}
              onChange={(v) => setBody(v)}
              basicSetup={{
                lineNumbers: false,
                foldGutter: false,
                highlightActiveLine: false,
                highlightActiveLineGutter: false,
              }}
              indentWithTab
              spellCheck={false}
              aria-invalid={showBodyJsonError || undefined}
              aria-label="请求体 JSON"
              className="min-h-[10rem] flex-1 sm:min-h-[11rem]"
            />
          </div>
        </div>
      </div>

      <Dialog open={responseOpen} onOpenChange={handleResponseOpenChange}>
        <DialogContent className="flex h-[min(92dvh,92vh)] min-h-[min(92dvh,92vh)] max-h-[min(92dvh,92vh)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 duration-0 data-open:animate-none data-open:zoom-in-100 xl:max-w-7xl">
          <DialogHeader className="shrink-0 border-b border-border px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-2 pr-8">
              <DialogTitle className="text-base">响应</DialogTitle>
              {streamLiveMode ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:text-emerald-200">
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-emerald-500 motion-safe:animate-pulse"
                    aria-hidden
                  />
                  流式接收
                </span>
              ) : null}
              {responseStatus != null ? (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 font-mono text-xs",
                    responseStatus >= 200 && responseStatus < 300
                      ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                      : "bg-red-500/15 text-red-800 dark:text-red-300",
                  )}
                >
                  HTTP {responseStatus}
                </span>
              ) : errorText ? (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-xs text-amber-900 dark:text-amber-200">
                  网络错误
                </span>
              ) : null}
            </div>
          </DialogHeader>
          <div
            ref={responseScrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5"
          >
            {responseStatus == null && errorText ? (
              <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-destructive">{errorText}</pre>
            ) : streamLiveMode ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
                  <span
                    className="inline-block size-2 shrink-0 rounded-full bg-emerald-500 motion-safe:animate-pulse"
                    aria-hidden
                  />
                  <span id={DOCS_STREAM_META_ID} className="min-w-0 font-mono">
                    准备接收…
                  </span>
                </div>
                <pre
                  id={DOCS_STREAM_PRE_ID}
                  ref={streamPreRef}
                  className="min-h-[min(40vh,24rem)] font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground"
                />
              </div>
            ) : (
              <pre className="font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-foreground">
                {responseText || "（空响应）"}
              </pre>
            )}
          </div>
          <div className="flex shrink-0 justify-end border-t border-border bg-muted/30 px-4 py-3 sm:px-5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={() => handleResponseOpenChange(false)}
            >
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
