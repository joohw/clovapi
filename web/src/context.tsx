import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { initializeAPI, type Info } from './api';
import type { ManagementAPI, ModelListItem, ProfilesLoadResult, ProxyStatusResult, SubscriptionItem } from './types';
import { normalizeConfiguration, type Configuration } from './domain';
import { Button } from './components/ui/button';

type Locale = 'zh' | 'en';
type Toast = { id: number; message: string; error?: boolean };
export function checked<T extends { ok?: boolean; error?: string }>(result: T): T {
  if (!result.ok) throw new Error(result.error || 'Request failed');
  return result;
}

function useAppState(api: ManagementAPI, info: Info) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try { return localStorage.getItem('clovapi-locale') === 'en' ? 'en' : 'zh'; } catch { return 'zh'; }
  });
  const tr = useCallback((zh: string, en: string) => locale === 'zh' ? zh : en, [locale]);
  const setLocale = (value: Locale) => { setLocaleState(value); try { localStorage.setItem('clovapi-locale', value); } catch {} };
  const [config, setConfig] = useState<Configuration>(normalizeConfiguration({}));
  const [models, setModels] = useState<ModelListItem[]>([]);
  const [status, setStatus] = useState<ProxyStatusResult>({});
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const busyRef = useRef(new Set<string>());
  const mutationTail = useRef<Promise<void>>(Promise.resolve());
  const refreshing = useRef<Promise<void> | null>(null);
  const notify = useCallback((message: string, error = false) => setToast({ id: Date.now(), message, error }), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 6000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'; }, [locale]);

  const refresh = useCallback((): Promise<void> => {
    if (refreshing.current) return refreshing.current;
    refreshing.current = (async () => {
      const [profiles, modelList, proxy, auth] = await Promise.all([api.profilesLoad(), api.profilesModels(), api.proxyStatus(), api.authStatus()]);
      setConfig(normalizeConfiguration(checked(profiles)));
      setModels(checked(modelList).models || []);
      setStatus(checked(proxy));
      setSubscriptions(checked(auth).items || []);
      setError('');
    })().catch(error => { setError(error.message); throw error; }).finally(() => { refreshing.current = null; setLoading(false); });
    return refreshing.current;
  }, [api]);

  useEffect(() => {
    void refresh().catch(() => {});
    let active = true;
    const timer = setInterval(() => { if (document.hidden) return; void api.proxyStatus().then(value => { if (active) setStatus(value.ok ? value : { running: false, error: value.error }); }); }, 10000);
    const modelTimer = setInterval(() => { if (!document.hidden) void refresh().catch(() => {}); }, 60000);
    return () => { active = false; clearInterval(timer); clearInterval(modelTimer); };
  }, [api, refresh]);

  const run = async (key: string, operation: () => Promise<void>, success?: string): Promise<boolean> => {
    if (busyRef.current.has(key)) return false;
    busyRef.current.add(key); setBusy(new Set(busyRef.current));
    try { await operation(); if (success) notify(success); return true; }
    catch (error) { notify(error instanceof Error ? error.message : String(error), true); return false; }
    finally { busyRef.current.delete(key); setBusy(new Set(busyRef.current)); }
  };

  // Reload within the serialized mutation, so editing one model never writes
  // an old snapshot over another completed model/account change.
  const mutate = (change: (current: Configuration) => Configuration): Promise<void> => {
    const next = mutationTail.current.catch(() => {}).then(async () => {
      const fresh = normalizeConfiguration(checked(await api.profilesLoad()));
      const changed = change(fresh);
      const saved: ProfilesLoadResult = checked(await api.profilesSave({
        profiles: changed.profiles, proxy: changed.proxy,
        subscriptionAccounts: changed.subscriptionAccounts, routeBackends: changed.routeBackends,
      }));
      setConfig(normalizeConfiguration(saved));
      setModels(checked(await api.profilesModels()).models || []);
    });
    mutationTail.current = next;
    return next;
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); notify(tr('已复制', 'Copied to clipboard')); }
    catch { notify(tr('复制失败，请手动选择复制', 'Could not copy. Select and copy the text manually.'), true); }
  };
  return { api, info, locale, setLocale, tr, config, models, status, subscriptions, loading, error, toast, setToast, busy, run, refresh, mutate, notify, copy };
}

type AppState = ReturnType<typeof useAppState>;
const AppContext = createContext<AppState | null>(null);
export function useApp() { const value = useContext(AppContext); if (!value) throw new Error('AppProvider missing'); return value; }

function ConnectedApp({ api, info, children }: { api: ManagementAPI; info: Info; children: ReactNode }) {
  const state = useAppState(api, info);
  return <AppContext.Provider value={state}>{children}</AppContext.Provider>;
}
export function AppProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<Awaited<ReturnType<typeof initializeAPI>> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { let alive = true; void initializeAPI().then(value => { if (alive) setConnection(value); }).catch(error => { if (alive) setError(error.message); }); return () => { alive = false; }; }, []);
  if (!connection) return <div className="connection-screen"><div className="brand-symbol">c</div><h1>clovapi</h1><p>{error || '正在连接本地服务 · Connecting to local service'}</p>{error && <Button onClick={() => location.reload()}>重试 / Retry</Button>}</div>;
  return <ConnectedApp {...connection}>{children}</ConnectedApp>;
}
