import { MODEL_TEST_STORAGE_KEY, MODEL_TEST_VALIDITY_MS, TEST_STATUS_STORAGE_KEY } from "../constants";
import { modelTestStatusKey, parseModelBinding } from "../helpers";
import { store } from "./state.svelte";
import type { ModelTestEntry } from "../../global";

export function isModelTestEntryValid(entry: ModelTestEntry | undefined | null): boolean {
  if (!entry) return false;
  if (entry.status === "testing") return true;
  const testedAt = entry.testedAt;
  if (testedAt == null || !Number.isFinite(testedAt) || testedAt <= 0) return false;
  return Date.now() - testedAt < MODEL_TEST_VALIDITY_MS;
}

export function formatModelTestTime(testedAt: number): string {
  const date = new Date(testedAt);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const time = date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  if (date.toDateString() === now.toDateString()) return time;
  const day = date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  return `${day} ${time}`;
}

export function formatModelTestSummary(entry: ModelTestEntry): string {
  const summary = String(entry.summary || "").trim();
  if (entry.status === "testing") return summary || "测试中…";
  if (!isModelTestEntryValid(entry)) return "";
  const timeLabel = entry.testedAt ? formatModelTestTime(entry.testedAt) : "";
  if (!summary) return timeLabel;
  return timeLabel ? `${summary} · ${timeLabel}` : summary;
}

function normalizeModelTestEntry(raw: unknown): ModelTestEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const status = String((raw as ModelTestEntry).status || "").trim();
  if (status !== "testing" && status !== "pass" && status !== "fail") return null;
  const testedAtRaw = Number((raw as ModelTestEntry).testedAt);
  const testedAt = Number.isFinite(testedAtRaw) && testedAtRaw > 0 ? testedAtRaw : undefined;
  const entry: ModelTestEntry = {
    status,
    summary: String((raw as ModelTestEntry).summary || "").trim(),
    detail: String((raw as ModelTestEntry).detail || "").trim(),
    testedAt,
  };
  if (status !== "testing" && !isModelTestEntryValid(entry)) return null;
  return entry;
}

function loadLegacyTestStatus(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(TEST_STATUS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadModelTests(): Record<string, ModelTestEntry> {
  try {
    const raw = window.localStorage.getItem(MODEL_TEST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const out: Record<string, ModelTestEntry> = {};
        for (const [key, value] of Object.entries(parsed)) {
          const entry = normalizeModelTestEntry(value);
          if (entry && entry.status !== "testing") out[key] = entry;
        }
        return out;
      }
    }
  } catch {
    /* fall through to legacy */
  }

  const legacy = loadLegacyTestStatus();
  const out: Record<string, ModelTestEntry> = {};
  for (const [key, value] of Object.entries(legacy)) {
    if (value === "pass" || value === "fail") {
      out[key] = {
        status: value,
        summary: value === "pass" ? "测试成功" : "测试失败",
        detail: "",
      };
    }
  }
  return out;
}

function persistModelTests() {
  try {
    const payload: Record<string, ModelTestEntry> = {};
    for (const [key, entry] of Object.entries(store.modelTests)) {
      if (entry.status === "testing") continue;
      if (!isModelTestEntryValid(entry)) continue;
      payload[key] = {
        status: entry.status,
        summary: entry.summary,
        detail: "",
        testedAt: entry.testedAt,
      };
    }
    window.localStorage.setItem(MODEL_TEST_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function clearExpiredModelTest(key: string) {
  const k = String(key || "").trim();
  if (!k || !(k in store.modelTests)) return;
  delete store.modelTests[k];
  persistModelTests();
}

export function getModelTest(key: string): ModelTestEntry | undefined {
  const k = String(key || "").trim();
  if (!k) return undefined;
  const entry = store.modelTests[k];
  if (!entry) return undefined;
  if (entry.status !== "testing" && !isModelTestEntryValid(entry)) {
    clearExpiredModelTest(k);
    return undefined;
  }
  return entry;
}

export function isModelTesting(key: string): boolean {
  return getModelTest(key)?.status === "testing";
}

export function setModelTestTesting(key: string) {
  const k = String(key || "").trim();
  if (!k) return;
  store.modelTests[k] = {
    status: "testing",
    summary: "测试中…",
    detail: "",
  };
}

export function setModelTestResult(key: string, passed: boolean, summary: string, detail: string) {
  const k = String(key || "").trim();
  if (!k) return;
  store.modelTests[k] = {
    status: passed ? "pass" : "fail",
    summary: summary || (passed ? "测试成功" : "测试失败"),
    detail: detail || "",
    testedAt: Date.now(),
  };
  persistModelTests();
}

export function clearModelTest(key: string) {
  const k = String(key || "").trim();
  if (!k || !(k in store.modelTests)) return;
  delete store.modelTests[k];
  persistModelTests();
}

export function clearVendorModelTests(vendorName: string) {
  const key = String(vendorName || "").trim().toLowerCase();
  if (!key) return;
  let changed = false;
  for (const testKey of Object.keys(store.modelTests)) {
    const parsed = parseModelBinding(testKey);
    if (parsed && parsed.vendorName.toLowerCase() === key) {
      delete store.modelTests[testKey];
      changed = true;
    }
  }
  if (changed) persistModelTests();
}

export function clearModelBindingTest(binding: string) {
  clearModelTest(modelTestStatusKey(binding));
}
