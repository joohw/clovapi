import {
  mergeVendorModels,
  normalizeModelAdapter,
  normalizeVendor,
  normalizeVendorModel,
  resolveVendorByName,
} from "../helpers";
import { persistProfiles } from "./profile-persist";
import { clearVendorModelTests } from "./model-tests";
import { store } from "./state.svelte";
import { toast } from "../toast";
import type { Vendor } from "../../global";

export function canFetchVendorModels(vendor: Vendor): boolean {
  return normalizeModelAdapter(vendor.modelAdapter, vendor.kind, vendor.localProvider) !== "manual";
}

export function isVendorFetching(vendorName: string): boolean {
  return Boolean(store.vendorFetching[vendorName]);
}

export async function fetchVendorModels(vendorName: string) {
  const name = String(vendorName || "").trim();
  if (!name || store.vendorFetching[name]) return;

  let vendor = resolveVendorByName(store.profiles, name);
  if (!vendor) {
    toast.error("未找到对应供应商。");
    return;
  }

  const vendorKey = vendor.name.toLowerCase();
  const vendorKind = vendor.kind;
  let vendorIdx = store.profiles.findIndex(
    (item) => item.name.toLowerCase() === vendorKey && item.kind === vendorKind,
  );
  if (vendorIdx < 0) {
    store.profiles.push(vendor);
    vendorIdx = store.profiles.length - 1;
    const saved = await persistProfiles();
    if (!saved?.ok) {
      toast.error(saved?.error || "保存供应商配置失败");
      store.profiles.splice(vendorIdx, 1);
      return;
    }
    vendor = resolveVendorByName(store.profiles, name) || vendor;
    const nextVendorKey = vendor.name.toLowerCase();
    const nextVendorKind = vendor.kind;
    vendorIdx = store.profiles.findIndex(
      (item) => item.name.toLowerCase() === nextVendorKey && item.kind === nextVendorKind,
    );
  }
  if (!canFetchVendorModels(vendor)) {
    toast.warning("当前适配器为手动维护，请在编辑供应商中切换适配器后再拉取。");
    return;
  }

  const bridge = window.clovapiProfiles;
  if (!bridge?.listModels) {
    toast.error("当前环境不支持拉取模型。");
    return;
  }

  store.vendorFetching[name] = true;
  try {
    const result = await bridge.listModels(name);
    if (!result?.ok) {
      toast.error(result?.error || "拉取模型失败");
      return;
    }

    if (Array.isArray(result.profiles) && result.profiles.length) {
      store.profiles = result.profiles.map(normalizeVendor);
    } else {
      const fetched = (result.models || []).map(normalizeVendorModel);
      if (!fetched.length) {
        toast.warning(result.message || "未拉取到任何模型");
        return;
      }
      const merged = mergeVendorModels(vendor.models || [], fetched);
      store.profiles[vendorIdx] = { ...vendor, models: merged };
      const saved = await persistProfiles();
      if (!saved?.ok) {
        toast.error(saved?.error || "保存模型列表失败");
        return;
      }
    }

    clearVendorModelTests(name);

    const count = (result.models || []).length;
    toast.success(`已拉取 ${count} 个模型`);
  } finally {
    delete store.vendorFetching[name];
  }
}
