"use client";

import { type SyntheticEvent, useCallback, useEffect, useMemo, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { useToast } from "@/components/ui/toast-provider";
import { getStoredUser } from "@/lib/auth";
import { resolveVendorIcon } from "@/lib/vendor-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MODEL_OPTION_KEYS = [
  "ModelInputUSDPerM",
  "ModelOutputUSDPerM",
  "ModelCacheReadUSDPerM",
  "ModelPerCallUSD",
  "ModelPremiumRatio",
] as const;

const CHANNEL_TYPE_LABEL: Record<number, string> = {
  0: "未知",
  1: "OpenAI",
  2: "Midjourney",
  3: "Azure",
  4: "Ollama",
  5: "MidjourneyPlus",
  6: "OpenAIMax",
  7: "OhMyGPT",
  8: "Custom",
  9: "AILS",
  10: "AIProxy",
  11: "PaLM",
  12: "API2GPT",
  13: "AIGC2D",
  14: "Anthropic",
  15: "Baidu",
  16: "Zhipu",
  17: "Ali",
  18: "Xunfei",
  19: "360",
  20: "OpenRouter",
  21: "AIProxyLibrary",
  22: "FastGPT",
  23: "Tencent",
  24: "Gemini",
  25: "Moonshot",
  26: "ZhipuV4",
  27: "Perplexity",
  31: "LingYiWanWu",
  33: "AWS",
  34: "Cohere",
  35: "MiniMax",
  36: "SunoAPI",
  37: "Dify",
  38: "Jina",
  39: "Cloudflare",
  40: "SiliconFlow",
  41: "VertexAI",
  42: "Mistral",
  43: "DeepSeek",
  44: "MokaAI",
  45: "VolcEngine",
  46: "BaiduV2",
  47: "Xinference",
  48: "xAI",
  49: "Coze",
  50: "Kling",
  51: "Jimeng",
  52: "Vidu",
  53: "Submodel",
  54: "DoubaoVideo",
  55: "Sora",
  56: "Replicate",
  57: "Codex",
  58: "Tavily",
  59: "Brave",
};

const DISABLED_CHANNEL_TYPES = new Set<number>([
  34, // Cohere: backend adaptor removed
]);

const CHANNEL_STATUS_OPTIONS = [
  { v: "1", label: "启用" },
  { v: "2", label: "已禁用（手动）" },
  { v: "3", label: "已禁用（自动）" },
] as const;

type TabKey =
  | "channel"
  | "redemption"
  | "user"
  | "setting"
  | "log"
  | "midjourney"
  | "model_pricing"
  | "topup_setting";

const PAGE_SIZE_BY_TAB: Partial<Record<TabKey, number>> = {
  channel: 50,
  redemption: 50,
  user: 50,
  log: 40,
  midjourney: 40,
};

type ChannelEditorState = {
  id: number | null;
  name: string;
  type: string;
  status: string;
  key: string;
  baseUrl: string;
  models: string;
  group: string;
  priority: string;
  vertexRegion: string;
  vertexKeyType: "api_key" | "json";
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

type RedemptionEditorState = {
  id: number | null;
  name: string;
  quota: string;
  count: string;
  expiredAt: string;
  status: string;
};

type UserEditorState = {
  username: string;
  password: string;
  displayName: string;
  role: string;
};

function fmtTime(ts: number) {
  if (!ts) return "-";
  const ms = ts < 1e12 ? ts * 1000 : ts;
  return new Date(ms).toLocaleString();
}

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

function fmtUsd(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return "—";
  return `$${n.toFixed(3)}`;
}

function fmtPremium(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(3);
}

function inferVendorNameFromModelName(modelName: unknown) {
  const raw = String(modelName || "").trim();
  if (!raw) return "";
  const idx = raw.indexOf("/");
  if (idx <= 0) return "";
  return raw.slice(0, idx);
}

function channelTypeParts(type: unknown) {
  if (type === null || type === undefined || type === "") {
    return { name: "—", code: null as number | null };
  }
  const n = Number(type);
  if (!Number.isFinite(n)) {
    return { name: String(type), code: null as number | null };
  }
  return { name: CHANNEL_TYPE_LABEL[n] ?? "未知类型", code: n };
}

function channelStatusLabel(status: unknown) {
  const n = Number(status);
  if (n === 1) return "启用";
  if (n === 2) return "已禁用（手动）";
  if (n === 3) return "已禁用（自动）";
  if (!Number.isFinite(n)) return String(status || "—");
  return `状态 ${n}`;
}

function userStatusLabel(status: unknown) {
  const n = Number(status);
  if (n === 1) return "启用";
  if (n === 2) return "禁用";
  if (!Number.isFinite(n)) return String(status || "—");
  return `状态 ${n}`;
}

function toDatetimeLocal(ts: unknown) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return "";
  const ms = n < 1e12 ? n * 1000 : n;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toUnixSeconds(localValue: string) {
  const text = localValue.trim();
  if (!text) return 0;
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return Number.NaN;
  return Math.floor(ms / 1000);
}

export default function AdminPage() {
  const { showError, showSuccess } = useToast();
  const [adminTab, setAdminTab] = useState<TabKey>("channel");
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Record<string, any>>({});

  const [showDeleteChannel, setShowDeleteChannel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);

  const [showRedemptionEditor, setShowRedemptionEditor] = useState(false);
  const [redemptionSaving, setRedemptionSaving] = useState(false);
  const [redemptionEditor, setRedemptionEditor] = useState<RedemptionEditorState>({
    id: null,
    name: "",
    quota: "",
    count: "1",
    expiredAt: "",
    status: "1",
  });

  const [showUserEditor, setShowUserEditor] = useState(false);
  const [userSaving, setUserSaving] = useState(false);
  const [userEditor, setUserEditor] = useState<UserEditorState>({
    username: "",
    password: "",
    displayName: "",
    role: "1",
  });

  const [showChannelEditor, setShowChannelEditor] = useState(false);
  const [channelSaving, setChannelSaving] = useState(false);
  const [channelFetchingModels, setChannelFetchingModels] = useState(false);
  const [channelEditorDetail, setChannelEditorDetail] = useState<Record<string, any> | null>(null);
  const [channelEditor, setChannelEditor] = useState<ChannelEditorState>({
    id: null,
    name: "",
    type: "1",
    status: "1",
    key: "",
    baseUrl: "",
    models: "",
    group: "default",
    priority: "",
    vertexRegion: "global",
    vertexKeyType: "api_key",
  });

  const [modelPricingRows, setModelPricingRows] = useState<any[]>([]);
  const [modelPricingSearch, setModelPricingSearch] = useState("");
  const [modelOptionMaps, setModelOptionMaps] = useState<Record<string, Record<string, number>>>({});
  const [showModelPricingEditor, setShowModelPricingEditor] = useState(false);
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
  const [modelPricingResetting, setModelPricingResetting] = useState(false);

  const [topupLoading, setTopupLoading] = useState(false);
  const [topupSaving, setTopupSaving] = useState(false);
  const [topupForm, setTopupForm] = useState({
    MinTopUp: "",
    InviterTopupRewardRatio: "",
    PayAddress: "",
    CustomCallbackAddress: "",
    EpayId: "",
    EpayKey: "",
  });
  const [topupSnapshot, setTopupSnapshot] = useState({
    MinTopUp: "",
    InviterTopupRewardRatio: "",
    PayAddress: "",
    CustomCallbackAddress: "",
    EpayId: "",
    EpayKey: "",
  });

  const [showLogDetail, setShowLogDetail] = useState(false);
  const [logDetailLoading, setLogDetailLoading] = useState(false);
  const [logDetailRid, setLogDetailRid] = useState("");
  const [logDetailBody, setLogDetailBody] = useState("");

  const tabs = useMemo(() => {
    const role = Number(getStoredUser()?.role ?? -1);
    const isRoot = role >= 100;
    const enableDrawing = !!status?.enable_drawing;
    const base: { id: TabKey; label: string; rootOnly?: boolean; drawingOnly?: boolean }[] = [
      { id: "channel", label: "渠道管理" },
      { id: "redemption", label: "兑换码管理" },
      { id: "user", label: "用户管理" },
      { id: "setting", label: "系统设置", rootOnly: true },
      { id: "topup_setting", label: "充值设置", rootOnly: true },
      { id: "log", label: "使用日志" },
      { id: "midjourney", label: "绘图日志", drawingOnly: true },
    ];
    return base.filter((tab) => {
      if (tab.rootOnly && !isRoot) return false;
      if (tab.drawingOnly && !enableDrawing) return false;
      return true;
    });
  }, [status]);

  const channelTypeOptions = useMemo(() => {
    return Object.entries(CHANNEL_TYPE_LABEL)
      .map(([k, label]) => {
        const v = Number(k);
        let text = label;
        if (v === 3) text = "Azure OpenAI";
        if (v === 14) text = "Anthropic (Claude)";
        if (v === 33) text = "AWS Bedrock";
        return { value: String(v), label: text };
      })
      .filter((item) => Number(item.value) > 0 && !DISABLED_CHANNEL_TYPES.has(Number(item.value)))
      .sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  }, []);
  const selectedChannelTypeLabel = useMemo(() => {
    const fallback = channelTypeParts(channelEditor.type);
    const matched = channelTypeOptions.find((item) => item.value === channelEditor.type);
    if (matched) return `${matched.label} (${matched.value})`;
    if (fallback.code != null) return `${fallback.name} (${fallback.code})`;
    return fallback.name;
  }, [channelEditor.type, channelTypeOptions]);

  const isVertexType = Number(channelEditor.type) === 41;
  const isOpenRouterType = Number(channelEditor.type) === 20;
  const canCreateAdminUser = Number(getStoredUser()?.role ?? 0) >= 100;
  const quotaPerUnit = useMemo(() => {
    const n = Number(status?.quota_per_unit);
    return Number.isFinite(n) && n > 0 ? n : 500000;
  }, [status]);
  const pageSize = PAGE_SIZE_BY_TAB[adminTab] ?? 0;
  const canPaginate = pageSize > 0;
  const totalPages = useMemo(() => {
    if (!canPaginate) return 1;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [canPaginate, pageSize, total]);

  const filteredModelPricingRows = useMemo(() => {
    if (!modelPricingSearch.trim()) return modelPricingRows;
    const key = modelPricingSearch.trim().toLowerCase();
    return modelPricingRows.filter((row: any) => {
      const model = String(row?.model_name || "").toLowerCase();
      const desc = String(row?.description || "").toLowerCase();
      const tags = String(row?.tags || "").toLowerCase();
      const vendor = String(row?.vendor_name || "").toLowerCase();
      return model.includes(key) || desc.includes(key) || tags.includes(key) || vendor.includes(key);
    });
  }, [modelPricingRows, modelPricingSearch]);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const res = await apiGet("/api/status");
        if (res?.success && res.data) {
          setStatus(res.data);
          localStorage.setItem("status", JSON.stringify(res.data));
        }
      } catch {
        // ignore status refresh failure
      }
    };
    void loadStatus();
  }, []);

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === adminTab) && tabs[0]) {
      setAdminTab(tabs[0].id);
    }
  }, [tabs, adminTab]);

  const loadGeneralTabData = useCallback(async (tab: TabKey, page = 1) => {
    setLoading(true);
    try {
      let res: any = null;
      if (tab === "channel") res = await apiGet(`/api/channel?p=${page}&page_size=50`);
      if (tab === "redemption") res = await apiGet(`/api/redemption?p=${page}&page_size=50`);
      if (tab === "user") res = await apiGet(`/api/user?p=${page}&page_size=50`);
      if (tab === "setting") res = await apiGet("/api/option");
      if (tab === "log") res = await apiGet(`/api/log?p=${page}&page_size=40`);
      if (tab === "midjourney") res = await apiGet(`/api/mj?p=${page}&page_size=40`);
      if (!res?.success) {
        showError(res?.message || "加载失败");
        setRows([]);
        setTotal(0);
        return;
      }
      const data = res.data;
      if (Array.isArray(data)) {
        setRows(data);
        setTotal(data.length);
      } else {
        const items = Array.isArray(data?.items) ? data.items : [];
        setRows(items);
        setTotal(Number(data?.total ?? items.length));
      }
    } catch {
      showError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const loadModelPricing = useCallback(async () => {
    setLoading(true);
    try {
      const [pricingRes, optionRes] = await Promise.all([apiGet("/api/pricing"), apiGet("/api/option")]);
      if (!pricingRes?.success) {
        showError(pricingRes?.message || "模型定价加载失败");
        setModelPricingRows([]);
        return;
      }
      if (!optionRes?.success) {
        showError(optionRes?.message || "系统选项加载失败");
        setModelPricingRows([]);
        return;
      }
      const pricingRows = Array.isArray(pricingRes?.data) ? pricingRes.data : [];
      const vendorMap: Record<string, any> = {};
      if (Array.isArray(pricingRes?.vendors)) {
        for (const vendor of pricingRes.vendors) {
          vendorMap[String(vendor?.id ?? "")] = vendor;
        }
      }
      const hydratedPricingRows = pricingRows.map((row: any) => {
        const vendor = vendorMap[String(row?.vendor_id ?? "")];
        return {
          ...row,
          vendor_name: String(row?.vendor_name || vendor?.name || inferVendorNameFromModelName(row?.model_name) || ""),
          vendor_icon: String(row?.vendor_icon || vendor?.icon || ""),
        };
      });
      setModelPricingRows(hydratedPricingRows);
      setTotal(pricingRows.length);
      const optionRows = Array.isArray(optionRes?.data) ? optionRes.data : [];
      const optionValueByKey = new Map<string, string>();
      for (const row of optionRows) optionValueByKey.set(String(row?.key || ""), String(row?.value || ""));
      const maps: Record<string, Record<string, number>> = {};
      for (const key of MODEL_OPTION_KEYS) {
        maps[key] = parseNumberMap(optionValueByKey.get(key));
      }
      setModelOptionMaps(maps);
    } catch {
      showError("网络错误，无法加载模型定价");
      setModelPricingRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  const loadTopupSettings = useCallback(async () => {
    setTopupLoading(true);
    setLoading(true);
    try {
      const res = await apiGet("/api/option");
      if (!res?.success) {
        showError(res?.message || "充值设置加载失败");
        return;
      }
      const optionRows = Array.isArray(res?.data) ? res.data : [];
      const pick = (key: string) => String(optionRows.find((row: any) => row?.key === key)?.value || "");
      const next = {
        MinTopUp: pick("MinTopUp"),
        InviterTopupRewardRatio: pick("InviterTopupRewardRatio"),
        PayAddress: pick("PayAddress"),
        CustomCallbackAddress: pick("CustomCallbackAddress"),
        EpayId: pick("EpayId"),
        EpayKey: "",
      };
      setTopupForm(next);
      setTopupSnapshot(next);
      setRows([]);
      setTotal(1);
    } catch {
      showError("网络错误，无法加载充值设置");
    } finally {
      setTopupLoading(false);
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    setCurrentPage(1);
  }, [adminTab]);

  useEffect(() => {
    if (adminTab === "model_pricing") {
      void loadModelPricing();
      return;
    }
    if (adminTab === "topup_setting") {
      void loadTopupSettings();
      return;
    }
    const page = PAGE_SIZE_BY_TAB[adminTab] ? currentPage : 1;
    void loadGeneralTabData(adminTab, page);
  }, [adminTab, currentPage, loadGeneralTabData, loadModelPricing, loadTopupSettings]);

  useEffect(() => {
    if (!canPaginate) return;
    if (currentPage <= totalPages) return;
    setCurrentPage(totalPages);
  }, [canPaginate, currentPage, totalPages]);

  function roleLabel(role: unknown) {
    const r = Number(role);
    if (r >= 100) return "超级管理员";
    if (r >= 10) return "管理员";
    return "用户";
  }

  function trunc(text: unknown, size = 80) {
    const value = String(text || "");
    if (!value) return "—";
    return value.length > size ? `${value.slice(0, size)}…` : value;
  }

  function askDeleteChannel(row: any) {
    if (!row?.id) return;
    setDeleteTarget({
      id: Number(row.id),
      name: String(row.name || "").trim() || `#${String(row.id)}`,
    });
    setShowDeleteChannel(true);
  }

  async function removeChannel() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await apiDelete(`/api/channel/${deleteTarget.id}`);
    setDeleting(false);
    if (!res?.success) {
      showError(res?.message || "删除失败");
      return;
    }
    showSuccess("渠道已删除");
    setRows((prev) => prev.filter((row: any) => row.id !== deleteTarget.id));
    setShowDeleteChannel(false);
    setDeleteTarget(null);
  }

  function openCreateChannel() {
    setChannelEditorDetail(null);
    setChannelEditor({
      id: null,
      name: "",
      type: "1",
      status: "1",
      key: "",
      baseUrl: "",
      models: "",
      group: "default",
      priority: "",
      vertexRegion: "global",
      vertexKeyType: "api_key",
    });
    setShowChannelEditor(true);
  }

  async function openEditChannel(row: any) {
    const id = Number(row?.id);
    if (!Number.isFinite(id)) return;
    const detailRes = await apiGet(`/api/channel/${id}`);
    if (!detailRes?.success || !detailRes.data) {
      showError(detailRes?.message || "加载渠道失败");
      return;
    }
    const ch = detailRes.data;
    let vertexRegion = "global";
    const rawOther = String(ch.other ?? "").trim();
    if (rawOther) {
      if (rawOther.startsWith("{")) {
        try {
          const parsed = JSON.parse(rawOther);
          if (parsed?.default) vertexRegion = String(parsed.default);
        } catch {
          vertexRegion = "global";
        }
      } else {
        vertexRegion = rawOther;
      }
    }
    let vertexKeyType: "api_key" | "json" = "api_key";
    try {
      const rawSettings = ch.settings;
      const parsed = typeof rawSettings === "string" ? JSON.parse(rawSettings) : rawSettings;
      if (parsed?.vertex_key_type === "json") vertexKeyType = "json";
    } catch {
      // keep default
    }
    setChannelEditorDetail(ch);
    setChannelEditor({
      id,
      name: String(ch.name || ""),
      type: String(ch.type ?? 1),
      status: String(ch.status ?? 1),
      key: "",
      baseUrl: String(ch.base_url || ""),
      models: String(ch.models || "").split(",").join("\n"),
      group: String(ch.group || "default"),
      priority: ch.priority == null ? "" : String(ch.priority),
      vertexRegion,
      vertexKeyType,
    });
    setShowChannelEditor(true);
  }

  async function submitChannelEditor() {
    const type = Number(channelEditor.type);
    if (!channelEditor.name.trim()) {
      showError("请输入渠道名称");
      return;
    }
    if (!Number.isFinite(type)) {
      showError("渠道类型无效");
      return;
    }
    if (DISABLED_CHANNEL_TYPES.has(type)) {
      showError("该渠道类型已禁用，请选择其他渠道类型");
      return;
    }
    const models = channelEditor.models
      .split(/[\n,]+/)
      .map((part) => part.trim())
      .filter(Boolean)
      .join(",");
    setChannelSaving(true);
    try {
      if (channelEditor.id == null) {
        if (!channelEditor.key.trim()) {
          showError("添加渠道时必须填写 API Key");
          return;
        }
        const payload: Record<string, unknown> = {
          name: channelEditor.name.trim(),
          type,
          key: channelEditor.key.trim(),
          models,
          group: channelEditor.group.trim() || "default",
          status: 1,
        };
        if (channelEditor.baseUrl.trim()) payload.base_url = channelEditor.baseUrl.trim();
        if (channelEditor.priority.trim()) {
          const p = Number(channelEditor.priority);
          if (Number.isFinite(p)) payload.priority = p;
        }
        if (type === 41) {
          payload.other = JSON.stringify({ default: channelEditor.vertexRegion.trim() || "global" });
          payload.settings = JSON.stringify({ vertex_key_type: channelEditor.vertexKeyType });
        }
        const res = await apiPost("/api/channel", { mode: "single", channel: payload });
        if (!res?.success) {
          showError(res?.message || "添加渠道失败");
          return;
        }
        showSuccess("渠道添加成功");
      } else {
        const origin = channelEditorDetail || rows.find((row: any) => Number(row.id) === channelEditor.id) || {};
        const payload: Record<string, unknown> = {
          ...origin,
          id: channelEditor.id,
          name: channelEditor.name.trim(),
          type,
          status: Number(channelEditor.status || "1"),
          models,
          group: channelEditor.group.trim() || "default",
          base_url: channelEditor.baseUrl.trim() || null,
          priority: channelEditor.priority.trim() ? Number(channelEditor.priority) : origin.priority,
        };
        if (channelEditor.key.trim()) payload.key = channelEditor.key.trim();
        if (type === 41) {
          payload.other = JSON.stringify({ default: channelEditor.vertexRegion.trim() || "global" });
          payload.settings = JSON.stringify({ vertex_key_type: channelEditor.vertexKeyType });
        }
        const res = await apiPut("/api/channel", payload);
        if (!res?.success) {
          showError(res?.message || "保存渠道失败");
          return;
        }
        showSuccess("渠道保存成功");
      }
      setShowChannelEditor(false);
      void loadGeneralTabData("channel", currentPage);
    } finally {
      setChannelSaving(false);
    }
  }

  async function fetchUpstreamModelsForEdit() {
    if (channelEditor.id == null || channelFetchingModels || channelSaving) return;
    setChannelFetchingModels(true);
    try {
      const res = await apiGet(`/api/channel/fetch_models/${channelEditor.id}`);
      if (!res?.success || !Array.isArray(res?.data)) {
        showError(res?.message || "获取模型失败");
        return;
      }
      const nextModels = res.data
        .map((item: unknown) => String(item || "").trim())
        .filter(Boolean);
      setChannelEditor((prev) => ({ ...prev, models: nextModels.join("\n") }));
      showSuccess(`已获取 ${nextModels.length} 个模型`);
    } catch {
      showError("获取模型失败");
    } finally {
      setChannelFetchingModels(false);
    }
  }

  async function fetchUpstreamModelsForCreate() {
    if (channelEditor.id != null || channelFetchingModels || channelSaving) return;
    const type = Number(channelEditor.type);
    if (!Number.isFinite(type)) {
      showError("渠道类型无效");
      return;
    }
    const key = channelEditor.key.trim();
    if (!key) {
      showError("请先填写 API Key，再获取模型");
      return;
    }
    setChannelFetchingModels(true);
    try {
      const payload: Record<string, unknown> = {
        type,
        key,
      };
      const baseUrl = channelEditor.baseUrl.trim();
      if (baseUrl) payload.base_url = baseUrl;
      const res = await apiPost("/api/channel/fetch_models", payload);
      if (!res?.success || !Array.isArray(res?.data)) {
        showError(res?.message || "获取模型失败");
        return;
      }
      const nextModels = res.data
        .map((item: unknown) => String(item || "").trim())
        .filter(Boolean);
      setChannelEditor((prev) => ({ ...prev, models: nextModels.join("\n") }));
      showSuccess(`已获取 ${nextModels.length} 个模型`);
    } catch {
      showError("获取模型失败");
    } finally {
      setChannelFetchingModels(false);
    }
  }

  function openModelPricingEditor(row: any) {
    const modelName = String(row?.model_name || "");
    if (!modelName) return;
    setModelPricingEditor({
      modelName,
      quotaType: Number(row?.quota_type || 0),
      input:
        modelOptionMaps.ModelInputUSDPerM?.[modelName] != null
          ? String(modelOptionMaps.ModelInputUSDPerM[modelName])
          : Number(row?.input_usd_per_m || 0) > 0
            ? String(row?.input_usd_per_m)
            : "",
      output:
        modelOptionMaps.ModelOutputUSDPerM?.[modelName] != null
          ? String(modelOptionMaps.ModelOutputUSDPerM[modelName])
          : Number(row?.output_usd_per_m || 0) > 0
            ? String(row?.output_usd_per_m)
            : "",
      cacheRead:
        modelOptionMaps.ModelCacheReadUSDPerM?.[modelName] != null
          ? String(modelOptionMaps.ModelCacheReadUSDPerM[modelName])
          : Number(row?.cache_read_usd_per_m || 0) > 0
            ? String(row?.cache_read_usd_per_m)
            : "",
      perCall:
        modelOptionMaps.ModelPerCallUSD?.[modelName] != null
          ? String(modelOptionMaps.ModelPerCallUSD[modelName])
          : Number(row?.per_call_usd || 0) > 0
            ? String(row?.per_call_usd)
            : "",
      premium:
        modelOptionMaps.ModelPremiumRatio?.[modelName] != null
          ? String(modelOptionMaps.ModelPremiumRatio[modelName])
          : Number(row?.premium_ratio || 0) > 0
            ? String(row?.premium_ratio)
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
      void loadModelPricing();
    } finally {
      setModelPricingSaving(false);
    }
  }

  async function resetModelPricing() {
    setModelPricingResetting(true);
    try {
      const res = await apiPost("/api/option/rest_model_ratio", {});
      if (!res?.success) {
        showError(res?.message || "重置模型定价失败");
        return;
      }
      showSuccess("模型定价已重置");
      void loadModelPricing();
    } finally {
      setModelPricingResetting(false);
    }
  }

  async function copyModelName(name: unknown) {
    const text = String(name || "").trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showSuccess("已复制到剪贴板");
    } catch {
      showError("复制失败");
    }
  }

  function onVendorIconError(event: SyntheticEvent<HTMLImageElement>, row: any) {
    const image = event.currentTarget;
    const fallback = resolveVendorIcon("", row?.vendor_name, row?.model_name);
    if (!fallback || image.src.endsWith(fallback)) return;
    image.src = fallback;
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

  async function saveTopupSettings() {
    const changed = Object.keys(topupForm).filter((key) => {
      if (key === "EpayKey") return topupForm.EpayKey.trim() !== "";
      return String((topupForm as any)[key] || "") !== String((topupSnapshot as any)[key] || "");
    });
    const saveKeys = [...changed, "PayMethods"];
    const defaultPayMethods = JSON.stringify([
      { name: "支付宝", color: "rgba(var(--semi-blue-5), 1)", type: "alipay" },
      { name: "微信", color: "rgba(var(--semi-green-5), 1)", type: "wxpay" },
    ]);
    setTopupSaving(true);
    try {
      for (const key of saveKeys) {
        const value = key === "PayMethods" ? defaultPayMethods : String((topupForm as any)[key] || "");
        const res = await apiPut("/api/option", { key, value });
        if (!res?.success) {
          showError(res?.message || `${key} 保存失败`);
          return;
        }
      }
      setTopupSnapshot(topupForm);
      setTopupForm((prev) => ({ ...prev, EpayKey: "" }));
      showSuccess("充值设置保存成功");
    } finally {
      setTopupSaving(false);
    }
  }

  function openCreateUser() {
    setUserEditor({
      username: "",
      password: "",
      displayName: "",
      role: "1",
    });
    setShowUserEditor(true);
  }

  async function saveUserEditor() {
    const username = userEditor.username.trim();
    const password = userEditor.password;
    const displayName = userEditor.displayName.trim();
    const role = Number(userEditor.role || "1");
    if (!username) {
      showError("请输入用户名");
      return;
    }
    if (!password) {
      showError("请输入密码");
      return;
    }
    if (!Number.isFinite(role)) {
      showError("角色无效");
      return;
    }
    setUserSaving(true);
    try {
      const payload: Record<string, unknown> = {
        username,
        password,
        role,
      };
      if (displayName) payload.display_name = displayName;
      const res = await apiPost("/api/user", payload);
      if (!res?.success) {
        showError(res?.message || "创建用户失败");
        return;
      }
      showSuccess("用户创建成功");
      setShowUserEditor(false);
      void loadGeneralTabData("user", currentPage);
    } finally {
      setUserSaving(false);
    }
  }

  async function openLogDetail(row: any) {
    const requestId = String(row?.request_id || "");
    if (!requestId) {
      showError("该日志无 request_id");
      return;
    }
    setLogDetailRid(requestId);
    setShowLogDetail(true);
    setLogDetailLoading(true);
    setLogDetailBody("");
    try {
      const q = encodeURIComponent(requestId);
      const bodyRes = await apiGet(`/api/log/conversation/body?request_id=${q}`);
      if (bodyRes?.success && bodyRes?.data?.body) {
        try {
          const parsed = JSON.parse(String(bodyRes.data.body));
          setLogDetailBody(JSON.stringify(parsed, null, 2));
        } catch {
          setLogDetailBody(String(bodyRes.data.body));
        }
        return;
      }
      const convRes = await apiGet(`/api/log/conversation?request_id=${q}`);
      if (convRes?.success && convRes.data) {
        setLogDetailBody(JSON.stringify(convRes.data, null, 2));
      } else {
        setLogDetailBody("暂无对话详情");
      }
    } finally {
      setLogDetailLoading(false);
    }
  }

  function redemptionStatusLabel(row: any) {
    const status = Number(row?.status);
    const expiredTime = Number(row?.expired_time || 0);
    const now = Math.floor(Date.now() / 1000);
    if (status === 1 && expiredTime > 0 && expiredTime < now) return "已过期";
    if (status === 1) return "可用";
    if (status === 2) return "禁用";
    if (status === 3) return "已使用";
    if (!Number.isFinite(status)) return String(row?.status || "—");
    return `状态 ${status}`;
  }

  function openCreateRedemption() {
    setRedemptionEditor({
      id: null,
      name: "",
      quota: "",
      count: "1",
      expiredAt: "",
      status: "1",
    });
    setShowRedemptionEditor(true);
  }

  function openEditRedemption(row: any) {
    setRedemptionEditor({
      id: Number(row?.id) || null,
      name: String(row?.name || ""),
      quota: row?.quota == null ? "" : String(row?.quota),
      count: "1",
      expiredAt: toDatetimeLocal(row?.expired_time),
      status: row?.status == null ? "1" : String(row.status),
    });
    setShowRedemptionEditor(true);
  }

  async function removeRedemption(row: any) {
    const id = Number(row?.id);
    if (!Number.isFinite(id)) return;
    if (!window.confirm(`确定删除兑换码 #${id} 吗？`)) return;
    const res = await apiDelete(`/api/redemption/${id}`);
    if (!res?.success) {
      showError(res?.message || "删除兑换码失败");
      return;
    }
    showSuccess("兑换码已删除");
    void loadGeneralTabData("redemption", currentPage);
  }

  async function saveRedemptionEditor() {
    const name = redemptionEditor.name.trim();
    const quota = Number(redemptionEditor.quota.trim());
    const count = Number(redemptionEditor.count.trim() || "1");
    if (!name) {
      showError("请输入兑换码名称");
      return;
    }
    if (!Number.isFinite(quota) || quota <= 0) {
      showError("请输入有效额度（大于 0）");
      return;
    }
    if (redemptionEditor.id == null && (!Number.isFinite(count) || count <= 0)) {
      showError("请输入有效数量（大于 0）");
      return;
    }
    const expiredTime = toUnixSeconds(redemptionEditor.expiredAt);
    if (Number.isNaN(expiredTime)) {
      showError("过期时间格式不正确");
      return;
    }
    setRedemptionSaving(true);
    try {
      if (redemptionEditor.id == null) {
        const res = await apiPost("/api/redemption", {
          name,
          quota: Math.floor(quota),
          count: Math.floor(count),
          expired_time: expiredTime,
        });
        if (!res?.success) {
          showError(res?.message || "创建兑换码失败");
          return;
        }
        const createdCount = Array.isArray(res?.data) ? res.data.length : Math.floor(count);
        showSuccess(`已创建 ${createdCount} 个兑换码`);
      } else {
        const res = await apiPut("/api/redemption", {
          id: redemptionEditor.id,
          name,
          quota: Math.floor(quota),
          expired_time: expiredTime,
          status: Number(redemptionEditor.status || "1"),
        });
        if (!res?.success) {
          showError(res?.message || "保存兑换码失败");
          return;
        }
        showSuccess("兑换码已更新");
      }
      setShowRedemptionEditor(false);
      void loadGeneralTabData("redemption", currentPage);
    } finally {
      setRedemptionSaving(false);
    }
  }

  return (
    <div className="admin-console-root page-wrap">
      <section className="admin-console-card panel relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:before:absolute md:before:inset-y-0 md:before:left-56 md:before:w-px md:before:bg-border md:before:content-['']">
        <div className="panel-body flex min-h-0 flex-1 flex-col overflow-hidden !p-0 md:flex-row">
          <aside className="min-h-0 border-b border-border bg-card md:w-56 md:flex-none md:border-b-0">
            <div className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">管理导航</div>
            <nav className="h-[calc(100%-2.5rem)] overflow-auto pb-2">
              {tabs.map((tab) => {
                const isActive = tab.id === adminTab;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setAdminTab(tab.id)}
                    className={`block w-full border-l-2 px-4 py-2 text-left text-sm transition-colors ${
                      isActive
                        ? "border-zinc-400 bg-zinc-100 text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                        : "border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span className="font-medium">{tab.label}</span>
                  </button>
                );
              })}
            </nav>
          </aside>

          <div className="admin-console-body panel-body relative min-h-0 flex-1 overflow-auto p-4 md:p-6">
            <div
              className={`flex min-h-0 flex-1 flex-col transition-opacity ${loading ? "pointer-events-none select-none opacity-70" : "opacity-100"}`}
              aria-busy={loading}
            >
              {adminTab !== "model_pricing" && adminTab !== "topup_setting" ? (
              <div className="admin-console-tab-panel">
                <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
                  {adminTab === "channel" ? (
                    <Button type="button" onClick={openCreateChannel}>
                      添加渠道
                    </Button>
                  ) : null}
                  {adminTab === "redemption" ? (
                    <Button type="button" onClick={openCreateRedemption}>
                      创建兑换码
                    </Button>
                  ) : null}
                  {adminTab === "user" ? (
                    <Button type="button" onClick={openCreateUser}>
                      添加用户
                    </Button>
                  ) : null}
                </div>
                <div className="admin-table-wrap table-wrap">
                  <Table className="table">
                    <TableHeader>
                      {adminTab === "channel" ? (
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>名称</TableHead>
                          <TableHead>类型</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead>分组</TableHead>
                          <TableHead>优先级</TableHead>
                          <TableHead>操作</TableHead>
                        </TableRow>
                      ) : null}
                      {adminTab === "redemption" ? (
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>名称</TableHead>
                          <TableHead>兑换码</TableHead>
                          <TableHead>额度</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead>创建时间</TableHead>
                          <TableHead>操作</TableHead>
                        </TableRow>
                      ) : null}
                      {adminTab === "user" ? (
                        <TableRow>
                          <TableHead>ID</TableHead>
                          <TableHead>用户名</TableHead>
                          <TableHead>角色</TableHead>
                          <TableHead>分组</TableHead>
                          <TableHead>余额（USD）</TableHead>
                          <TableHead>状态</TableHead>
                        </TableRow>
                      ) : null}
                      {adminTab === "setting" ? (
                        <TableRow>
                          <TableHead>键</TableHead>
                          <TableHead>值</TableHead>
                        </TableRow>
                      ) : null}
                      {adminTab === "log" ? (
                        <TableRow>
                          <TableHead>类型</TableHead>
                          <TableHead>用户</TableHead>
                          <TableHead>模型</TableHead>
                          <TableHead>额度</TableHead>
                          <TableHead>渠道</TableHead>
                          <TableHead>时间</TableHead>
                          <TableHead>详情</TableHead>
                        </TableRow>
                      ) : null}
                      {adminTab === "midjourney" ? (
                        <TableRow>
                          <TableHead>MJ ID</TableHead>
                          <TableHead>用户</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead>提交时间</TableHead>
                          <TableHead>Prompt</TableHead>
                        </TableRow>
                      ) : null}
                    </TableHeader>
                    <TableBody>
                      {rows.map((row: any) => (
                        <TableRow key={`${adminTab}-${String(row.id ?? row.key ?? row.request_id ?? row.mj_id ?? "row")}`}>
                          {adminTab === "channel" ? (
                            <>
                              <TableCell>{row.id ?? "—"}</TableCell>
                              <TableCell>{row.name || "—"}</TableCell>
                              <TableCell className="max-w-[200px]">
                                <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                                  <span className="font-medium">{channelTypeParts(row.type).name}</span>
                                  {channelTypeParts(row.type).code != null ? (
                                    <span className="text-xs text-zinc-500">({channelTypeParts(row.type).code})</span>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell>{channelStatusLabel(row.status)}</TableCell>
                              <TableCell>{row.group || "—"}</TableCell>
                              <TableCell>{row.priority ?? "—"}</TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button type="button" variant="outline" size="sm" onClick={() => void openEditChannel(row)}>
                                    编辑
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => askDeleteChannel(row)}
                                  >
                                    删除
                                  </Button>
                                </div>
                              </TableCell>
                            </>
                          ) : null}
                          {adminTab === "redemption" ? (
                            <>
                              <TableCell>{row.id ?? "—"}</TableCell>
                              <TableCell>{row.name || "—"}</TableCell>
                              <TableCell className="font-mono text-xs" title={row.key}>{trunc(row.key, 24)}</TableCell>
                              <TableCell>{row.quota ?? "—"}</TableCell>
                              <TableCell>{redemptionStatusLabel(row)}</TableCell>
                              <TableCell className="text-xs">{fmtTime(row.created_time || 0)}</TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  <Button type="button" variant="outline" size="sm" onClick={() => openEditRedemption(row)}>
                                    编辑
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => void removeRedemption(row)}
                                  >
                                    删除
                                  </Button>
                                </div>
                              </TableCell>
                            </>
                          ) : null}
                          {adminTab === "user" ? (
                            <>
                              <TableCell>{row.id ?? "—"}</TableCell>
                              <TableCell>{row.username || "—"}</TableCell>
                              <TableCell>{roleLabel(row.role)}</TableCell>
                              <TableCell>{row.group || "—"}</TableCell>
                              <TableCell>
                                {Number.isFinite(Number(row.quota)) ? (
                                  <span className="tabular-nums">${(Number(row.quota) / quotaPerUnit).toFixed(2)}</span>
                                ) : (
                                  "—"
                                )}
                              </TableCell>
                              <TableCell>{userStatusLabel(row.status)}</TableCell>
                            </>
                          ) : null}
                          {adminTab === "setting" ? (
                            <>
                              <TableCell className="font-mono text-xs whitespace-nowrap">{row.key || "—"}</TableCell>
                              <TableCell className="max-w-md break-all text-xs" title={row.value}>{trunc(row.value, 200)}</TableCell>
                            </>
                          ) : null}
                          {adminTab === "log" ? (
                            <>
                              <TableCell>{row.type ?? "—"}</TableCell>
                              <TableCell>{row.username || "—"}</TableCell>
                              <TableCell className="max-w-[140px] truncate" title={row.model_name}>{row.model_name || "—"}</TableCell>
                              <TableCell>{row.quota ?? "—"}</TableCell>
                              <TableCell>{row.channel ?? "—"}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{fmtTime(row.created_at || 0)}</TableCell>
                              <TableCell>
                                <Button type="button" variant="outline" size="sm" onClick={() => void openLogDetail(row)}>
                                  查看
                                </Button>
                              </TableCell>
                            </>
                          ) : null}
                          {adminTab === "midjourney" ? (
                            <>
                              <TableCell className="font-mono text-xs">{row.mj_id || "—"}</TableCell>
                              <TableCell>{row.user_id ?? "—"}</TableCell>
                              <TableCell>{row.status || "—"}</TableCell>
                              <TableCell className="text-xs">{fmtTime(row.submit_time || 0)}</TableCell>
                              <TableCell className="max-w-xs text-xs" title={row.prompt}>{trunc(row.prompt, 60)}</TableCell>
                            </>
                          ) : null}
                        </TableRow>
                      ))}
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={adminTab === "setting" ? 2 : adminTab === "midjourney" ? 5 : adminTab === "log" ? 7 : adminTab === "redemption" ? 7 : 6}
                            className="text-zinc-500"
                          >
                            暂无数据
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-zinc-500">共 {total} 条</p>
                  {canPaginate ? (
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span>第 {currentPage} / {totalPages} 页</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                        disabled={loading || currentPage <= 1}
                      >
                        上一页
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        disabled={loading || currentPage >= totalPages}
                      >
                        下一页
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
              ) : null}

              {adminTab === "model_pricing" ? (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <p className="text-xs text-zinc-500">
                  全站已启用模型（各分组 abilities 并集）。未配置美元价的模型也会列出，便于补价；实际扣费仍以是否配置有效定价为准。普通用户在公开「模型」页仅能看到其分组可用且（默认）已定价的子集。编辑弹窗写入
                  ModelInputUSDPerM / ModelOutputUSDPerM / ModelCacheReadUSDPerM / ModelPerCallUSD。
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="max-w-sm"
                    placeholder="搜索模型/描述/标签/供应商"
                    value={modelPricingSearch}
                    onChange={(event) => setModelPricingSearch(event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => void resetModelPricing()}
                    disabled={modelPricingResetting}
                  >
                    {modelPricingResetting ? "重置中..." : "重置定价"}
                  </Button>
                </div>
                <div className="admin-table-wrap table-wrap min-h-0 flex-1">
                  <Table className="table">
                    <TableHeader>
                      <TableRow>
                        <TableHead>模型</TableHead>
                        <TableHead>供应商</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead title="在美元成本与分组倍率之上再乘的溢价，默认 1">溢价</TableHead>
                        <TableHead>输入 USD/M</TableHead>
                        <TableHead>输出 USD/M</TableHead>
                        <TableHead>缓存 USD/M</TableHead>
                        <TableHead>按次 USD</TableHead>
                        <TableHead>操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredModelPricingRows.map((row: any) => {
                        const name = String(row?.model_name || "");
                        const vendorName = String(row?.vendor_name || "");
                        const vendorIcon = resolveVendorIcon(String(row?.vendor_icon || ""), vendorName, name);
                        return (
                          <TableRow key={`pricing-${name}`} className="[&>td]:align-middle">
                            <TableCell className="align-middle">
                              {name ? (
                                <button
                                  type="button"
                                  className="cursor-pointer text-left text-sm font-medium text-primary underline-offset-2 hover:underline"
                                  onClick={() => void copyModelName(name)}
                                  title="点击复制"
                                >
                                  {name}
                                </button>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="align-middle text-xs">
                              {vendorName ? (
                                <div className="flex items-center gap-2">
                                  {vendorIcon ? (
                                    <img
                                      src={vendorIcon}
                                      alt={vendorName}
                                      className="h-4 w-4 rounded-sm dark:invert"
                                      onError={(event) => onVendorIconError(event, row)}
                                    />
                                  ) : null}
                                  <span>{vendorName}</span>
                                </div>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                            <TableCell className="align-middle">{Number(row?.quota_type || 0) === 0 ? "按量" : "按次"}</TableCell>
                            <TableCell className="align-middle tabular-nums text-xs">
                              {fmtPremium(modelOptionMaps.ModelPremiumRatio?.[name] ?? row?.premium_ratio)}
                            </TableCell>
                            <TableCell className="align-middle">{fmtUsd(modelOptionMaps.ModelInputUSDPerM?.[name] ?? row?.input_usd_per_m)}</TableCell>
                            <TableCell className="align-middle">{fmtUsd(modelOptionMaps.ModelOutputUSDPerM?.[name] ?? row?.output_usd_per_m)}</TableCell>
                            <TableCell className="align-middle">{fmtUsd(modelOptionMaps.ModelCacheReadUSDPerM?.[name] ?? row?.cache_read_usd_per_m)}</TableCell>
                            <TableCell className="align-middle">{fmtUsd(modelOptionMaps.ModelPerCallUSD?.[name] ?? row?.per_call_usd)}</TableCell>
                            <TableCell className="align-middle">
                              <Button type="button" variant="outline" size="sm" onClick={() => openModelPricingEditor(row)}>
                                编辑
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filteredModelPricingRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-zinc-500">暂无数据</TableCell>
                        </TableRow>
                      ) : null}
                    </TableBody>
                  </Table>
                </div>
              </div>
              ) : null}

              {adminTab === "topup_setting" ? (
              <div className="min-h-0 flex-1 space-y-4 overflow-auto pr-1">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button type="button" onClick={() => void saveTopupSettings()} disabled={topupSaving || topupLoading}>
                    {topupSaving ? "保存中..." : "保存充值设置"}
                  </Button>
                </div>
                <div className="rounded-xl border border-border/80 bg-card/60 p-4 md:p-5">
                  <div className="mb-4">
                    <p className="text-sm font-medium">易支付（在线充值）</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      对接彩虹易支付等易支付兼容网关：填写网关地址、商户 PID/密钥及业务参数。修改后请点击右上角「保存充值设置」生效。
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>最小充值金额</Label>
                      <p className="text-xs text-muted-foreground">用户单笔在线充值不得低于该数值。</p>
                      <Input value={topupForm.MinTopUp} onChange={(event) => setTopupForm((prev) => ({ ...prev, MinTopUp: event.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>邀请充值返佣比例</Label>
                      <p className="text-xs text-muted-foreground">被邀请人通过易支付充值时，邀请人获得的奖励比例。</p>
                      <Input value={topupForm.InviterTopupRewardRatio} onChange={(event) => setTopupForm((prev) => ({ ...prev, InviterTopupRewardRatio: event.target.value }))} />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label>易支付网关地址</Label>
                      <p className="text-xs text-muted-foreground">易支付接口根地址；是否带末尾斜杠以平台文档为准。</p>
                      <Input
                        value={topupForm.PayAddress}
                        onChange={(event) => setTopupForm((prev) => ({ ...prev, PayAddress: event.target.value }))}
                        placeholder="https://你的易支付域名/"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>商户 PID</Label>
                      <p className="text-xs text-muted-foreground">易支付商户编号（partnerid）。</p>
                      <Input value={topupForm.EpayId} onChange={(event) => setTopupForm((prev) => ({ ...prev, EpayId: event.target.value }))} placeholder="商户 PID" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>商户密钥</Label>
                      <p className="text-xs text-muted-foreground">易支付通讯密钥；仅在有新密钥时填写，保存后输入框会清空且服务端保留已存密钥。</p>
                      <Input type="password" value={topupForm.EpayKey} onChange={(event) => setTopupForm((prev) => ({ ...prev, EpayKey: event.target.value }))} placeholder="留空则不修改" autoComplete="off" />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                      <Label>自定义异步通知地址（可选）</Label>
                      <p className="text-xs text-muted-foreground">若需指定易支付异步回调 URL，可填此项；留空则使用系统默认的 <span className="font-mono">/api/user/epay/notify</span> 回调路径。</p>
                      <Input value={topupForm.CustomCallbackAddress} onChange={(event) => setTopupForm((prev) => ({ ...prev, CustomCallbackAddress: event.target.value }))} placeholder="可选，完整可访问 URL" />
                    </div>
                  </div>
                </div>
              </div>
              ) : null}
            </div>
            {loading ? (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/65 backdrop-blur-[1px]">
                <div className="flex items-center gap-3 rounded-lg border border-border bg-card/95 px-4 py-3 shadow-sm">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-foreground" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">正在加载</p>
                    <p className="text-xs text-muted-foreground">请稍候，内容马上就绪...</p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <Dialog open={showRedemptionEditor} onOpenChange={setShowRedemptionEditor}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{redemptionEditor.id == null ? "创建兑换码" : "编辑兑换码"}</DialogTitle>
            <DialogDescription>
              {redemptionEditor.id == null ? "可一次批量生成多个兑换码。" : "可修改名称、额度、状态和过期时间。"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label>名称</Label>
              <Input
                value={redemptionEditor.name}
                onChange={(event) => setRedemptionEditor((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="例如：活动赠送"
              />
            </div>
            <div className="space-y-1.5">
              <Label>额度</Label>
              <Input
                value={redemptionEditor.quota}
                onChange={(event) => setRedemptionEditor((prev) => ({ ...prev, quota: event.target.value }))}
                placeholder="例如：500000"
              />
            </div>
            {redemptionEditor.id == null ? (
              <div className="space-y-1.5">
                <Label>数量</Label>
                <Input
                  value={redemptionEditor.count}
                  onChange={(event) => setRedemptionEditor((prev) => ({ ...prev, count: event.target.value }))}
                  placeholder="默认 1，最大 100"
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>状态</Label>
                <Select
                  value={redemptionEditor.status}
                  onValueChange={(value) => setRedemptionEditor((prev) => ({ ...prev, status: value || "1" }))}
                >
                  <SelectTrigger className="h-9 w-full min-w-0 max-w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">可用</SelectItem>
                    <SelectItem value="2">禁用</SelectItem>
                    <SelectItem value="3">已使用</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>过期时间（可选）</Label>
              <Input
                type="datetime-local"
                value={redemptionEditor.expiredAt}
                onChange={(event) => setRedemptionEditor((prev) => ({ ...prev, expiredAt: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRedemptionEditor(false)} disabled={redemptionSaving}>
              取消
            </Button>
            <Button onClick={() => void saveRedemptionEditor()} disabled={redemptionSaving}>
              {redemptionSaving ? "保存中..." : redemptionEditor.id == null ? "创建" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showUserEditor} onOpenChange={setShowUserEditor}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>添加用户</DialogTitle>
            <DialogDescription>创建新用户账号，可选择普通用户或管理员角色。</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label>用户名</Label>
              <Input
                value={userEditor.username}
                onChange={(event) => setUserEditor((prev) => ({ ...prev, username: event.target.value }))}
                placeholder="请输入用户名"
              />
            </div>
            <div className="space-y-1.5">
              <Label>密码</Label>
              <Input
                type="password"
                value={userEditor.password}
                onChange={(event) => setUserEditor((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="请输入密码"
              />
            </div>
            <div className="space-y-1.5">
              <Label>显示名称（可选）</Label>
              <Input
                value={userEditor.displayName}
                onChange={(event) => setUserEditor((prev) => ({ ...prev, displayName: event.target.value }))}
                placeholder="不填则默认同用户名"
              />
            </div>
            <div className="space-y-1.5">
              <Label>角色</Label>
              <Select
                value={userEditor.role}
                onValueChange={(value) => setUserEditor((prev) => ({ ...prev, role: value || "1" }))}
              >
                <SelectTrigger className="h-9 w-full min-w-0 max-w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">普通用户</SelectItem>
                  {canCreateAdminUser ? <SelectItem value="10">管理员</SelectItem> : null}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUserEditor(false)} disabled={userSaving}>
              取消
            </Button>
            <Button onClick={() => void saveUserEditor()} disabled={userSaving}>
              {userSaving ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showDeleteChannel}
        onOpenChange={(open) => {
          setShowDeleteChannel(open);
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>删除渠道</DialogTitle>
            <DialogDescription>
              确定删除「{deleteTarget?.name || ""}」吗？此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteChannel(false)} disabled={deleting}>取消</Button>
            <Button variant="destructive" onClick={() => void removeChannel()} disabled={deleting}>
              {deleting ? "删除中..." : "删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showChannelEditor} onOpenChange={setShowChannelEditor}>
        <DialogContent className="max-h-[90vh] max-w-[calc(100%-2rem)] overflow-hidden sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{channelEditor.id == null ? "添加渠道" : "编辑渠道"}</DialogTitle>
            <DialogDescription className="text-sm text-zinc-500">
              {channelEditor.id == null
                ? "使用单 Key 模式添加。Vertex 支持 API Key/JSON 两种模式（需填写部署地区）。"
                : "修改名称、类型、状态、模型与分组等。新 API Key 留空则不修改。"}
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[calc(90vh-11rem)] flex-col gap-4 overflow-y-auto py-2 pr-1 md:flex-row md:items-stretch md:gap-6">
            <div className="min-w-0 shrink-0 space-y-3.5 md:w-[min(100%,22rem)] md:max-w-sm">
              <div className="space-y-1.5">
                <Label htmlFor="ch-name" className="block text-xs font-medium text-zinc-600">
                  名称
                </Label>
                <Input
                  id="ch-name"
                  className="h-9"
                  value={channelEditor.name}
                  onChange={(event) => setChannelEditor((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="显示名称"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ch-type" className="block text-xs font-medium text-zinc-600">
                  类型
                </Label>
                <Select
                  value={channelEditor.type}
                  onValueChange={(value) => setChannelEditor((prev) => ({ ...prev, type: value || "1" }))}
                >
                  <SelectTrigger id="ch-type" className="h-9 w-full min-w-0 max-w-full">
                    <span className="truncate">{selectedChannelTypeLabel}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {!channelTypeOptions.some((item) => item.value === channelEditor.type) ? (
                      <SelectItem value={channelEditor.type}>
                        {channelTypeParts(channelEditor.type).name} ({channelEditor.type})
                      </SelectItem>
                    ) : null}
                    {channelTypeOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label} ({item.value})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {channelEditor.id != null ? (
                <div className="space-y-1.5">
                  <Label htmlFor="ch-status" className="block text-xs font-medium text-zinc-600">
                    状态
                  </Label>
                  <Select
                    value={channelEditor.status}
                    onValueChange={(value) => setChannelEditor((prev) => ({ ...prev, status: value || "1" }))}
                  >
                    <SelectTrigger id="ch-status" className="h-9 w-full min-w-0 max-w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNEL_STATUS_OPTIONS.map((item) => (
                        <SelectItem key={item.v} value={item.v}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="ch-key" className="block text-xs font-medium text-zinc-600">
                  {channelEditor.id == null ? "API Key" : "新 API Key（可选）"}
                </Label>
                <Input
                  id="ch-key"
                  className="h-9 font-mono text-xs"
                  value={channelEditor.key}
                  onChange={(event) => setChannelEditor((prev) => ({ ...prev, key: event.target.value }))}
                  placeholder={
                    isVertexType && channelEditor.vertexKeyType === "json"
                      ? channelEditor.id == null
                        ? '{"type":"service_account",...}'
                        : "留空则不修改（Service Account JSON）"
                      : channelEditor.id == null
                        ? "sk-..."
                        : "留空则不修改密钥"
                  }
                  autoComplete="off"
                />
              </div>
              {isVertexType ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="ch-vertex-mode" className="block text-xs font-medium text-zinc-600">
                      Vertex Key 模式
                    </Label>
                    <Select
                      value={channelEditor.vertexKeyType}
                      onValueChange={(value) =>
                        setChannelEditor((prev) => ({
                          ...prev,
                          vertexKeyType: value === "json" ? "json" : "api_key",
                        }))
                      }
                    >
                      <SelectTrigger id="ch-vertex-mode" className="h-9 w-full min-w-0 max-w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="api_key">API Key</SelectItem>
                        <SelectItem value="json">Service Account JSON</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ch-vertex-region" className="block text-xs font-medium text-zinc-600">
                      部署地区
                    </Label>
                    <Input
                      id="ch-vertex-region"
                      className="h-9"
                      value={channelEditor.vertexRegion}
                      onChange={(event) =>
                        setChannelEditor((prev) => ({ ...prev, vertexRegion: event.target.value }))
                      }
                      placeholder="global / us-central1"
                    />
                  </div>
                </>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="ch-base" className="block text-xs font-medium text-zinc-600">
                  Base URL（可选）
                </Label>
                <Input
                  id="ch-base"
                  className="h-9"
                  value={channelEditor.baseUrl}
                  onChange={(event) => setChannelEditor((prev) => ({ ...prev, baseUrl: event.target.value }))}
                  placeholder={channelEditor.id == null ? "https://api.openai.com/v1" : "https://..."}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ch-group" className="block text-xs font-medium text-zinc-600">
                  分组
                </Label>
                <Input
                  id="ch-group"
                  className="h-9"
                  value={channelEditor.group}
                  onChange={(event) => setChannelEditor((prev) => ({ ...prev, group: event.target.value }))}
                  placeholder="default"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ch-priority" className="block text-xs font-medium text-zinc-600">
                  优先级（可选）
                </Label>
                <Input
                  id="ch-priority"
                  className="h-9"
                  value={channelEditor.priority}
                  onChange={(event) => setChannelEditor((prev) => ({ ...prev, priority: event.target.value }))}
                  placeholder="数字越大越优先"
                />
              </div>
            </div>
            <div className="flex min-h-[min(42vh,420px)] min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="ch-models" className="mb-0">
                  模型列表（可选）
                </Label>
                {channelEditor.id != null ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 px-3 text-xs"
                    disabled={channelFetchingModels || channelSaving}
                    onClick={() => void fetchUpstreamModelsForEdit()}
                  >
                    {channelFetchingModels ? "获取中..." : "自动获取模型"}
                  </Button>
                ) : isOpenRouterType || isVertexType ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 px-3 text-xs"
                    disabled={channelFetchingModels || channelSaving}
                    onClick={() => void fetchUpstreamModelsForCreate()}
                  >
                    {channelFetchingModels ? "获取中..." : "一键获取模型"}
                  </Button>
                ) : null}
              </div>
              <Textarea
                id="ch-models"
                className="min-h-[12rem] w-full flex-1 resize-none font-mono text-xs leading-relaxed md:min-h-0"
                value={channelEditor.models}
                onChange={(event) => setChannelEditor((prev) => ({ ...prev, models: event.target.value }))}
                placeholder="多个模型用英文逗号或换行分隔，留空表示不限制"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChannelEditor(false)} disabled={channelSaving}>取消</Button>
            <Button onClick={() => void submitChannelEditor()} disabled={channelSaving}>
              {channelSaving ? "保存中..." : channelEditor.id == null ? "添加" : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Dialog open={showLogDetail} onOpenChange={setShowLogDetail}>
        <DialogContent className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-hidden xl:max-w-7xl">
          <DialogHeader>
            <DialogTitle>日志详情</DialogTitle>
            <DialogDescription className="font-mono break-all">
              request_id: {logDetailRid}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(92vh-11rem)] overflow-auto border border-border bg-muted/30 p-3">
            {logDetailLoading ? (
              <p className="text-sm text-zinc-500">加载中...</p>
            ) : (
              <pre className="min-w-max text-[11px] leading-relaxed whitespace-pre">{logDetailBody || "无内容"}</pre>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogDetail(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
