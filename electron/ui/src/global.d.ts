export {};

type CliBridge = {
  run(command: string, cwd: string, env: Record<string, string>): Promise<unknown>;
  runClovapi(args: string[], cwd: string): Promise<{ ok?: boolean; error?: string }>;
  stop(): Promise<unknown>;
  state(): Promise<{ running?: boolean }>;
  defaultCwd(): Promise<{ cwd?: string }>;
  toolStatus(): Promise<{ available?: boolean }>;
  which(command: string): Promise<{ exists?: boolean; path?: string }>;
  onOutput(callback: (payload: unknown) => void): () => void;
  onExit(callback: (payload: { code?: number | null }) => void): () => void;
};

type SubscriptionBridge = {
  status(): Promise<{ ok?: boolean; items?: SubscriptionItem[] }>;
  login(provider: string): Promise<{ ok?: boolean; cancelled?: boolean; error?: string }>;
  cancelLogin(provider: string): Promise<unknown>;
  claudeProfile(targetCli: string): Promise<BuildProfileResult>;
  buildProfile(provider: string, targetCli: string): Promise<BuildProfileResult>;
  logout(provider: string): Promise<{ ok?: boolean; error?: string }>;
};

type ProfilesBridge = {
  load(): Promise<ProfilesLoadResult>;
  save(payload: {
    profiles: Vendor[];
    active: Record<string, string>;
    proxy?: ProxyConfig;
  }): Promise<ProfilesSaveResult>;
  test(payload: string | ProfileTestPayload): Promise<ProfileTestResult>;
  listModels(vendorName: string): Promise<ListVendorModelsResult>;
  modelAdapters(): Promise<ModelAdaptersResult>;
};

type ProxyBridge = {
  status(): Promise<ProxyStatusResult>;
  start(port?: number): Promise<ProxyStatusResult>;
  stop(): Promise<{ ok?: boolean; error?: string }>;
  ensureStub(cliKind: string, binding: string): Promise<{
    ok?: boolean;
    error?: string;
    stubName?: string;
    port?: number;
    apiStyle?: string;
  }>;
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
  port?: number;
  host?: string;
  baseUrl?: string;
  config?: ProxyConfig;
};

type BuildProfileResult = {
  ok?: boolean;
  error?: string;
  profile?: {
    name: string;
    base_url?: string;
    baseUrl?: string;
    api_key?: string;
    apiKey?: string;
    model?: string;
    api_style?: string;
    apiStyle?: string;
    cli?: string;
  };
};

type ProfilesLoadResult = {
  ok?: boolean;
  error?: string;
  profiles?: Vendor[];
  active?: Record<string, string>;
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

declare global {
  interface Window {
    clovapiCli?: CliBridge;
    clovapiSubscription?: SubscriptionBridge;
    clovapiProfiles?: ProfilesBridge;
    clovapiProxy?: ProxyBridge;
  }
}

export type VendorKind = "api" | "subscription" | "local";

export type ModelTestStatus = "testing" | "pass" | "fail";

export type ModelTestEntry = {
  status: ModelTestStatus;
  summary: string;
  detail: string;
};

export type ModelAdapterId = "manual" | "openai-compatible" | "ollama" | "subscription";

export type ModelAdapterDef = {
  id: ModelAdapterId;
  label: string;
  description: string;
};

/** OAuth 登录态（运行时从 auth 文件读取，不写入 profiles.json） */
export type SubscriptionItem = {
  id: string;
  label: string;
  installed: boolean;
  loggedIn: boolean;
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
  binding: string;
  vendors?: Vendor[];
  active?: Record<string, string>;
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
  adapters?: ModelAdapterDef[];
};
