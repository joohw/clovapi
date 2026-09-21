"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { Popover } from "@base-ui/react/popover";
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, Check, ChevronsUpDown, Copy,
  KeyRound, LayoutDashboard, LogOut, Network, Pause, Play,
  Plus, RefreshCw, Sun, Moon, Wallet, X,
} from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast-provider";
import type { AppLanguage } from "@/i18n/config";
import type { PlatformAction, PlatformErrorCode, PlatformResponse, PlatformState } from "@/lib/platform-types";
import { platformAPI, platformAPIOrigin, platformCredentials } from "@/lib/platform-api";
import { applyThemeMode, persistThemeMode } from "@/lib/theme";
import styles from "./platform-console.module.css";

type Section = "overview" | "keys" | "contributions" | "ledger";
type AuthUser = { id: string; email: string };
type AuthErrorCode = "invalid_email" | "rate_limited" | "mail_unavailable" | "mail_domain_unverified" | "mail_sandbox_restricted" | "mail_auth_failed" | "invalid_code" | "code_expired" | "unauthorized";
const COPY = {
  "zh-CN": {
    loading: "正在连接控制台…", backendError: "服务暂时不可用，请稍后重试。",
    signInTitle: "邮箱登录",
    email: "邮箱", emailPlaceholder: "you@example.com", sendCode: "发送验证码", authCode: "验证码", codePlaceholder: "6 位数字", verify: "登录控制台",
    codeSent: "验证码已发送，请检查邮箱。", changeEmail: "更换邮箱", logout: "退出登录",
    invalidEmail: "请输入有效的邮箱地址。", rateLimited: "验证码刚刚发送，请一分钟后再试。", mailUnavailable: "验证码发送失败，请稍后重试或联系支持。",
    mailDomainUnverified: "发信域名尚未验证，验证码未发送。请联系管理员在 Resend 完成域名验证，并检查发件人配置。",
    mailSandboxRestricted: "邮件服务当前仅允许向 Resend 账户邮箱发送测试邮件，验证码未发送。请联系管理员验证发信域名并更新发件人配置。",
    mailAuthFailed: "邮件服务密钥无效或权限不足，验证码未发送。请联系管理员检查 Resend API Key 及发信权限。",
    invalidCode: "验证码不正确，请重新输入。", codeExpired: "验证码已过期，请重新发送。", signedOut: "已退出登录。",
    welcome: "管理调用凭证与贡献节点。",
    overview: "概览", keys: "API Keys", contributions: "贡献节点", ledger: "积分记录",
    newDay: "概览", retry: "重新连接", console: "控制台",
    overviewNote: "查看账户状态，开始调用或共享模型。",
    activeKeys: "可用 API Keys", totalNodes: "贡献节点", todayRequests: "今日已派发", requestUnit: "次",
    callTitle: "调用模型", callBody: "创建 API Key，将你的应用连接到共享模型。",
    shareTitle: "贡献模型", shareBody: "连接本地 CLI，自动共享已配置的可用模型。",
    apiBase: "API Base URL", copyAddress: "复制地址", addressCopied: "API 地址已复制。",
    comingSoon: "积分结算尚未开放", creditNote: "开放后，已结算的贡献奖励与调用记录会显示在这里。",
    keysNote: "创建和管理应用调用凭证。", nodesNote: "连接本地 CLI，管理模型共享与请求上限。",
    freeTitle: "基础免费额度", creditTitle: "贡献积分",
    freeUnit: "额度", creditUnit: "积分", rules: "查看积分记录", manageKeys: "管理 API Keys",
    limits: "你的规则，始终优先",
    addNode: "连接本地 CLI", viewNodes: "管理贡献节点",
    keysTitle: "API Keys",
    keyName: "凭证名称", keyPlaceholder: "例如：生产服务", createKey: "创建 API Key", keyEmpty: "还没有 API Key",
    active: "可用", revoked: "已撤销", revoke: "撤销", copy: "复制 API Key", copied: "API Key 已复制。", copyFailed: "无法访问剪贴板，请手动复制。",
    keyCreated: "API Key 已创建。", keyRevoked: "API Key 已撤销。", itemLimit: "每个账户最多保留 8 条记录。",
    keyRevealTitle: "保存这个 API Key", keyRevealBody: "完整密钥仅显示一次，请妥善保存。",
    keyCreateNote: "为密钥取一个容易识别的名称，方便区分不同应用。", keyEmptyBody: "创建第一个 API Key，将应用连接到平台。",
    keyColumn: "密钥", statusColumn: "状态", createdColumn: "创建时间", actionsColumn: "操作",
    keyNameRequired: "请输入密钥名称。", creatingKey: "正在创建…", cancel: "取消", close: "关闭", keySaved: "已保存，完成",
    contributionsTitle: "贡献节点",
    budget: "每日请求上限", budgetNote: "按 UTC 每日重置；派发的请求均计数，包含失败请求。每个节点最多同时处理 5 个请求。",
    connectCLI: "连接本地 CLI",
    connectionKey: "连接密钥", accountChanged: "登录账号已变化，请刷新页面后重试。",
    copyCommands: "复制启动命令", commandsCopied: "启动命令已复制。", yourNodes: "我的节点", nodeEmpty: "还没有连接的 CLI", nodeEmptyBody: "首次连接后，设备和模型会自动显示在这里。",
    online: "在线", offline: "离线", paused: "已暂停", pause: "暂停", resume: "恢复",
    dailyUsed: "今日已派发", lastSeen: "最近连接", neverSeen: "尚未连接", nodePaused: "节点已暂停接收新请求。", nodeResumed: "节点已恢复，在线时可接收新请求。",
    nodeInvalid: "每日请求上限必须为 1–100,000 的整数。", saveLimit: "保存上限", limitSaved: "每日请求上限已更新。本地上限仍然生效。",
    models: "已同步模型", noModels: "等待 CLI 同步可用模型", disconnect: "断开连接", disconnected: "已断开", nodeDisconnected: "节点已断开。重新运行连接命令即可恢复。",
    reconnectHint: "在此设备重新运行带连接密钥的启动命令，即可恢复连接。", localLimitNote: "平台与 CLI 本地上限分别生效，任一侧达到上限即停止接收新请求。",
    betaNote: "共享调用测试中 · 免费额度与积分结算尚未开放",
    ledgerTitle: "积分记录",
    entry: "记录", when: "时间", freeChange: "免费额度变化", creditChange: "贡献积分变化", grant: "额度发放", consume: "调用结算", contribute: "贡献奖励",
    ledgerEmpty: "还没有积分记录",
  },
  en: {
    loading: "Connecting to the console…", backendError: "The service is temporarily unavailable. Try again later.",
    signInTitle: "Sign in with email",
    email: "Email", emailPlaceholder: "you@example.com", sendCode: "Send verification code", authCode: "Verification code", codePlaceholder: "6 digits", verify: "Sign in to console",
    codeSent: "Verification code sent. Check your inbox.", changeEmail: "Use another email", logout: "Sign out",
    invalidEmail: "Enter a valid email address.", rateLimited: "A code was just sent. Try again in one minute.", mailUnavailable: "The verification email could not be sent. Try again later or contact support.",
    mailDomainUnverified: "The sending domain is not verified. No code was sent. Ask the administrator to verify the domain in Resend and check the sender configuration.",
    mailSandboxRestricted: "The email service currently allows test emails only to the Resend account address. No code was sent. Ask the administrator to verify a sending domain and update the sender configuration.",
    mailAuthFailed: "The email service key is invalid or lacks permission. No code was sent. Ask the administrator to check the Resend API key and sending permissions.",
    invalidCode: "That code is incorrect. Try again.", codeExpired: "That code has expired. Send a new one.", signedOut: "You have signed out.",
    welcome: "Manage API keys and contribution nodes.",
    overview: "Overview", keys: "API Keys", contributions: "Nodes", ledger: "Credits",
    newDay: "Overview", retry: "Reconnect", console: "Console",
    overviewNote: "Check your account and start calling or sharing models.",
    activeKeys: "Active API keys", totalNodes: "Contribution nodes", todayRequests: "Dispatched today", requestUnit: "requests",
    callTitle: "Call a model", callBody: "Create an API key to connect your application to shared models.",
    shareTitle: "Contribute models", shareBody: "Connect your local CLI to automatically share configured models.",
    apiBase: "API Base URL", copyAddress: "Copy address", addressCopied: "API address copied.",
    comingSoon: "Credit settlement is coming later", creditNote: "Settled contribution rewards and usage will appear here when available.",
    keysNote: "Create and manage credentials for your applications.", nodesNote: "Connect your local CLI and manage model sharing limits.",
    freeTitle: "Free allowance", creditTitle: "Contribution credits",
    freeUnit: "units", creditUnit: "credits", rules: "View credit history", manageKeys: "Manage API keys",
    limits: "Your resources. Your rules.",
    addNode: "Connect local CLI", viewNodes: "Manage contribution nodes",
    keysTitle: "API Keys",
    keyName: "Credential name", keyPlaceholder: "e.g. Production service", createKey: "Create API key", keyEmpty: "No API keys yet",
    active: "Active", revoked: "Revoked", revoke: "Revoke", copy: "Copy API key", copied: "API key copied.", copyFailed: "Clipboard access is unavailable. Copy the key manually.",
    keyCreated: "API key created.", keyRevoked: "API key revoked.", itemLimit: "Each account can keep up to 8 records.",
    keyRevealTitle: "Save this API key", keyRevealBody: "The complete key is shown only once. Keep it somewhere safe.",
    keyCreateNote: "Give this key a recognizable name to identify the application using it.", keyEmptyBody: "Create your first API key to connect an application to the platform.",
    keyColumn: "Key", statusColumn: "Status", createdColumn: "Created", actionsColumn: "Actions",
    keyNameRequired: "Enter a name for this key.", creatingKey: "Creating…", cancel: "Cancel", close: "Close", keySaved: "Saved, done",
    contributionsTitle: "Contribution nodes",
    budget: "Daily request limit", budgetNote: "Resets daily at UTC midnight. Every dispatched request counts, including failures. Each node handles up to 5 requests at a time.",
    connectCLI: "Connect local CLI",
    connectionKey: "Connection key", accountChanged: "The signed-in account has changed. Refresh the page and try again.",
    copyCommands: "Copy start command", commandsCopied: "Start command copied.", yourNodes: "Your nodes", nodeEmpty: "No CLI connected yet", nodeEmptyBody: "Your device and models will appear here after the first connection.",
    online: "Online", offline: "Offline", paused: "Paused", pause: "Pause", resume: "Resume",
    dailyUsed: "Dispatched today", lastSeen: "Last connected", neverSeen: "Not connected yet", nodePaused: "The node is paused for new requests.", nodeResumed: "The node can accept new requests when it is online.",
    nodeInvalid: "Enter a daily request limit between 1 and 100,000.", saveLimit: "Save limit", limitSaved: "Daily request limit updated. The local limit still applies.",
    models: "Synced models", noModels: "Waiting for the CLI to sync available models", disconnect: "Disconnect", disconnected: "Disconnected", nodeDisconnected: "Node disconnected. Run the connection command again to reconnect.",
    reconnectHint: "Run the start command with your connection key on this device to reconnect.", localLimitNote: "The platform and CLI enforce separate limits. Reaching either limit stops new requests.",
    betaNote: "Shared calls are in beta · Free grants and credit settlement are not available yet",
    ledgerTitle: "Credit history",
    entry: "Entry", when: "Time", freeChange: "Free allowance change", creditChange: "Contribution credit change", grant: "Allowance issued", consume: "API settlement", contribute: "Contribution reward",
    ledgerEmpty: "No credit history yet",
  },
} satisfies Record<AppLanguage, Record<string, string>>;

export function PlatformConsole({ language, initialSection = "overview" }: { language: AppLanguage; initialSection?: Section }) {
  const c = COPY[language];
  const { showSuccess, showError } = useToast();
  const [state, setState] = useState<PlatformState | null>(null);
  const [authStatus, setAuthStatus] = useState<"loading" | "guest" | "authenticated">("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [section, setSection] = useState<Section>(initialSection);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const keyCreating = useRef(false);
  const keyNameInput = useRef<HTMLInputElement>(null);
  const keyValueInput = useRef<HTMLInputElement>(null);
  const [platformOrigin, setPlatformOrigin] = useState("");
  const [connectionAttempt, setConnectionAttempt] = useState(0);
  const format = (value: number) => value.toLocaleString(language);
  const sectionLabels = { overview: c.overview, keys: c.keys, contributions: c.contributions, ledger: c.ledger };
  const icons = { overview: LayoutDashboard, keys: KeyRound, contributions: Network, ledger: Wallet };
  const reloadAccount = useCallback(() => {
    setState(null);
    setUser(null);
    setCreatedKey(null);
    setKeyDialogOpen(false);
    setAuthStatus("loading");
    setConnectionAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setMessage("");
    setAuthStatus("loading");
    fetch(platformAPI("/api/auth/session"), { cache: "no-store", credentials: platformCredentials })
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok) throw new Error("Session unavailable");
        const auth = await response.json() as { ok: true; user: AuthUser };
        const platformResponse = await fetch(platformAPI("/api/platform"), { cache: "no-store", credentials: platformCredentials });
        const platform = await platformResponse.json() as PlatformResponse;
        return { auth, platform };
      })
      .then((result) => {
        if (!active) return;
        setPlatformOrigin(platformAPIOrigin());
        if (!result) { setAuthStatus("guest"); return; }
        if (result.platform.ok && result.platform.state.userId !== result.auth.user.id) { reloadAccount(); return; }
        setUser(result.auth.user);
        setAuthStatus("authenticated");
        if (result.platform.ok) setState(result.platform.state);
        else setMessage(c.backendError);
      })
      .catch(() => { if (active) setMessage(c.backendError); });
    return () => { active = false; };
  }, [c.backendError, connectionAttempt, reloadAccount]);

  useEffect(() => {
    const syncSection = () => {
      const tab = new URL(window.location.href).searchParams.get("tab");
      setSection(tab === "keys" ? "keys" : tab === "contribute" || tab === "contributions" ? "contributions" : tab === "ledger" ? "ledger" : "overview");
      setMessage("");
      setCreatedKey(null);
      setKeyDialogOpen(false);
    };
    syncSection();
    window.addEventListener("popstate", syncSection);
    return () => window.removeEventListener("popstate", syncSection);
  }, []);

  useEffect(() => {
    if (createdKey && keyDialogOpen) keyValueInput.current?.focus();
  }, [createdKey, keyDialogOpen]);

  useEffect(() => {
    if (authStatus !== "authenticated" || (section !== "contributions" && section !== "overview") || busy) return;
    let active = true;
    const controller = new AbortController();
    const timer = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(platformAPI("/api/platform"), { cache: "no-store", credentials: platformCredentials, signal: controller.signal });
        const payload = await response.json() as PlatformResponse;
        if (!active) return;
        if (!payload.ok) {
          if (payload.error === "unauthorized") reloadAccount();
          return;
        }
        if (payload.state.userId !== user?.id) { reloadAccount(); return; }
        setState(payload.state);
      } catch { /* Keep the last known state when a refresh fails. */ }
    }, 5_000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [authStatus, section, busy, user?.id, reloadAccount]);

  useEffect(() => {
    if (authStatus !== "authenticated" || section !== "contributions" || !user || state?.userId !== user.id || state.cliKey?.key) return;
    let active = true;
    const controller = new AbortController();
    const expectedUserId = user.id;
    let attempts = 0;
    let retryTimer: number | undefined;
    function retry() {
      if (!active) return;
      if (attempts < 3) retryTimer = window.setTimeout(ensureKey, 1_000 * 2 ** (attempts - 1));
      else setMessage(c.backendError);
    }
    async function ensureKey() {
      attempts += 1;
      try {
        const response = await fetch(platformAPI("/api/platform"), {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "ensure_cli_key", expectedUserId }), credentials: platformCredentials, signal: controller.signal,
        });
        const payload = await response.json() as PlatformResponse;
        if (!active) return;
        if (!payload.ok) {
          if (payload.error === "unauthorized" || payload.error === "account_changed") reloadAccount();
          else if (payload.error === "backend_error") retry();
          else setMessage(c.backendError);
          return;
        }
        if (payload.state.userId !== expectedUserId) { reloadAccount(); return; }
        setState(payload.state);
      } catch { retry(); }
    }
    void ensureKey();
    return () => {
      active = false;
      controller.abort();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [authStatus, section, user, state?.userId, state?.cliKey?.key, c.backendError, reloadAccount]);

  function authMessage(error: AuthErrorCode) {
    if (error === "invalid_email") return c.invalidEmail;
    if (error === "rate_limited") return c.rateLimited;
    if (error === "mail_unavailable") return c.mailUnavailable;
    if (error === "mail_domain_unverified") return c.mailDomainUnverified;
    if (error === "mail_sandbox_restricted") return c.mailSandboxRestricted;
    if (error === "mail_auth_failed") return c.mailAuthFailed;
    if (error === "invalid_code") return c.invalidCode;
    if (error === "code_expired") return c.codeExpired;
    return c.backendError;
  }

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim().toLowerCase();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(platformAPI("/api/auth/code"), {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }), credentials: platformCredentials,
      });
      const result = await response.json() as { ok: boolean; error?: AuthErrorCode };
      if (!result.ok) { setMessage(authMessage(result.error ?? "mail_unavailable")); return; }
      setLoginEmail(email);
      setAwaitingCode(true);
      setMessage(c.codeSent);
    } catch {
      setMessage(c.backendError);
    } finally {
      setBusy(false);
    }
  }

  async function completeSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(platformAPI("/api/auth/verify"), {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: loginEmail, code }), credentials: platformCredentials,
      });
      const result = await response.json() as { ok: boolean; error?: AuthErrorCode; user?: AuthUser };
      if (!result.ok || !result.user) { setMessage(authMessage(result.error ?? "invalid_code")); return; }
      setUser(result.user);
      setState(null);
      setAuthStatus("authenticated");
      const platformResponse = await fetch(platformAPI("/api/platform"), { cache: "no-store", credentials: platformCredentials });
      const platform = await platformResponse.json() as PlatformResponse;
      if (!platform.ok) { setMessage(c.backendError); return; }
      if (platform.state.userId !== result.user.id) { reloadAccount(); return; }
      setState(platform.state);
      setMessage("");
    } catch {
      setMessage(c.backendError);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try { await fetch(platformAPI("/api/auth/logout"), { method: "POST", credentials: platformCredentials }); } catch { /* Local state still clears below. */ }
    setUser(null);
    setState(null);
    setAuthStatus("guest");
    setAwaitingCode(false);
    setLoginEmail("");
    setCreatedKey(null);
    setKeyDialogOpen(false);
    setMessage(c.signedOut);
    setBusy(false);
  }

  function moveTo(next: Section) {
    if (next !== section) {
      const url = new URL(window.location.href);
      if (next === "overview") url.searchParams.delete("tab");
      else url.searchParams.set("tab", next === "contributions" ? "contribute" : next);
      window.history.pushState(null, "", url);
    }
    setSection(next);
    setMessage("");
    setCreatedKey(null);
    setKeyDialogOpen(false);
  }

  function domainMessage(error: PlatformErrorCode) {
    if (error === "item_limit") return c.itemLimit;
    if (error === "invalid_request") return c.nodeInvalid;
    if (error === "account_changed") return c.accountChanged;
    return c.backendError;
  }

  async function mutate(action: PlatformAction) {
    setBusy(true);
    try {
      const response = await fetch(platformAPI("/api/platform"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action),
        credentials: platformCredentials,
      });
      const payload = await response.json() as PlatformResponse;
      if (!payload.ok) {
        if (payload.error === "unauthorized") {
          setAuthStatus("guest");
          setUser(null);
          setState(null);
          setCreatedKey(null);
          setKeyDialogOpen(false);
        }
        setMessage(domainMessage(payload.error));
        return null;
      }
      if (payload.state.userId !== user?.id) { reloadAccount(); return null; }
      setState(payload.state);
      return payload;
    } catch {
      setMessage(c.backendError);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (keyCreating.current || busy || createdKey) return;
    const name = keyName.trim();
    if (!name) { setMessage(c.keyNameRequired); return; }
    keyCreating.current = true;
    setMessage("");
    try {
      const response = await mutate({ action: "create_key", name });
      if (response?.createdKey) {
        setCreatedKey(response.createdKey);
        setMessage("");
      }
    } finally {
      keyCreating.current = false;
    }
  }

  async function revokeKey(id: string) {
    if (await mutate({ action: "revoke_key", id })) setMessage(c.keyRevoked);
  }

  async function copyKey(value: string, success: string = c.copied) {
    try { await navigator.clipboard.writeText(value); setMessage(success); }
    catch { setMessage(c.copyFailed); }
  }

  async function copyConnectionCommand() {
    setMessage("");
    try { await navigator.clipboard.writeText(shareCommand); showSuccess(c.commandsCopied); }
    catch { showError(c.copyFailed); }
  }

  async function updateNodeLimit(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const budget = Number(form.get("budget"));
    if (!Number.isSafeInteger(budget) || budget < 1 || budget > 100_000) {
      setMessage(c.nodeInvalid); return;
    }
    if (await mutate({ action: "update_node", id, budget })) setMessage(c.limitSaved);
  }

  async function toggleNode(id: string) {
    const node = state?.nodes.find((item) => item.id === id);
    if (!node) return;
    if (await mutate({ action: "toggle_node", id })) setMessage(node.paused ? c.nodeResumed : c.nodePaused);
  }

  async function disconnectNode(id: string) {
    if (await mutate({ action: "revoke_node_key", id })) setMessage(c.nodeDisconnected);
  }

  const shareCommand = state?.cliKey?.key ? `clovapi share start --key ${state.cliKey.key}` : "";

  if (authStatus === "loading" || (authStatus === "authenticated" && !state)) {
    return <div className={styles.console}>
      <div className={styles.loginBar}><ConsoleBrand language={language} /><ConsoleTools language={language} section={section} /></div>
      <div className={styles.loading} role="status">
        <p>{message || c.loading}</p>
        {message && <button type="button" className={styles.secondaryButton} onClick={() => setConnectionAttempt((attempt) => attempt + 1)}><RefreshCw size={16} aria-hidden="true" />{c.retry}</button>}
      </div>
    </div>;
  }

  if (authStatus === "guest") {
    return (
      <div className={styles.console} aria-busy={busy}>
        <div className={styles.loginBar}><ConsoleBrand language={language} /><ConsoleTools language={language} section={section} /></div>
        <div className={styles.onboarding}>
          <div className={styles.startCard}>
            <h1>{c.signInTitle}</h1>
            <p>{c.welcome}</p>
            {!awaitingCode ? <form onSubmit={requestCode} className={styles.form}>
              <label htmlFor="login-email">{c.email}</label>
              <input id="login-email" name="email" type="email" required maxLength={254} placeholder={c.emailPlaceholder} autoComplete="email" />
              <button type="submit" className={styles.primaryButton} disabled={busy}>{c.sendCode}<ArrowRight size={17} aria-hidden="true" /></button>
            </form> : <form onSubmit={completeSignIn} className={styles.form}>
              <div className={styles.emailSummary}><strong>{loginEmail}</strong></div>
              <label htmlFor="login-code">{c.authCode}</label>
              <input id="login-code" name="code" type="text" required minLength={6} maxLength={6} pattern="[0-9]{6}" inputMode="numeric" placeholder={c.codePlaceholder} autoComplete="one-time-code" />
              <button type="submit" className={styles.primaryButton} disabled={busy}>{c.verify}<ArrowRight size={17} aria-hidden="true" /></button>
              <button type="button" className={styles.textLink} onClick={() => { setAwaitingCode(false); setMessage(""); }}>{c.changeEmail}</button>
            </form>}
            {message && <div className={styles.loginStatus} role="status" aria-live="polite">{message}</div>}
          </div>
        </div>
      </div>
    );
  }

  if (!state) return null;

  return (
    <div className={styles.console} aria-busy={busy}>
      <div className={styles.shell}>
        <aside className={styles.sidebar}>
          <ConsoleBrand language={language} />
          <nav aria-label={language === "en" ? "Console sections" : "控制台导航"} className={styles.navigation}>
            {(Object.keys(sectionLabels) as Section[]).map((key) => {
              const Icon = icons[key];
              return <button key={key} type="button" aria-current={section === key ? "page" : undefined} onClick={() => moveTo(key)} className={section === key ? styles.navActive : styles.navButton}><Icon size={18} aria-hidden="true" /><span>{sectionLabels[key]}</span></button>;
            })}
          </nav>
          <div className={styles.sidebarFooter}>
            <Popover.Root>
              <Popover.Trigger className={styles.accountIdentity} aria-label={`${language === "en" ? "Account menu" : "账户菜单"}: ${user?.email ?? ""}`} title={user?.email}>
                <span className={styles.accountAvatar} aria-hidden="true">{(user?.email ?? "C").slice(0, 1).toUpperCase()}</span>
                <strong>{user?.email}</strong>
                <ChevronsUpDown size={14} aria-hidden="true" />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner className={styles.accountMenuPositioner} side="top" align="start" sideOffset={8} collisionPadding={12}>
                  <Popover.Popup className={styles.accountPopover}>
                    <div className={styles.accountMenuHeader}>
                      <Popover.Title>{language === "en" ? "Account" : "账户"}</Popover.Title>
                      <Popover.Description>{user?.email}</Popover.Description>
                    </div>
                    <ConsoleThemeToggle language={language} showLabel />
                    <button type="button" className={styles.accountAction} onClick={logout} disabled={busy}><LogOut size={16} aria-hidden="true" /><span>{c.logout}</span></button>
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          </div>
        </aside>

        <div className={styles.content}>
          <Dialog open={keyDialogOpen} disablePointerDismissal={busy || Boolean(createdKey)} onOpenChange={(open, details) => {
            if (!open && keyCreating.current) { details.cancel(); return; }
            setKeyDialogOpen(open);
            setCreatedKey(null);
            setKeyName("");
            setMessage("");
          }}>
          <header className={`${styles.pageHeading} ${section === "keys" ? styles.keysHeading : ""}`}>
            <div>
            <h1>{section === "overview" ? c.newDay : section === "keys" ? c.keysTitle : section === "contributions" ? c.contributionsTitle : c.ledgerTitle}</h1>
            {section !== "ledger" && <p>{section === "overview" ? c.overviewNote : section === "keys" ? c.keysNote : c.nodesNote}</p>}
            </div>
            {section === "keys" && <DialogTrigger className={styles.primaryButton} disabled={busy}><Plus size={16} aria-hidden="true" />{c.createKey}</DialogTrigger>}
          </header>
          <DialogContent className={styles.keyDialog} showCloseButton={false} initialFocus={keyNameInput} aria-busy={busy}>
            <div className={styles.keyDialogHeader}>
              <span className={styles.keyDialogIcon}>{createdKey ? <Check size={21} aria-hidden="true" /> : <KeyRound size={21} aria-hidden="true" />}</span>
              <DialogTitle className={styles.keyDialogTitle}>{createdKey ? c.keyRevealTitle : c.createKey}</DialogTitle>
              <DialogDescription className={styles.keyDialogDescription}>{createdKey ? c.keyRevealBody : c.keyCreateNote}</DialogDescription>
            </div>
            {!createdKey && <DialogClose className={styles.keyDialogClose} disabled={busy} aria-label={c.close}><X size={18} aria-hidden="true" /></DialogClose>}
            {createdKey ? <>
              <div className={styles.keySecret}>
                <label htmlFor="created-api-key">{keyName.trim()}</label>
                <div><input ref={keyValueInput} id="created-api-key" aria-label="API Key" readOnly value={createdKey} spellCheck={false} onFocus={(event) => event.currentTarget.select()} /><button type="button" className={styles.iconButton} aria-label={c.copy} title={c.copy} onClick={() => copyKey(createdKey)}>{message === c.copied ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}</button></div>
              </div>
              <div className={styles.keyDialogMessage} role="status" aria-live="polite">{message}</div>
              <div className={styles.keyDialogFooter}><DialogClose className={styles.primaryButton}>{c.keySaved}</DialogClose></div>
            </> : <form className={styles.form} onSubmit={createKey}>
              <label htmlFor="key-name">{c.keyName}</label>
              <input ref={keyNameInput} id="key-name" name="keyName" required maxLength={36} placeholder={c.keyPlaceholder} autoComplete="off" value={keyName} onChange={(event) => setKeyName(event.target.value)} disabled={busy} />
              <div className={styles.keyDialogMessage} role="status" aria-live="polite">{message}</div>
              <div className={styles.keyDialogFooter}><DialogClose className={styles.secondaryButton} disabled={busy}>{c.cancel}</DialogClose><button type="submit" className={styles.primaryButton} disabled={busy || !keyName.trim()}>{busy ? c.creatingKey : c.createKey}</button></div>
            </form>}
          </DialogContent>
          </Dialog>

          {message && !keyDialogOpen && <div className={styles.status} role="status" aria-live="polite">{message}</div>}

          {section === "overview" && <>
            <div className={styles.statsGrid}>
              <section className={styles.statCard}><span>{c.activeKeys}</span><strong>{format(state.keys.filter((key) => !key.revoked).length)}</strong></section>
              <section className={styles.statCard}><span>{c.totalNodes}</span><strong>{format(state.nodes.length)}</strong></section>
              <section className={styles.statCard}><span>{c.todayRequests}</span><strong>{format(state.nodes.reduce((total, node) => total + node.used, 0))}<small>{c.requestUnit}</small></strong></section>
            </div>
            <div className={styles.actionGrid}>
              <section className={styles.actionCard}>
                <span className={styles.keyIcon}><KeyRound size={19} aria-hidden="true" /></span><h2>{c.callTitle}</h2><p>{c.callBody}</p>
                <button type="button" className={styles.primaryButton} onClick={() => moveTo("keys")}>{c.manageKeys}<ArrowRight size={16} aria-hidden="true" /></button>
              </section>
              <section className={styles.actionCard}>
                <span className={styles.keyIcon}><Network size={19} aria-hidden="true" /></span><h2>{c.shareTitle}</h2><p>{c.shareBody}</p>
                <button type="button" className={styles.secondaryButton} onClick={() => moveTo("contributions")}>{state.nodes.length ? c.viewNodes : c.addNode}<ArrowRight size={16} aria-hidden="true" /></button>
              </section>
            </div>
            <section className={styles.endpointCard}><div><span>{c.apiBase}</span><code>{platformOrigin}/v1</code></div><button type="button" className={styles.smallButton} onClick={() => copyKey(`${platformOrigin}/v1`, c.addressCopied)}><Copy size={15} aria-hidden="true" />{c.copyAddress}</button></section>
            <p className={styles.featureNote}>{c.betaNote}</p>
          </>}

          {section === "keys" && <section className={styles.keysPanel} aria-label={c.keysTitle}>
            {state.keys.length === 0 ? <div className={styles.keysEmpty}><EmptyState icon="key" title={c.keyEmpty} description={c.keyEmptyBody} /></div> : <>
              <table className={styles.keysTable}>
                <thead><tr><th scope="col">{c.keyName}</th><th scope="col">{c.keyColumn}</th><th scope="col">{c.statusColumn}</th><th scope="col">{c.createdColumn}</th><th scope="col"><span className="sr-only">{c.actionsColumn}</span></th></tr></thead>
                <tbody>{state.keys.map((key) => <tr key={key.id}>
                  <td className={styles.keyNameCell}><div><span className={styles.keyIcon}><KeyRound size={17} aria-hidden="true" /></span><strong>{key.name}</strong></div></td>
                  <td className={styles.keyPrefixCell}><code>{key.prefix}</code></td>
                  <td className={styles.keyStatusCell}><span className={key.revoked ? styles.mutedPill : styles.activePill}>{key.revoked ? c.revoked : c.active}</span></td>
                  <td className={styles.keyDateCell}><time dateTime={key.createdAt}>{new Date(key.createdAt).toLocaleDateString(language, { year: "numeric", month: "short", day: "numeric" })}</time></td>
                  <td className={styles.keyActionCell}><button type="button" className={styles.smallButton} onClick={() => revokeKey(key.id)} disabled={busy || key.revoked} aria-label={`${c.revoke} ${key.name}`}>{c.revoke}</button></td>
                </tr>)}</tbody>
              </table>
              <div className={styles.keysSummary}>{language === "en" ? `${format(state.keys.length)} total · ${format(state.keys.filter((key) => !key.revoked).length)} active` : `共 ${format(state.keys.length)} 个密钥 · ${format(state.keys.filter((key) => !key.revoked).length)} 个可用`}</div>
            </>}
          </section>}

          {section === "contributions" && <div className={styles.contributionLayout}>
            <section className={styles.panel}>
              <div className={styles.panelHeading}><h2>{c.connectCLI}</h2></div>
              <div className={styles.connectionKeyControls}>
                <label htmlFor="cli-connection-command">{c.connectionKey}</label>
              </div>
              <div className={styles.connectionCommand}>
                <input id="cli-connection-command" type="text" readOnly value={shareCommand} autoComplete="off" spellCheck={false} onFocus={(event) => event.currentTarget.select()} />
                <button type="button" className={styles.primaryButton} onClick={copyConnectionCommand} disabled={busy || !shareCommand}><Copy size={15} aria-hidden="true" />{c.copyCommands}</button>
              </div>
            </section>
            <section className={styles.nodeSection}><div className={styles.panelHeading}><h2>{c.yourNodes}</h2><p>{c.budgetNote} {c.localLimitNote}</p></div>{state.nodes.length === 0 ? <div className={styles.panel}><EmptyState icon="node" title={c.nodeEmpty} description={c.nodeEmptyBody} /></div> : <div className={styles.nodeList}>{state.nodes.map((node) => {
              const used = node.used;
              return <article className={styles.nodeCard} key={node.id}>
                <div className={styles.nodeHeader}>
                  <span className={styles.keyIcon}><Network size={19} aria-hidden="true" /></span>
                  <div><h3>{node.name}</h3><p>{c.lastSeen}: {node.lastSeenAt ? new Date(node.lastSeenAt).toLocaleString(language) : c.neverSeen}</p></div>
                  <div className={styles.nodeState}>
                    <span className={node.online ? styles.activePill : styles.mutedPill}>{node.keyRevoked ? c.disconnected : node.online ? c.online : c.offline}</span>
                    {node.paused && <span className={styles.mutedPill}>{c.paused}</span>}
                  </div>
                </div>
                <div className={styles.nodeModels}><span>{c.models}</span>{node.models.length > 0 ? <ul>{node.models.map((model) => <li key={model}><code>{model}</code></li>)}</ul> : <p>{c.noModels}</p>}</div>
                <div className={styles.nodeMetrics}><div><span>{c.dailyUsed}</span><strong>{format(used)} / {format(node.budget)}</strong></div></div>
                <div className={styles.nodeMeter}><span style={{ width: `${Math.min(100, node.budget ? used / node.budget * 100 : 0)}%` }} /></div>
                <form className={`${styles.inlineForm} ${styles.nodeLimitForm}`} onSubmit={(event) => updateNodeLimit(node.id, event)}>
                  <div className={styles.form}><label htmlFor={`budget-${node.id}`}>{c.budget}</label><input key={`${node.id}-${node.budget}`} id={`budget-${node.id}`} name="budget" type="number" required min="1" max="100000" step="1" defaultValue={node.budget} disabled={busy || node.keyRevoked} /></div>
                  <button type="submit" className={styles.secondaryButton} disabled={busy || node.keyRevoked}>{c.saveLimit}</button>
                </form>
                <div className={styles.nodeActions}>
                  <button type="button" className={styles.smallButton} onClick={() => toggleNode(node.id)} disabled={busy || node.keyRevoked}>{node.paused ? <Play size={13} aria-hidden="true" /> : <Pause size={13} aria-hidden="true" />}{node.paused ? c.resume : c.pause}</button>
                  <button type="button" className={styles.smallButton} onClick={() => disconnectNode(node.id)} disabled={busy || node.keyRevoked}>{c.disconnect}</button>
                </div>
                {node.keyRevoked && <p className={styles.formNote}>{c.reconnectHint}</p>}
              </article>;
            })}</div>}</section>
          </div>}

          {section === "ledger" && <section className={styles.panel}>
            {state.entries.length === 0 ? <EmptyState icon="ledger" title={c.comingSoon} description={c.creditNote} /> : <>
              <div className={styles.ledgerBalances}><span>{c.freeTitle}<strong>{format(state.free)}</strong></span><span>{c.creditTitle}<strong>{format(state.credits)}</strong></span></div>
              <div className={styles.tableScroll}><table className={styles.ledgerTable}><thead><tr><th>{c.entry}</th><th>{c.when}</th><th>{c.freeChange}</th><th>{c.creditChange}</th></tr></thead><tbody>{state.entries.map((entry) => <tr key={entry.id}><td><span className={styles.entryLabel}>{entry.kind === "consume" ? <ArrowUpRight size={17} aria-hidden="true" /> : <ArrowDownLeft size={17} aria-hidden="true" />}<strong>{c[entry.kind]}</strong></span></td><td>{new Date(entry.at).toLocaleString(language, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td><td className={entry.freeDelta > 0 ? styles.positive : undefined}>{entry.freeDelta > 0 ? "+" : ""}{format(entry.freeDelta)}</td><td className={entry.creditDelta > 0 ? styles.positive : undefined}>{entry.creditDelta > 0 ? "+" : ""}{format(entry.creditDelta)}</td></tr>)}</tbody></table></div>
            </>}
          </section>}
        </div>
      </div>
    </div>
  );
}

function ConsoleBrand({ language }: { language: AppLanguage }) {
  return <Link href={`/${language}`} className={styles.brand} aria-label={language === "en" ? "Clovapi home" : "Clovapi 首页"}><strong>CLOVAPI</strong><span>{COPY[language].console}</span></Link>;
}

function ConsoleTools({ language, section }: { language: AppLanguage; section: Section }) {
  const otherLanguage = language === "en" ? "zh-CN" : "en";
  const query = section === "overview" ? "" : `?tab=${section === "contributions" ? "contribute" : section}`;
  return <div className={styles.tools}>
    <Link href={`/${otherLanguage}/console${query}`} className={styles.toolButton} aria-label={language === "en" ? "切换到中文" : "Switch to English"}>{language === "en" ? "中" : "EN"}</Link>
    <ConsoleThemeToggle language={language} />
  </div>;
}

function ConsoleThemeToggle({ language, showLabel = false }: { language: AppLanguage; showLabel?: boolean }) {
  const label = language === "en" ? "Toggle theme" : "切换主题";
  function toggleTheme() {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    applyThemeMode(next);
    persistThemeMode(next);
  }
  return <button type="button" className={showLabel ? styles.accountAction : styles.toolButton} onClick={toggleTheme} aria-label={label} title={label}><Sun className={styles.sun} size={17} aria-hidden="true" /><Moon className={styles.moon} size={17} aria-hidden="true" />{showLabel && <span>{label}</span>}</button>;
}

function EmptyState({ icon, title, description }: { icon: "key" | "node" | "ledger"; title: string; description?: string }) {
  const Icon = icon === "key" ? KeyRound : icon === "node" ? Network : Wallet;
  return <div className={styles.emptyState}><span><Icon size={24} aria-hidden="true" /></span><h3>{title}</h3>{description && <p>{description}</p>}</div>;
}
