const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const sourcePath = path.join(__dirname, "ui/src/lib/store/vendor-usage.ts");
const { outputText } = ts.transpileModule(fs.readFileSync(sourcePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});

function usageStore(result) {
  const store = { vendorUsage: {}, vendorUsageLoading: {}, profiles: [], subscriptions: [] };
  const translations = {
    "vendorDetail.usageTierFiveHour": "5小时",
    "vendorDetail.usageTierSevenDay": "7天",
    "vendorDetail.usageUnavailable": "不可用",
  };
  const dependencies = {
    "../helpers": {
      getSubscriptionVendors: (profiles) => profiles.filter((vendor) => vendor.kind === "subscription"),
      shouldShowVendorUsage: () => true,
    },
    "../i18n": { t: (key) => translations[key] || key },
    "../toast": { toast: { error() {} } },
    "./state.svelte": { store },
  };
  const context = {
    exports: {},
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    window: { clovapiCli: { profilesUsage: async () => result } },
  };
  vm.runInNewContext(outputText, context, { filename: sourcePath });
  return context.exports;
}

const subscription = { name: "Codex", kind: "subscription" };
const account = { id: "account-1", credentialRef: "subscription/test-only.json" };

function cacheSubscription(api, result) {
  api.applyVendorUsageCache([{
    ...result,
    vendor: subscription.name,
    vendorKind: subscription.kind,
    cacheKey: `subscription:${account.id}`,
  }]);
}

test("subscription remaining quota stays unchanged when a direct query is replaced by cached usage", async () => {
  const result = {
    ok: true,
    text: "5小时 12%（30m） · 7天 34%（09-15）",
    usage: {
      success: true,
      kind: "subscription",
      data: [
        { planName: "five_hour", used: 12, total: 100, remaining: 88, unit: "%", isValid: true },
        { planName: "seven_day", used: 34, total: 100, remaining: 66, unit: "%", isValid: true },
      ],
    },
  };
  const api = usageStore(result);
  await api.querySubscriptionAccountUsage(subscription, account);
  assert.equal(api.subscriptionAccountUsageSummary(account.id), "5小时 88% · 7天 66%");

  cacheSubscription(api, result);
  assert.equal(api.subscriptionAccountUsageSummary(account.id), "5小时 88% · 7天 66%");
});

test("subscription cache derives remaining quota from tiers when flat rows are absent", async () => {
  const result = {
    ok: true,
    text: "5小时 25%",
    usage: { success: true, kind: "subscription", tiers: [{ name: "five_hour", utilization: 25 }] },
  };
  const api = usageStore(result);
  await api.querySubscriptionAccountUsage(subscription, account);
  assert.equal(api.subscriptionAccountUsageSummary(account.id), "5小时 75%");

  cacheSubscription(api, result);
  assert.equal(api.subscriptionAccountUsageSummary(account.id), "5小时 75%");
});

test("an exhausted subscription stays unavailable after cache refresh", async () => {
  const result = {
    ok: true,
    text: "5小时 100%",
    usage: {
      success: true,
      kind: "subscription",
      data: [{ planName: "five_hour", used: 100, total: 100, remaining: 0, unit: "%", isValid: true }],
    },
  };
  const api = usageStore(result);
  await api.querySubscriptionAccountUsage(subscription, account);
  assert.equal(api.subscriptionAccountUsageSummary(account.id), "不可用");

  cacheSubscription(api, result);
  assert.equal(api.subscriptionAccountUsageSummary(account.id), "不可用");
});

test("API vendor custom text keeps priority over quota rows in both update paths", async () => {
  const vendor = { name: "Custom API", kind: "api", baseUrl: "https://example.invalid", apiKey: "test-only" };
  const result = {
    ok: true,
    text: "Custom balance summary",
    usage: { success: true, kind: "balance", data: [{ remaining: 42, unit: "USD" }] },
  };
  const api = usageStore(result);
  await api.queryVendorUsage(vendor);
  assert.equal(api.vendorUsageSummary(vendor.name), result.text);

  api.applyVendorUsageCache([{ ...result, vendor: vendor.name, vendorKind: vendor.kind }]);
  assert.equal(api.vendorUsageSummary(vendor.name), result.text);
});

test("subscription text remains a fallback when structured quota is absent", async () => {
  const result = { ok: true, text: "Quota details unavailable", usage: { success: true, kind: "subscription" } };
  const api = usageStore(result);
  await api.querySubscriptionAccountUsage(subscription, account);
  assert.equal(api.subscriptionAccountUsageSummary(account.id), result.text);

  cacheSubscription(api, result);
  assert.equal(api.subscriptionAccountUsageSummary(account.id), result.text);
});
