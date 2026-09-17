import type { ProfilesLoadResult, ProxyStatusResult, SubscriptionAccount, Vendor, VendorModel } from './types';

export type Configuration = ProfilesLoadResult & {
  profiles: Vendor[];
  subscriptionAccounts: SubscriptionAccount[];
  routeBackends: NonNullable<ProfilesLoadResult['routeBackends']>;
};

export function normalizeConfiguration(value: ProfilesLoadResult): Configuration {
  return {
    ...value,
    profiles: (value.profiles || []).map(vendor => ({ ...vendor, models: vendor.models || [] })),
    subscriptionAccounts: value.subscriptionAccounts || [],
    routeBackends: value.routeBackends || [],
  };
}

export function providerId(vendor: Vendor): string {
  return vendor.subscriptionProviderId || (vendor.kind === 'local' ? 'ollama' : 'custom');
}

export function modelSlug(model: string): string {
  return model.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'model';
}

export function saveModel(config: Configuration, vendorName: string, model: VendorModel, originalId?: string): Configuration {
  const vendor = config.profiles.find(item => item.name === vendorName);
  if (!vendor) throw new Error('Provider not found');
  if (!model.id.trim() || !model.model.trim() || !model.label.trim()) throw new Error('Model ID, name and upstream model are required');
  if (originalId && !vendor.models.some(item => item.id === originalId)) throw new Error('This model was removed. Refresh and try again.');
  if (vendor.models.some(item => item.id.toLowerCase() === model.id.toLowerCase() && item.id !== originalId)) throw new Error('Model ID already exists');
  const updated = originalId ? { ...model, id: originalId } : model;
  return { ...config, profiles: config.profiles.map(item => item.name !== vendorName ? item : {
    ...item, models: originalId ? item.models.map(entry => entry.id === originalId ? updated : entry) : [...item.models, updated],
  }) };
}

export function reorderAccounts(config: Configuration, provider: string, from: number, to: number): Configuration {
  const accounts = config.subscriptionAccounts.filter(item => item.providerId === provider);
  if (from < 0 || to < 0 || from >= accounts.length || to >= accounts.length || from === to) return config;
  const [moved] = accounts.splice(from, 1);
  accounts.splice(to, 0, moved);
  const order = new Map(accounts.map((item, index) => [item.id, index + 1]));
  return {
    ...config,
    subscriptionAccounts: [...config.subscriptionAccounts.filter(item => item.providerId !== provider), ...accounts],
    routeBackends: config.routeBackends.map(item => item.providerId === provider && item.sourceType === 'subscription' && order.has(item.sourceId || '')
      ? { ...item, priority: order.get(item.sourceId || '')! } : item),
  };
}

export function removeAccount(config: Configuration, account: SubscriptionAccount): Configuration {
  const remaining = config.subscriptionAccounts.filter(item => item.id !== account.id);
  const hasAccounts = remaining.some(item => item.providerId === account.providerId);
  return {
    ...config, subscriptionAccounts: remaining,
    routeBackends: config.routeBackends.filter(item => item.sourceId !== account.id),
    profiles: config.profiles.map(vendor => providerId(vendor) === account.providerId && !hasAccounts ? { ...vendor, models: [] } : vendor),
  };
}

export function parseProxyAddress(value: string): { host: string; port: number } {
  const url = new URL(value.includes('://') ? value : `http://${value}`);
  if (url.protocol !== 'http:' || url.username || url.password || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) throw new Error('Use an HTTP host and port, without a path');
  // URL normalizes an explicit :80 to an empty port; preserve it.
  const authority = value.replace(/^http:\/\//, '').split('/')[0];
  const explicitPort = authority.match(/:(\d+)$/)?.[1];
  const port = Number(explicitPort || url.port || 27483);
  if (!url.hostname || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid proxy address');
  return { host: url.hostname.replace(/^\[|\]$/g, ''), port };
}

export function proxyAddresses(status: ProxyStatusResult): { listenAddress: string; baseUrl: string } {
  const configuredHost = status.config?.host?.trim() || status.host?.trim() || '0.0.0.0';
  const configuredPort = status.config?.port || status.port || 27483;
  const formatAddress = (host: string, port: number) => `${host.includes(':') ? `[${host}]` : host}:${port}`;
  const listenAddress = formatAddress(configuredHost, configuredPort);
  if (status.running && status.baseUrl) return { listenAddress, baseUrl: status.baseUrl };

  // A stopped proxy still reports its last active endpoint. The next start
  // uses the saved configuration, which may already have a different address.
  const host = status.running ? status.host?.trim() || configuredHost : configuredHost;
  const port = status.running ? status.port || configuredPort : configuredPort;
  const clientHost = ['0.0.0.0', '::', '::ffff:0.0.0.0'].includes(host.toLowerCase()) ? '127.0.0.1' : host;
  return { listenAddress, baseUrl: `http://${formatAddress(clientHost, port)}` };
}

export function pretty(value: unknown): string {
  if (typeof value === 'string') {
    try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value || '—'; }
  }
  return JSON.stringify(value, null, 2) || '—';
}

export function compact(value: number | undefined): string {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
}
