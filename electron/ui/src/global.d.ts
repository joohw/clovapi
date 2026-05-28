export {};

type CliBridge = {
  run(command: string, cwd: string, env: Record<string, string>): Promise<unknown>;
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
  which(command: string): Promise<{ exists?: boolean; path?: string }>;
  onOutput(callback: (payload: unknown) => void): () => void;
  onExit(callback: (payload: { code?: number | null }) => void): () => void;
};

type SubscriptionBridge = {
  status(): Promise<{ ok?: boolean; items?: SubscriptionItem[] }>;
  login(provider: string): Promise<{ ok?: boolean; cancelled?: boolean; error?: string }>;
  cancelLogin(provider: string): Promise<unknown>;
  logout(provider: string): Promise<ProfilesLoadResult>;
};

type ProfilesBridge = {
  load(): Promise<ProfilesLoadResult>;
  save(payload: {
    profiles: Vendor[];
    active: Record<string, ActiveSelection>;
    proxy?: ProxyConfig;
  }): Promise<ProfilesSaveResult>;
  test(payload: string | ProfileTestPayload): Promise<ProfileTestResult>;
  listModels(vendorName: string): Promise<ListVendorModelsResult>;
  queryUsage(vendorName: string): Promise<VendorUsageResult>;
  modelAdapters(): Promise<ModelAdaptersResult>;
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
  | { type: "open-tab"; tab: "cli" | "profiles" | "call-logs" | "sessions" | "system-logs" | "settings" }
  | { type: "open-profiles-vendor"; vendorName: string }
  | { type: "profiles-changed" }
  | { type: "proxy-status-changed" };

type DesktopBridge = {
  onAppEvent(callback: (payload: AppEventPayload) => void): () => void;
};

type ProxyConfig = {
  enabled?: boolean;
  host?: string;
  port?: number;
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
  request: {
    method: string;
    url: string;
    proto?: string;
    headers: Record<string, string>;
    body: string;
  };
  session?: string;
  sessionId?: string;
  sessionKind?: string;
  upstream: {
    method: string;
    url: string;
    requestHeaders?: Record<string, string>;
    status: number;
    headers: Record<string, string>;
    body: string;
  };
  error?: string;
};

export type ProxySystemLogEntry = {
  id: string;
  at: string;
  stream: string;
  message: string;
};

export type ProxyLogSession = {
  session: string;
  sessionId: string;
  sessionKind: string;
  entryCount: number;
  lastStartedAt: string;
  logIds: string[];
};

type ProxyLogsResult = {
  ok?: boolean;
  error?: string;
  requests?: ProxyLogEntry[];
  sessions?: ProxyLogSession[];
  system?: ProxySystemLogEntry[];
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
  active?: Record<string, ActiveSelection>;
  proxy?: ProxyConfig;
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
    clovapiSubscription?: SubscriptionBridge;
    clovapiProfiles?: ProfilesBridge;
    clovapiProxy?: ProxyBridge;
    clovapiProxyLogs?: ProxyLogsBridge;
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
  command?: string;
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
  usage?: {
    success?: boolean;
    kind?: string;
    data?: VendorUsageData[];
    tiers?: { name: string; utilization: number; resetsAt?: string }[];
    error?: string;
  };
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
  cli: string;
  usageQuery?: VendorUsageQuery;
  models: VendorModel[];
};

export type CliDef = {
  id: string;
  name: string;
  command: string;
  kind: string;
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
  cli?: string;
  vendors?: Vendor[];
  active?: Record<string, ActiveSelection>;
  proxy?: ProxyConfig;
};

type ListVendorModelsResult = {
  ok?: boolean;
  error?: string;
  adapterId?: ModelAdapterId;
  models?: VendorModel[];
  profiles?: Vendor[];
  source?: string;
  message?: string;
};

type ModelAdaptersResult = {
  ok?: boolean;
  error?: string;
  adapters?: ModelAdapterDef[];
  providers?: ProviderDef[];
  fixedProviderIds?: string[];
};
