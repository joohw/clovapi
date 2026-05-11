"use client";

import { type SyntheticEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiGet } from "@/lib/api";
import { apiPut } from "@/lib/api";
import { useToast } from "@/components/ui/toast-provider";
import { resolveVendorIcon } from "@/lib/vendor-icon";
import { getStoredUser, isAdminUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import curatedModelsJson from "@/data/curatedmodels.json";

type ModelItem = {
  id?: number;
  vendor_id?: number;
  model_name?: string;
  description?: string;
  tags?: string;
  vendor_name?: string;
  vendor_icon?: string;
  premium_ratio?: number;
  input_price?: number;
  output_price?: number;
  cache_read_price?: number;
  quota_type?: number;
  spec?: { reasoning?: unknown } | null;
};

type ModelPricingEditor = {
  modelName: string;
  quotaType: number;
  input: string;
  output: string;
  cacheRead: string;
  perCall: string;
  premium: string;
};

type SortKey =
  | "model_name"
  | "vendor_name"
  | "reasoning"
  | "premium_ratio"
  | "input_price"
  | "output_price"
  | "cache_read_price"
  | "per_call_price"
  | null;

type SortDirection = "asc" | "desc" | null;
type ModelsTab = "recommended" | "all";

type CuratedModelItem = {
  model: string;
  provider: string;
  apiStyle: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  inputUsdPerM?: number;
  outputUsdPerM?: number;
  cacheReadUsdPerM?: number;
  notes?: string;
};

const MODEL_OPTION_KEYS = [
  "ModelInputUSDPerM",
  "ModelOutputUSDPerM",
  "ModelCacheReadUSDPerM",
  "ModelPerCallUSD",
  "ModelPremiumRatio",
] as const;

const formInputClass =
  "w-full min-h-10 rounded-sm border border-border bg-transparent px-3 py-2 text-sm text-foreground";

function fmtPrice(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value) || value === 0) return "-";
  return `$${value.toFixed(3)}`;
}

const PRICE_ALIGN_CLASS = "text-right font-mono tabular-nums";
const curatedModels = curatedModelsJson as CuratedModelItem[];

function parseNumberMap(raw: unknown) {
  const text = String(raw || "").trim();
  if (!text) return {} as Record<string, number>;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed || {})) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

function stringifyMap(map: Record<string, number>) {
  return JSON.stringify(map || {});
}

function formatInteger(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toLocaleString("en-US");
}

function formatPricePerM(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `$${value.toFixed(3)}`;
}

export default function ModelsPage() {
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [models, setModels] = useState<ModelItem[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    model: ModelItem;
  } | null>(null);
  const [showModelPricingEditor, setShowModelPricingEditor] = useState(false);
  const [modelOptionMaps, setModelOptionMaps] = useState<Record<string, Record<string, number>>>({});
  const [modelPricingEditor, setModelPricingEditor] = useState<ModelPricingEditor>({
    modelName: "",
    quotaType: 0,
    input: "",
    output: "",
    cacheRead: "",
    perCall: "",
    premium: "",
  });
  const [modelPricingSaving, setModelPricingSaving] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [activeTab, setActiveTab] = useState<ModelsTab>("recommended");

  function inferVendorNameFromModelName(modelName?: string): string {
    const raw = String(modelName || "").trim();
    if (!raw) return "";
    const idx = raw.indexOf("/");
    if (idx <= 0) return "";
    return raw.slice(0, idx);
  }

  useEffect(() => {
    setIsAdmin(isAdminUser(getStoredUser()));
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const pricingRes = await apiGet("/api/pricing");
        if (!pricingRes?.success) {
          showError(pricingRes?.message || "加载模型失败");
          return;
        }
        const vendorMap: Record<string, any> = {};
        if (Array.isArray(pricingRes.vendors)) {
          for (const vendor of pricingRes.vendors) vendorMap[vendor.id] = vendor;
        }
        const sourceModels: ModelItem[] = Array.isArray(pricingRes.data) ? pricingRes.data : [];
        setModels(
          sourceModels.map((model) => {
            const vendor = model.vendor_id ? vendorMap[model.vendor_id] : null;
            const inferredVendorName = inferVendorNameFromModelName(model.model_name);
            return {
              ...model,
              vendor_name: model.vendor_name || vendor?.name || inferredVendorName || "",
              vendor_icon: model.vendor_icon || vendor?.icon || "",
              spec: model.spec || null,
            };
          }),
        );
      } catch {
        showError("加载模型失败");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [showError]);

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener("click", closeContextMenu);
    window.addEventListener("scroll", closeContextMenu, true);
    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("scroll", closeContextMenu, true);
    };
  }, []);

  const filtered = useMemo(() => {
    const key = search.trim().toLowerCase();
    if (!key) return models;
    return models.filter((m) =>
      [m.model_name, m.description, m.tags, m.vendor_name].some((field) =>
        String(field || "").toLowerCase().includes(key),
      ),
    );
  }, [models, search]);

  const getReasoningCapability = useCallback((model: ModelItem) => {
    const reasoning = model?.spec?.reasoning;
    if (typeof reasoning === "boolean") {
      return { state: reasoning ? "supported" : "unsupported" as const };
    }
    if (typeof reasoning === "number") {
      return { state: reasoning > 0 ? "supported" : "unsupported" as const };
    }
    if (typeof reasoning === "string") {
      const normalized = reasoning.trim().toLowerCase();
      if (["true", "yes", "1", "supported"].includes(normalized)) {
        return { state: "supported" as const };
      }
      if (["false", "no", "0", "unsupported"].includes(normalized)) {
        return { state: "unsupported" as const };
      }
    }
    if (reasoning && typeof reasoning === "object") {
      return { state: "supported" as const };
    }
    return { state: "unknown" as const };
  }, []);

  function toggleSort(key: Exclude<SortKey, null>) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection("asc");
      return;
    }
    if (sortDirection === "asc") {
      setSortDirection("desc");
      return;
    }
    setSortKey(null);
    setSortDirection(null);
  }

  function sortIndicator(key: Exclude<SortKey, null>) {
    if (sortKey !== key || !sortDirection) return "↕";
    return sortDirection === "asc" ? "↑" : "↓";
  }

  const getSortValue = useCallback((model: ModelItem, key: Exclude<SortKey, null>) => {
    switch (key) {
      case "model_name":
        return String(model.model_name || "").toLowerCase();
      case "vendor_name":
        return String(model.vendor_name || "").toLowerCase();
      case "reasoning": {
        const capability = getReasoningCapability(model);
        if (capability.state === "supported") return 1;
        if (capability.state === "unsupported") return 0;
        return null;
      }
      case "premium_ratio":
        return typeof model.premium_ratio === "number" ? model.premium_ratio : null;
      case "input_price":
        return typeof model.input_price === "number" ? model.input_price : null;
      case "output_price":
        return typeof model.output_price === "number" ? model.output_price : null;
      case "cache_read_price":
        if (model.quota_type !== 0) return null;
        return typeof model.cache_read_price === "number" ? model.cache_read_price : null;
      case "per_call_price":
        if (model.quota_type !== 1) return null;
        return typeof model.input_price === "number" ? model.input_price : null;
      default:
        return null;
    }
  }, [getReasoningCapability]);

  const sorted = useMemo(() => {
    if (!sortKey || !sortDirection) return filtered;
    const factor = sortDirection === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = getSortValue(a, sortKey);
      const bv = getSortValue(b, sortKey);
      const aNil = av === null || av === undefined || av === "";
      const bNil = bv === null || bv === undefined || bv === "";
      if (aNil && bNil) return 0;
      if (aNil) return 1;
      if (bNil) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
      return String(av).localeCompare(String(bv), "zh-Hans-CN") * factor;
    });
  }, [filtered, sortDirection, sortKey, getSortValue]);

  async function copyModelName(name?: string) {
    if (!name) return;
    await navigator.clipboard.writeText(name);
    showSuccess("已复制到剪贴板");
  }

  async function openModelPricingEditor(model: ModelItem) {
    const modelName = String(model?.model_name || "").trim();
    if (!modelName) return;
    const optionRes = await apiGet("/api/option");
    if (!optionRes?.success) {
      showError(optionRes?.message || "系统选项加载失败");
      return;
    }
    const optionRows = Array.isArray(optionRes?.data) ? optionRes.data : [];
    const optionValueByKey = new Map<string, string>();
    for (const row of optionRows) optionValueByKey.set(String(row?.key || ""), String(row?.value || ""));
    const maps: Record<string, Record<string, number>> = {};
    for (const key of MODEL_OPTION_KEYS) {
      maps[key] = parseNumberMap(optionValueByKey.get(key));
    }
    setModelOptionMaps(maps);
    setModelPricingEditor({
      modelName,
      quotaType: Number(model?.quota_type || 0),
      input:
        maps.ModelInputUSDPerM?.[modelName] != null
          ? String(maps.ModelInputUSDPerM[modelName])
          : Number(model?.input_price || 0) > 0 && Number(model?.quota_type || 0) === 0
            ? String(model?.input_price)
            : "",
      output:
        maps.ModelOutputUSDPerM?.[modelName] != null
          ? String(maps.ModelOutputUSDPerM[modelName])
          : Number(model?.output_price || 0) > 0
            ? String(model?.output_price)
            : "",
      cacheRead:
        maps.ModelCacheReadUSDPerM?.[modelName] != null
          ? String(maps.ModelCacheReadUSDPerM[modelName])
          : Number(model?.cache_read_price || 0) > 0
            ? String(model?.cache_read_price)
            : "",
      perCall:
        maps.ModelPerCallUSD?.[modelName] != null
          ? String(maps.ModelPerCallUSD[modelName])
          : Number(model?.input_price || 0) > 0 && Number(model?.quota_type || 0) === 1
            ? String(model?.input_price)
            : "",
      premium:
        maps.ModelPremiumRatio?.[modelName] != null
          ? String(maps.ModelPremiumRatio[modelName])
          : Number(model?.premium_ratio || 0) > 0
            ? String(model?.premium_ratio)
            : "",
    });
    setShowModelPricingEditor(true);
  }

  async function saveModelPricingEditor() {
    const name = modelPricingEditor.modelName;
    if (!name) return;
    const nextMaps = { ...modelOptionMaps };
    const assign = (key: typeof MODEL_OPTION_KEYS[number], raw: string) => {
      const map = { ...(nextMaps[key] || {}) };
      const text = raw.trim();
      if (!text) {
        delete map[name];
      } else {
        const n = Number(text);
        if (!Number.isFinite(n)) throw new Error(`${key} 请输入有效数字`);
        map[name] = n;
      }
      nextMaps[key] = map;
    };
    try {
      assign("ModelInputUSDPerM", modelPricingEditor.input);
      assign("ModelOutputUSDPerM", modelPricingEditor.output);
      assign("ModelCacheReadUSDPerM", modelPricingEditor.cacheRead);
      assign("ModelPerCallUSD", modelPricingEditor.perCall);
      assign("ModelPremiumRatio", modelPricingEditor.premium);
    } catch (error) {
      showError((error as Error).message);
      return;
    }
    setModelPricingSaving(true);
    try {
      for (const key of MODEL_OPTION_KEYS) {
        const res = await apiPut("/api/option", {
          key,
          value: stringifyMap(nextMaps[key] || {}),
        });
        if (!res?.success) {
          showError(res?.message || `${key} 保存失败`);
          return;
        }
      }
      setModelOptionMaps(nextMaps);
      setShowModelPricingEditor(false);
      showSuccess("模型定价保存成功");
    } finally {
      setModelPricingSaving(false);
    }
  }

  function resetModelPricingEditorForm() {
    setModelPricingEditor((prev) => ({
      ...prev,
      input: "",
      output: "",
      cacheRead: "",
      perCall: "",
      premium: "1",
    }));
  }

  function onVendorIconError(event: SyntheticEvent<HTMLImageElement>, model: ModelItem) {
    const image = event.currentTarget;
    const fallback = resolveVendorIcon("", model.vendor_name, model.model_name);
    if (!fallback || image.src.endsWith(fallback)) return;
    image.src = fallback;
  }

  return (
    <div className="page-wrap flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-7xl flex-1 flex-col overflow-hidden px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-6">
      <section className="panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="panel-body flex min-h-0 flex-1 flex-col">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as ModelsTab)}
            className="min-h-0 flex-1"
          >
            <TabsList variant="line" className="w-fit p-0">
              <TabsTrigger value="recommended" className="px-3">
                模型推荐
              </TabsTrigger>
              <TabsTrigger value="all" className="px-3">
                全量模型定价
              </TabsTrigger>
            </TabsList>

            <TabsContent value="recommended" className="mt-3 min-h-0 flex-1">
              <div className="table-wrap min-h-0 flex-1">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="sticky top-0 z-20 bg-background">模型</th>
                      <th className="sticky top-0 z-20 bg-background">供应商</th>
                      <th className="sticky top-0 z-20 bg-background">API 风格</th>
                      <th className="sticky top-0 z-20 bg-background text-right">上下文窗口</th>
                      <th className="sticky top-0 z-20 bg-background text-right">输出上限</th>
                      <th className="sticky top-0 z-20 bg-background text-right">输入价格</th>
                      <th className="sticky top-0 z-20 bg-background text-right">输出价格</th>
                      <th className="sticky top-0 z-20 bg-background text-right">缓存命中</th>
                      <th className="sticky top-0 z-20 bg-background">说明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {curatedModels.map((model) => (
                      <tr key={`${model.provider}-${model.model}`}>
                        <td>
                          <button
                            type="button"
                            className="text-left text-foreground hover:underline"
                            onClick={() => void copyModelName(model.model)}
                          >
                            {model.model}
                          </button>
                        </td>
                        <td>{model.provider}</td>
                        <td>{model.apiStyle}</td>
                        <td className={PRICE_ALIGN_CLASS}>{formatInteger(model.contextWindow)}</td>
                        <td className={PRICE_ALIGN_CLASS}>{formatInteger(model.maxOutputTokens)}</td>
                        <td className={PRICE_ALIGN_CLASS}>{formatPricePerM(model.inputUsdPerM)}</td>
                        <td className={PRICE_ALIGN_CLASS}>{formatPricePerM(model.outputUsdPerM)}</td>
                        <td className={PRICE_ALIGN_CLASS}>{formatPricePerM(model.cacheReadUsdPerM)}</td>
                        <td>{model.notes || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="all" className="mt-3 min-h-0 flex-1 flex-col">
              <input
                className={formInputClass}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索模型/描述/标签"
              />
              {loading ? <p className="mt-3 text-sm text-zinc-500">加载中...</p> : null}
              {!loading && filtered.length === 0 ? <p className="mt-3 text-sm text-zinc-500">暂无数据</p> : null}
              {!loading && filtered.length > 0 ? (
                <div className="table-wrap mt-3 min-h-0 flex-1">
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="sticky top-0 z-20 bg-background">
                          <button type="button" className="flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground" onClick={() => toggleSort("model_name")}>
                            模型
                            <span className="text-xs opacity-70">{sortIndicator("model_name")}</span>
                          </button>
                        </th>
                        <th className="sticky top-0 z-20 bg-background">
                          <button type="button" className="flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground" onClick={() => toggleSort("vendor_name")}>
                            供应商
                            <span className="text-xs opacity-70">{sortIndicator("vendor_name")}</span>
                          </button>
                        </th>
                        <th className="sticky top-0 z-20 bg-background">
                          <button type="button" className="flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground" onClick={() => toggleSort("reasoning")}>
                            推理能力
                            <span className="text-xs opacity-70">{sortIndicator("reasoning")}</span>
                          </button>
                        </th>
                        <th className="sticky top-0 z-20 bg-background" title="在成本与分组倍率之上的模型溢价，默认 1">
                          <button type="button" className="flex cursor-pointer items-center gap-1 transition-colors hover:text-foreground" onClick={() => toggleSort("premium_ratio")}>
                            溢价
                            <span className="text-xs opacity-70">{sortIndicator("premium_ratio")}</span>
                          </button>
                        </th>
                        <th className="sticky top-0 z-20 bg-background text-right">
                          <button type="button" className="ml-auto flex cursor-pointer items-center justify-end gap-1 transition-colors hover:text-foreground" onClick={() => toggleSort("input_price")}>
                            输入价格
                            <span className="text-xs opacity-70">{sortIndicator("input_price")}</span>
                          </button>
                        </th>
                        <th className="sticky top-0 z-20 bg-background text-right">
                          <button type="button" className="ml-auto flex cursor-pointer items-center justify-end gap-1 transition-colors hover:text-foreground" onClick={() => toggleSort("output_price")}>
                            输出价格
                            <span className="text-xs opacity-70">{sortIndicator("output_price")}</span>
                          </button>
                        </th>
                        <th className="sticky top-0 z-20 bg-background text-right">
                          <button type="button" className="ml-auto flex cursor-pointer items-center justify-end gap-1 transition-colors hover:text-foreground" onClick={() => toggleSort("cache_read_price")}>
                            缓存命中
                            <span className="text-xs opacity-70">{sortIndicator("cache_read_price")}</span>
                          </button>
                        </th>
                        <th className="sticky top-0 z-20 bg-background text-right">
                          <button type="button" className="ml-auto flex cursor-pointer items-center justify-end gap-1 transition-colors hover:text-foreground" onClick={() => toggleSort("per_call_price")}>
                            单次价格
                            <span className="text-xs opacity-70">{sortIndicator("per_call_price")}</span>
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((model, idx) => (
                        <tr
                          key={`${model.model_name || "model"}-${idx}`}
                          onContextMenu={(event) => {
                            if (!isAdmin) return;
                            event.preventDefault();
                            setContextMenu({
                              x: event.clientX,
                              y: event.clientY,
                              model,
                            });
                          }}
                        >
                          <td>
                            <button type="button" className="text-left text-foreground hover:underline" onClick={() => void copyModelName(model.model_name)}>
                              {model.model_name || "-"}
                            </button>
                          </td>
                          <td>
                            {model.vendor_name ? (
                              <div className="flex items-center gap-2">
                                {resolveVendorIcon(model.vendor_icon, model.vendor_name, model.model_name) ? (
                                  <img
                                    src={resolveVendorIcon(model.vendor_icon, model.vendor_name, model.model_name)}
                                    alt={model.vendor_name}
                                    className="h-4 w-4 rounded-sm dark:invert"
                                    onError={(event) => onVendorIconError(event, model)}
                                  />
                                ) : null}
                                <span>{model.vendor_name}</span>
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td>
                            {(() => {
                              const capability = getReasoningCapability(model);
                              if (capability.state === "supported") {
                                return (
                                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                    支持
                                  </span>
                                );
                              }
                              if (capability.state === "unsupported") {
                                return (
                                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                                    不支持
                                  </span>
                                );
                              }
                              return <span className="text-sm text-zinc-500">-</span>;
                            })()}
                          </td>
                          <td>{typeof model.premium_ratio === "number" ? model.premium_ratio.toFixed(3) : "-"}</td>
                          <td className={PRICE_ALIGN_CLASS}>{fmtPrice(model.input_price)}</td>
                          <td className={PRICE_ALIGN_CLASS}>{fmtPrice(model.output_price)}</td>
                          <td className={PRICE_ALIGN_CLASS}>{model.quota_type === 0 ? fmtPrice(model.cache_read_price) : "-"}</td>
                          <td className={PRICE_ALIGN_CLASS}>{model.quota_type === 1 ? fmtPrice(model.input_price) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </TabsContent>
          </Tabs>
        </div>
      </section>
      </div>
      {contextMenu && isAdmin ? (
        <div
          className="fixed z-50 min-w-36 rounded-md border border-border bg-popover p-1 shadow-md"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            type="button"
            className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
            onClick={() => {
              setContextMenu(null);
              void openModelPricingEditor(contextMenu.model);
            }}
          >
            编辑定价
          </button>
        </div>
      ) : null}

      <Dialog open={showModelPricingEditor} onOpenChange={setShowModelPricingEditor}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>编辑模型定价</DialogTitle>
            <DialogDescription>
              <span className="font-mono">{modelPricingEditor.modelName}</span>。按次价 {">"} 0 时优先；留空则按量计价。溢价默认 1。
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[calc(90vh-11rem)] grid-cols-1 gap-3 overflow-y-auto py-1 pr-1 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="block text-xs font-medium text-zinc-600">输入 USD/M</Label>
              <Input className="h-9 font-mono tabular-nums" value={modelPricingEditor.input} onChange={(event) => setModelPricingEditor((prev) => ({ ...prev, input: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="block text-xs font-medium text-zinc-600">输出 USD/M</Label>
              <Input className="h-9 font-mono tabular-nums" value={modelPricingEditor.output} onChange={(event) => setModelPricingEditor((prev) => ({ ...prev, output: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="block text-xs font-medium text-zinc-600">缓存 USD/M</Label>
              <Input className="h-9 font-mono tabular-nums" value={modelPricingEditor.cacheRead} onChange={(event) => setModelPricingEditor((prev) => ({ ...prev, cacheRead: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="block text-xs font-medium text-zinc-600">按次 USD</Label>
              <Input className="h-9 font-mono tabular-nums" value={modelPricingEditor.perCall} onChange={(event) => setModelPricingEditor((prev) => ({ ...prev, perCall: event.target.value }))} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="block text-xs font-medium text-zinc-600">模型溢价倍率</Label>
              <Input className="h-9 font-mono tabular-nums" value={modelPricingEditor.premium} onChange={(event) => setModelPricingEditor((prev) => ({ ...prev, premium: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetModelPricingEditorForm} disabled={modelPricingSaving}>
              重置定价
            </Button>
            <Button variant="outline" onClick={() => setShowModelPricingEditor(false)} disabled={modelPricingSaving}>取消</Button>
            <Button onClick={() => void saveModelPricingEditor()} disabled={modelPricingSaving}>
              {modelPricingSaving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
