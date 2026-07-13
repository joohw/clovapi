export {};

type CliBridge = {
  runClovapi(args: string[], cwd: string): Promise<{
    ok?: boolean;
    error?: string;
    code?: number | null;
    stdout?: string;
    stderr?: string;
  }>;
  stop(): Promise<unknown>;
  state(): Promise<{ running?: boolean }>;
  defaultCwd(): Promise<{ cwd?: string }>;
  toolStatus(): Promise<{ available?: boolean }>;
  updateCli(payload?: { check?: boolean; version?: string }): Promise<{
    ok?: boolean;
    error?: string;
    detail?: {
      current_version?: string;
      latest_version?: string;
      target_path?: string;
      updated?: boolean;
      up_to_date?: boolean;
    };
    stdout?: string;
    stderr?: string;
  }>;
  which(command: string): Promise<{ ok?: boolean; exists?: boolean; path?: string; error?: string }>;
  authStatus(): Promise<{ ok?: boolean; items?: SubscriptionItem[]; error?: string }>;
  authLogin(
    payload: string | { provider: string; credentialRef?: string },
  ): Promise<{ ok?: boolean; cancelled?: boolean; error?: string }>;
  cancelAuthLogin(provider: string): Promise<{ ok?: boolean; error?: string }>;
  authLogout(provider: string): Promise<ProfilesLoadResult>;
  proxyStatus(): Promise<ProxyStatusResult>;
  proxyHealth(): Promise<ProxyHealthResult>;
  proxyStart(port?: number, host?: string): Promise<ProxyStatusResult>;
  proxyConfigSave(payload: ProxyConfig): Promise<{ ok?: boolean; proxy?: ProxyConfig; error?: string }>;
  proxyStop(options?: { suppressAutostart?: boolean }): Promise<{ ok?: boolean; error?: string }>;
  proxyLogsList(payload?: {
    scope?: "calls" | "system" | "all";
    limit?: number;
    offset?: number;
    apiKey?: string;
    apiKeyUnidentified?: boolean;
  }): Promise<ProxyLogsResult>;
  proxyLogsClear(scope?: "calls" | "system" | "all"): Promise<ProxyLogsResult>;
  profilesLoad(): Promise<ProfilesLoadResult>;
  profilesSave(payload: {
    profiles: Vendor[];
    proxy?: ProxyConfig;
    subscriptionAccounts?: SubscriptionAccount[];
    routeBackends?: RouteBackend[];
  }): Promise<ProfilesSaveResult>;
  profilesTest(payload: string | ProfileTestPayload): Promise<ProfileTestResult>;
  profilesListModels(vendorName: string, credentialRef?: string): Promise<ListVendorModelsResult>;
  profilesModels(): Promise<ModelListResult>;
  profilesUsage(vendorName: string, credentialRef?: string): Promise<VendorUsageResult>;
  profilesCatalog(): Promise<ModelAdaptersResult>;
  onOutput(callback: (payload: unknown) => void): () => void;
  onExit(callback: (payload: { code?: number | null }) => void): () => void;
};

type ProxyHealthResult = {
  ok?: boolean;
  passed?: boolean;
  error?: string;
  url?: string;
  latencyMs?: number;
  body?: unknown;
};

type ProxyBridge = {
  status(): Promise<ProxyStatusResult>;
  health(): Promise<ProxyHealthResult>;
  start(port?: number): Promise<ProxyStatusResult>;
  stop(options?: { suppressAutostart?: boolean }): Promise<{ ok?: boolean; error?: string }>;
};

type ProxyLogsBridge = {
  list(payload?: { limit?: number; offset?: number }): Promise<ProxyLogsResult>;
  clear(scope?: "calls" | "system" | "all"): Promise<ProxyLogsResult>;
};

type AppEventPayload =
  | { type: "open-tab"; tab: "profiles" | "models" | "call-logs" | "system-logs" | "settings" }
  | { type: "open-profiles-vendor"; vendorName: string }
  | { type: "profiles-changed" }
  | { type: "proxy-status-changed" }
  | { type: "desktop-update-progress"; percent?: number; received_bytes?: number; total_bytes?: number };

type DesktopBridge = {
  onAppEvent(callback: (payload: AppEventPayload) => void): () => void;
  checkUpdate?(): Promise<{
    ok?: boolean;
    error?: string;
    detail?: {
      current_version?: string;
      latest_version?: string;
      up_to_date?: boolean;
      download_url?: string;
    };
  }>;
  installUpdate?(): Promise<{ ok?: boolean; error?: string }>;
};

type ProxyConfig = {
  enabled?: boolean;
  host?: string;
  port?: number;
  debugLocalOnly?: boolean;
};

type ProxyStatusResult = {
  ok?: boolean;
  error?: string;
  running?: boolean;
  managed?: boolean;
  pid?: number | null;
  external?: boolean;
  port?: number;
  host?: string;
  baseUrl?: string;
  config?: ProxyConfig;
};

export type ProxyLogEntry = {
  id: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  apiKey?: ProxyLogAPIKeySummary;
  route?: ProxyLogRoute;
  request: {
    method: string;
    url: string;
    proto?: string;
    headers: Record<string, string>;
    body: string;
  };
  upstream: {
    method: string;
    url: string;
    requestHeaders?: Record<string, string>;
    status: number;
    headers: Record<string, string>;
    body: string;
  };
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    reasoningTokens?: number;
  };
  toolCallCount?: number;
  error?: string;
};

export type ProxyLogRoute = {
  backendId?: string;
  sourceType?: string;
  sourceId?: string;
  sourceLabel?: string;
  providerId?: string;
  requestedModel?: string;
  upstreamModel?: string;
  attemptCount?: number;
  attemptBackends?: string[];
};

export type ProxyLogAPIKeySummary = {
  label?: string;
  fingerprint?: string;
};

export type ProxyLogAPIKeyAggregate = {
  apiKey?: ProxyLogAPIKeySummary;
  count: number;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  toolCallCount?: number;
  errorCount?: number;
  lastStartedAt?: string;
  unidentified?: boolean;
};

export type ProxySystemLogEntry = {
  id: string;
  at: string;
  stream: string;
  message: string;
};

type ProxyLogsResult = {
  ok?: boolean;
  error?: string;
  requests?: ProxyLogEntry[];
  system?: ProxySystemLogEntry[];
  apiKeyAggregates?: ProxyLogAPIKeyAggregate[];
  callLogPage?: {
    limit?: number;
    offset?: number;
    hasMore?: boolean;
  };
};

type ProfilesLoadResult = {
  ok?: boolean;
  error?: string;
  profiles?: Vendor[];
  proxy?: ProxyConfig;
  subscriptionAccounts?: SubscriptionAccount[];
  routeBackends?: RouteBackend[];
  usageCache?: VendorUsageCacheResult;
  path?: string;
};

type ProfilesSaveResult = ProfilesLoadResult;

type ProfileTestResult = {
  ok?: boolean;
  passed?: boolean;
  summary?: string;
  text?: string;
  detail?: unknown;
  error?: string;
};

type ClovapiEnvBridge = {
  isDev?: boolean;
  getVersion?(): Promise<string>;
};

declare global {
  interface Window {
    clovapiEnv?: ClovapiEnvBridge;
    clovapiCli?: CliBridge;
    clovapiDesktop?: DesktopBridge;
  }
}

export type VendorKind = "api" | "subscription" | "local";

export type ModelTestStatus = "testing" | "pass" | "fail";

export type ModelTestEntry = {
  status: ModelTestStatus;
  summary: string;
  detail: string;
  /** Unix timestamp (ms) when the test finished; used for 3h validity */
  testedAt?: number;
};

export type ActiveSelection = {
  provider_id?: string;
  model_id?: string;
  providerId?: string;
  modelId?: string;
};

export type ModelAdapterId = "manual" | "openai-compatible" | "ollama" | "subscription";

export type ModelAdapterDef = {
  id: ModelAdapterId;
  label: string;
  description: string;
};

export type ProviderDef = {
  id: string;
  vendorName: string;
  kind: VendorKind;
  subscriptionProviderId?: string;
  localProvider?: string;
};

/** OAuth 登录态（运行时从 auth 文件读取，不写入 profiles.json） */
export type SubscriptionItem = {
  id: string;
  label: string;
  installed: boolean;
  loggedIn: boolean;
  active?: boolean;
  summary: string;
};

export type SubscriptionAccount = {
  id: string;
  providerId: string;
  label: string;
  credentialRef: string;
  status?: string;
  plan?: string;
  models?: VendorModel[];
};

export type RouteBackend = {
  id: string;
  sourceType: string;
  sourceId?: string;
  sourceLabel?: string;
  providerId: string;
  modelId: string;
  upstreamModel: string;
  apiStyle: string;
  enabled: boolean;
  priority: number;
  weight: number;
};

export type VendorModel = {
  id: string;
  label: string;
  model: string;
  apiStyle: string;
  /** 自定义 API 供应商下每条模型自带连接 */
  baseUrl?: string;
  apiKey?: string;
};

export type VendorUsageQuery = {
  enabled?: boolean;
  templateType?: string;
  autoIntervalMinutes?: number;
};

export type VendorUsageData = {
  planName?: string;
  extra?: string;
  isValid?: boolean;
  invalidMessage?: string;
  total?: number;
  used?: number;
  remaining?: number;
  unit?: string;
};

export type VendorUsageResult = {
  ok?: boolean;
  vendor?: string;
  templateType?: string;
  text?: string;
  usage?: {
    success?: boolean;
    kind?: string;
    data?: VendorUsageData[];
    tiers?: { name: string; utilization: number; resetsAt?: string }[];
    error?: string;
  };
  error?: string;
};

export type VendorUsageCacheItem = {
  ok?: boolean;
  vendor?: string;
  vendorKind?: VendorKind | string;
  providerId?: string;
  sourceType?: string;
  sourceId?: string;
  cacheKey?: string;
  templateType?: string;
  text?: string;
  usage?: VendorUsageResult["usage"];
  error?: string;
  updatedAt?: string;
};

type VendorUsageCacheResult = {
  ok?: boolean;
  usages?: VendorUsageCacheItem[];
  updatedAt?: string;
  polling?: boolean;
  error?: string;
};

/** 供应商：远程 API（api）、本地 Ollama（local）、官方订阅（subscription） */
export type Vendor = {
  name: string;
  kind: VendorKind;
  localProvider: string;
  subscriptionProviderId: string;
  modelAdapter: ModelAdapterId;
  baseUrl: string;
  apiKey: string;
  usageQuery?: VendorUsageQuery;
  usage?: VendorUsageCacheItem;
  models: VendorModel[];
};

export type Preset = {
  id: string;
  apiName: string;
  baseUrl: string;
  apiStyle: string;
  defaultModel: string;
  modelAdapter?: ModelAdapterId;
};

export type SubscriptionVendorRow = SubscriptionItem & {
  vendor: Vendor;
  binding: string;
};

type ProfileTestPayload = {
  binding?: string;
  provider?: string;
  provider_id?: string;
  model?: string;
  model_id?: string;
  vendors?: Vendor[];
  proxy?: ProxyConfig;
};

type ListVendorModelsResult = {
  ok?: boolean;
  error?: string;
  adapterId?: ModelAdapterId;
  models?: VendorModel[];
  profiles?: Vendor[];
  subscriptionAccounts?: SubscriptionAccount[];
  source?: string;
  message?: string;
};

export type ModelListItem = {
  vendorName: string;
  vendorKind: VendorKind;
  providerId: string;
  modelId: string;
  label: string;
  apiStyle: string;
  proxyBaseUrl?: string;
};

type ModelListResult = {
  ok?: boolean;
  error?: string;
  models?: ModelListItem[];
};

type ModelAdaptersResult = {
  ok?: boolean;
  error?: string;
  adapters?: ModelAdapterDef[];
  providers?: ProviderDef[];
  fixedProviderIds?: string[];
};
