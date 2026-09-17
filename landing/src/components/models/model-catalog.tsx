"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw, Search } from "lucide-react";
import type { AppLanguage } from "@/i18n/config";
import type { CatalogModel, ModelCatalog } from "@/lib/model-catalog-types";
import { localizedPath } from "@/lib/seo-data";
import { platformAPI } from "@/lib/platform-api";
import styles from "./model-catalog.module.css";

type SortOrder = "24h" | "7d" | "name";
const REFRESH_MS = 60_000;

function isCount(value: unknown) { return Number.isSafeInteger(value) && Number(value) >= 0; }
function isTimestamp(value: unknown) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }

function isCatalog(value: unknown): value is ModelCatalog {
  if (!value || typeof value !== "object") return false;
  const result = value as ModelCatalog;
  return result.object === "model_catalog" && isTimestamp(result.updatedAt) && isTimestamp(result.usageUpdatedAt)
    && isTimestamp(result.historySince) && typeof result.stale === "boolean" && isCount(result.refreshAfterSeconds)
    && Boolean(result.totals) && [result.totals.models, result.totals.nodes, result.totals.requests24h, result.totals.requests7d].every(isCount)
    && Array.isArray(result.models) && result.models.every((model) => Boolean(model) && typeof model.id === "string"
      && [model.availableNodes, model.requests24h, model.requests7d].every(isCount)
      && Array.isArray(model.activity) && model.activity.every((point) => Boolean(point)
        && typeof point.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(point.date) && isCount(point.requests)));
}

function useCatalog() {
  const [catalog, setCatalog] = useState<ModelCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let pending = false;
    let nextDue = 0;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      if (disposed || pending || document.visibilityState === "hidden" || Date.now() < nextDue) return;
      pending = true;
      controller = new AbortController();
      const requestController = controller;
      const requestTimeout = setTimeout(() => requestController.abort(), 12_000);
      setLoading(true);
      try {
        const response = await fetch(platformAPI("/api/models"), { credentials: "omit", cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("catalog_unavailable");
        const value: unknown = await response.json();
        if (!isCatalog(value)) throw new Error("invalid_catalog");
        if (!disposed) { setCatalog(value); setFailed(false); }
      } catch {
        if (!disposed) setFailed(true);
      } finally {
        clearTimeout(requestTimeout);
        pending = false;
        nextDue = Date.now() + REFRESH_MS;
        if (!disposed) {
          setLoading(false);
          timer = setTimeout(() => { void refresh(); }, REFRESH_MS);
        }
      }
    }

    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    void refresh();
    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [attempt]);

  return { catalog, loading, failed, retry: () => setAttempt((value) => value + 1) };
}

function Activity({ model, language }: { model: CatalogModel; language: AppLanguage }) {
  const maximum = Math.max(1, ...model.activity.map((point) => point.requests));
  const format = new Intl.NumberFormat(language);
  const label = model.activity.map((point) => `${point.date}: ${format.format(point.requests)}`).join("; ");
  return (
    <div className={styles.activity} role="img" aria-label={`${language === "en" ? "Daily requests in UTC" : "每日请求数，UTC"}: ${label}`}>
      {model.activity.map((point) => <span key={point.date} title={`${point.date} · ${format.format(point.requests)}`} style={{ height: point.requests ? `${Math.max(3, point.requests / maximum * 28)}px` : "2px" }} data-empty={point.requests === 0} />)}
    </div>
  );
}

export function ModelCatalogPage({ language }: { language: AppLanguage }) {
  const tr = (zh: string, en: string) => language === "en" ? en : zh;
  const { catalog, loading, failed, retry } = useCatalog();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOrder>("24h");
  const format = new Intl.NumberFormat(language);
  const timestamp = new Intl.DateTimeFormat(language, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  const date = new Intl.DateTimeFormat(language, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  const models = (catalog?.models ?? []).filter((model) => model.id.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => {
    const difference = sort === "24h" ? b.requests24h - a.requests24h : sort === "7d" ? b.requests7d - a.requests7d : 0;
    return difference || a.id.localeCompare(b.id, "en");
  });
  const partialHistory = catalog && Date.parse(catalog.usageUpdatedAt) - Date.parse(catalog.historySince) < 7 * 24 * 60 * 60 * 1000;
  const metrics = [
    { label: tr("可用模型", "Available models"), value: catalog?.totals.models },
    { label: tr("供给节点", "Serving nodes"), value: catalog?.totals.nodes },
    { label: tr("近 24 小时调用", "Calls · 24h"), value: catalog?.totals.requests24h },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.heading}>
          <div><h1>{tr("模型", "Models")}</h1><p>{tr("当前可调用的模型，以及近期请求量。", "Available models and their recent request volume.")}</p></div>
          <Link className={styles.consoleLink} href={`${localizedPath("/console", language)}?tab=keys`}>{tr("获取 API Key", "Get an API key")}<ArrowUpRight size={15} aria-hidden /></Link>
        </div>

        <dl className={styles.metrics} aria-label={tr("模型概览", "Model overview")}>
          {metrics.map((metric) => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value === undefined ? <span aria-label={tr("暂无数据", "No data yet")}>—</span> : format.format(metric.value)}</dd></div>)}
        </dl>

        <div className={styles.toolbar}>
          <label className={styles.search}><Search size={16} aria-hidden /><span className={styles.srOnly}>{tr("搜索模型 ID", "Search model IDs")}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tr("搜索模型 ID", "Search model IDs")} disabled={!catalog} /></label>
          <label className={styles.sort}><span>{tr("排序", "Sort")}</span><select value={sort} onChange={(event) => setSort(event.target.value as SortOrder)} disabled={!catalog}><option value="24h">{tr("24 小时请求量", "24h requests")}</option><option value="7d">{tr("7 天请求量", "7d requests")}</option><option value="name">{tr("模型名称", "Model name")}</option></select></label>
        </div>

        {catalog && (failed || catalog.stale) && <div className={styles.notice} role="status"><p>{tr("暂时无法更新，正在显示上次获取的数据。", "Updates are unavailable. Showing the last available data.")}</p><button type="button" onClick={retry} disabled={loading}><RefreshCw size={14} aria-hidden />{tr("重试", "Retry")}</button></div>}

        {!catalog ? (
          <div className={styles.empty} role={failed ? "alert" : "status"}>
            <p>{failed ? tr("暂时无法加载模型列表。", "The model list could not be loaded.") : tr("正在获取可用模型与用量数据。", "Fetching available models and usage.")}</p>
            {failed && <button type="button" className={styles.textButton} onClick={retry} disabled={loading}><RefreshCw size={14} aria-hidden />{loading ? tr("重试中…", "Retrying…") : tr("重新加载", "Try again")}</button>}
          </div>
        ) : catalog.models.length === 0 ? (
          <div className={styles.empty}><h2>{tr("暂无可用模型", "No models are available")}</h2><p>{tr("节点接入并开放共享后，模型会显示在这里。", "Models appear here when connected nodes are ready to share.")}</p><Link href={`${localizedPath("/console", language)}?tab=contribute`} className={styles.textButton}>{tr("连接我的节点", "Connect a node")}<ArrowUpRight size={14} aria-hidden /></Link></div>
        ) : models.length === 0 ? (
          <div className={styles.empty} role="status"><h2>{tr("没有匹配的模型", "No matching models")}</h2><p>{tr("试试其他名称，或清空搜索。", "Try another name or clear your search.")}</p><button type="button" className={styles.textButton} onClick={() => setQuery("")}>{tr("清空搜索", "Clear search")}</button></div>
        ) : (
          <>
            <div className={styles.columnLabels} aria-hidden><span>{tr("模型 ID", "Model ID")}</span><span>{tr("可用节点", "Nodes")}</span><span>{tr("24 小时请求", "24h requests")}</span><span>{tr("7 天请求", "7d requests")}</span><span>{tr("每日请求 · UTC", "Daily requests · UTC")}</span></div>
            <ul className={styles.modelList} aria-label={tr("可用模型列表", "Available models")}>
              {models.map((model) => <li key={model.id} className={styles.modelRow}>
                <h2>{model.id}</h2>
                <dl><div><dt>{tr("可用节点", "Nodes")}</dt><dd>{format.format(model.availableNodes)}</dd></div><div><dt>{tr("24 小时请求", "24h requests")}</dt><dd>{format.format(model.requests24h)}</dd></div><div><dt>{tr("7 天请求", "7d requests")}</dt><dd>{format.format(model.requests7d)}</dd></div></dl>
                <div className={styles.trend}><span>{tr("每日请求 · UTC", "Daily requests · UTC")}</span><Activity model={model} language={language} /></div>
              </li>)}
            </ul>
          </>
        )}

        {catalog && <div className={styles.notes}>
          <p>{tr("请求量仅汇总当前列表中的模型，按已受理请求计数，包含后续失败或取消的请求。", "Usage covers the models currently listed. Counts include accepted requests that later fail or are cancelled.")}</p>
          <p>{tr("24 小时与 7 天统计截至上一个完整分钟：", "24h and 7d totals end at the last completed minute: ")}<time dateTime={catalog.usageUpdatedAt}>{timestamp.format(new Date(catalog.usageUpdatedAt))} UTC</time>{partialHistory && <> · {tr("开始记录于 ", "History starts ")}<time dateTime={catalog.historySince}>{date.format(new Date(catalog.historySince))}</time></>}</p>
        </div>}
      </div>
    </div>
  );
}
