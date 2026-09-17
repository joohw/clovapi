import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, Pencil, Play, RefreshCw, Trash2 } from 'lucide-react';
import { checked, useApp } from '../context';
import { modelSlug, providerId, removeAccount, reorderAccounts, saveModel } from '../domain';
import type { SubscriptionAccount, Vendor, VendorModel, VendorUsageResult } from '../types';
import { useModelTests } from '../model-tests';
import { Button, Confirm, CopyButton, Dialog, Empty, IconButton, PageHeading, ProviderIcon, ProviderName } from '../components/common';

export function Providers() {
  const { config, api, busy, run, refresh, mutate, subscriptions, tr } = useApp();
  const [editor, setEditor] = useState<{ vendor: Vendor; model?: VendorModel } | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; description: string; action: () => Promise<void> } | null>(null);
  const [usage, setUsage] = useState<Record<string, VendorUsageResult>>({});
  const { tests, test } = useModelTests();
  const customVendor = config.profiles.find(vendor => vendor.kind === 'api' && vendor.name === 'Custom API');
  const subscriptionVendors = ['codex', 'claude-code'].map(id => ({
    id, vendor: config.profiles.find(vendor => vendor.kind === 'subscription' && vendor.subscriptionProviderId === id),
  }));
  const visibleVendors = config.profiles.filter(vendor => {
    const id = providerId(vendor);
    if (vendor.kind === 'local' || id === 'ollama') return false;
    return vendor.models.length > 0 || config.subscriptionAccounts.some(account => account.providerId === id)
      || subscriptions.some(item => item.id === id && item.loggedIn) || busy.has(`login:${id}`);
  });

  const fetchModels = (vendor: Vendor, account?: SubscriptionAccount) => run(`fetch:${account?.id || vendor.name}`, async () => {
    checked(await api.profilesListModels(vendor.name, account?.credentialRef)); await refresh();
  }, tr('模型列表已更新', 'Model list updated'));
  const queryUsage = (vendor: Vendor, account?: SubscriptionAccount) => run(`usage:${account?.id || vendor.name}`, async () => {
    const result = checked(await api.profilesUsage(vendor.name, account?.credentialRef));
    setUsage(current => ({ ...current, [account?.id || vendor.name]: result }));
  });
  const addAccount = (vendor: Vendor) => run(`login:${providerId(vendor)}`, async () => {
    const provider = providerId(vendor);
    const id = `${provider}-${crypto.randomUUID().slice(0, 8)}`;
    const credentialRef = `subscription/${id}.json`;
    const result = await api.authLogin({ provider, credentialRef });
    if (result.cancelled) return;
    checked(result);
    await mutate(current => ({ ...current, subscriptionAccounts: [...current.subscriptionAccounts, {
      id, providerId: provider, credentialRef, label: `${vendor.name} ${current.subscriptionAccounts.filter(item => item.providerId === provider).length + 1}`, status: 'active', models: [],
    }] }));
    checked(await api.profilesListModels(vendor.name, credentialRef));
    await refresh();
  });

  return <>
    <PageHeading title={tr('供应商', 'Providers')} description={tr('管理模型来源、连接凭据与订阅账号。', 'Manage model sources, credentials and subscription accounts.')}>
      <div className="provider-add" role="group" aria-label={tr('添加供应商', 'Add provider')}>
        <Button variant="primary" className="provider-add-main" disabled={!customVendor} onClick={() => { if (customVendor) setEditor({ vendor: customVendor }); }}>{tr('添加模型', 'Add model')}</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="primary" className="provider-add-menu" aria-label={tr('添加订阅供应商', 'Add subscription provider')}><ChevronDown size={15} /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="provider-add-options">
            <DropdownMenuLabel>{tr('订阅', 'Subscriptions')}</DropdownMenuLabel>
            {subscriptionVendors.map(({ id, vendor }) => <DropdownMenuItem key={id} disabled={!vendor || busy.has(`login:${id}`)} onSelect={() => { if (vendor) void addAccount(vendor); }}><ProviderIcon id={id} small /><span><ProviderName id={id} /> {tr('订阅', 'subscription')}</span></DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </PageHeading>
    <div className="provider-list" role="region" tabIndex={0} aria-label={tr('已添加的供应商', 'Added providers')}>{visibleVendors.length ? visibleVendors.map(vendor => {
      const id = providerId(vendor);
      const accounts = config.subscriptionAccounts.filter(account => account.providerId === id);
      const loggedIn = accounts.length > 0 || subscriptions.some(item => item.id === id && item.loggedIn);
      return <section className="panel provider-panel" key={vendor.name}>
        <div className="provider-heading"><div className="provider-identity"><ProviderIcon id={id} /><div><h2><ProviderName id={id} /><span className="type-tag">{vendor.kind === 'subscription' ? tr('官方订阅', 'Subscription') : tr('自定义 API', 'Custom API')}</span></h2><p>{vendor.models.length} {tr('个模型', 'models')}{vendor.kind === 'subscription' && <> · {accounts.length} {tr('个账号', 'accounts')} · {loggedIn ? tr('已连接', 'Connected') : tr('未登录', 'Not connected')}</>}</p></div></div>
          {vendor.kind === 'subscription' && busy.has(`login:${id}`) && <div className="actions"><Button onClick={() => void api.cancelAuthLogin(id)}>{tr('取消登录', 'Cancel sign-in')}</Button></div>}
        </div>
        <div className="provider-content">
          {vendor.kind === 'subscription' && <div className="accounts-section">{accounts.length ? accounts.map((account, index) => <div className="account-row" key={account.id}>
            <span className="account-order">{index + 1}</span><div className="account-info"><strong>{account.label}</strong><Usage value={usage[account.id] || config.usageCache?.usages?.find(item => item.sourceId === account.id)} /></div>
            <div className="row-actions"><IconButton label={tr('上移账号', 'Move account up')} disabled={index === 0 || busy.has(`order:${id}`)} onClick={() => void run(`order:${id}`, () => mutate(current => reorderAccounts(current, id, index, index - 1)))}><ArrowUp size={14} /></IconButton><IconButton label={tr('下移账号', 'Move account down')} disabled={index === accounts.length - 1 || busy.has(`order:${id}`)} onClick={() => void run(`order:${id}`, () => mutate(current => reorderAccounts(current, id, index, index + 1)))}><ArrowDown size={14} /></IconButton><Button variant="ghost" busy={busy.has(`usage:${account.id}`)} onClick={() => void queryUsage(vendor, account)}>{tr('额度', 'Usage')}</Button><IconButton label={tr('刷新账号模型', 'Refresh account models')} disabled={busy.has(`fetch:${account.id}`)} onClick={() => void fetchModels(vendor, account)}><RefreshCw size={14} /></IconButton><IconButton label={tr('移除账号', 'Remove account')} onClick={() => setConfirm({ title: tr('移除订阅账号？', 'Remove subscription account?'), description: `${account.label} — ${tr('将移除此账号的本地凭据与路由配置。', 'Local credentials and routes for this account will be removed.')}`, action: () => mutate(current => removeAccount(current, account)) })}><Trash2 size={14} /></IconButton></div>
          </div>) : <div className="subtle-empty">{tr('添加账号后即可同步订阅中的模型。', 'Add an account to sync your subscription models.')}{loggedIn && <Button variant="ghost" onClick={() => void fetchModels(vendor)}>{tr('同步已有登录', 'Sync existing sign-in')}</Button>}</div>}</div>}
          {vendor.kind !== 'subscription' && (vendor.models.length ? <div className="provider-model-list"><div className="section-caption">{tr('模型', 'MODELS')}</div>{vendor.models.map(model => <div className="provider-model-row" key={model.id}><span className="model-indicator" /><div className="provider-model-name"><strong>{model.label || model.model || model.id}</strong><code>{model.id}{model.model !== model.id ? ` → ${model.model}` : ''}</code>{tests[`${id}/${model.id}`] && <span className={`test-state ${tests[`${id}/${model.id}`].status}`}>{tests[`${id}/${model.id}`].summary || tr('测试中…', 'Testing…')}</span>}</div><span className="protocol-tag">{model.apiStyle}</span><div className="row-actions"><CopyButton value={model.id} /><IconButton label={tr('测试模型', 'Test model')} disabled={busy.has(`test:${id}/${model.id}`)} onClick={() => void test(id, model.id)}><Play size={14} /></IconButton>{vendor.kind === 'api' && <><IconButton label={tr('编辑模型', 'Edit model')} onClick={() => setEditor({ vendor, model })}><Pencil size={14} /></IconButton><IconButton label={tr('删除模型', 'Delete model')} onClick={() => setConfirm({ title: tr('删除模型？', 'Delete model?'), description: model.label || model.id, action: () => mutate(current => ({ ...current, profiles: current.profiles.map(item => item.name === vendor.name ? { ...item, models: item.models.filter(entry => entry.id !== model.id) } : item) })) })}><Trash2 size={14} /></IconButton></>}</div></div>)}</div> : <Empty title={tr('还没有模型', 'No models yet')} description={tr('添加一个 API 模型，填写连接地址和密钥即可开始。', 'Add an API model with its endpoint and key to get started.')} />)}
          {vendor.kind === 'api' && !!vendor.models.length && <div className="provider-usage"><Button variant="ghost" busy={busy.has(`usage:${vendor.name}`)} onClick={() => void queryUsage(vendor)}>{tr('查询供应商额度', 'Check provider usage')}</Button><Usage value={usage[vendor.name]} /></div>}
        </div>
      </section>;
    }) : <div className="panel provider-empty"><Empty title={tr('暂无供应商', 'No providers yet')} description={tr('添加 API 模型或连接订阅账号。', 'Add an API model or connect a subscription account.')} /></div>}</div>
    {editor && <ModelEditor key={`${editor.vendor.name}/${editor.model?.id || 'new'}`} {...editor} onClose={() => setEditor(null)} />}
    {confirm && <Confirm {...confirm} busy={busy.has('delete')} onClose={() => setConfirm(null)} onConfirm={() => void run('delete', confirm.action, tr('已删除', 'Deleted')).then(ok => { if (ok) setConfirm(null); })} />}
  </>;
}

function Usage({ value }: { value?: VendorUsageResult }) {
  const { tr } = useApp();
  if (!value) return null;
  const tiers = value.usage?.tiers;
  return <div className="usage-content">{tiers?.map(tier => <div className="usage-tier" key={tier.name}><span>{tier.name}</span><meter min={0} max={100} value={tier.utilization} aria-label={tier.name} /><span>{Math.round(tier.utilization)}% {tr('已用', 'used')}</span></div>)}{!tiers?.length && <span>{value.text || value.usage?.data?.map(row => `${row.planName || ''} ${row.remaining ?? row.total ?? '—'} ${row.unit || ''}`).join(' · ') || value.error || tr('暂无额度数据', 'No usage data available')}</span>}</div>;
}

function ModelEditor({ vendor, model, onClose }: { vendor: Vendor; model?: VendorModel; onClose: () => void }) {
  const { tr, mutate, run, busy } = useApp();
  const [label, setLabel] = useState(model?.label || '');
  const [upstream, setUpstream] = useState(model?.model || '');
  const [id, setId] = useState(model?.id || '');
  const [idEdited, setIdEdited] = useState(Boolean(model));
  const [style, setStyle] = useState(model?.apiStyle || 'responses');
  const [baseUrl, setBaseUrl] = useState(model?.baseUrl || vendor.baseUrl || '');
  const [apiKey, setApiKey] = useState(model?.apiKey || vendor.apiKey || '');
  const [showKey, setShowKey] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run('save-model', async () => {
      const url = new URL(baseUrl); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(tr('请输入 HTTP 或 HTTPS 地址', 'Use an HTTP or HTTPS URL'));
      await mutate(current => saveModel(current, vendor.name, { id: id.trim(), label: label.trim(), model: upstream.trim(), apiStyle: style, baseUrl: baseUrl.trim(), apiKey: apiKey.trim() }, model?.id));
    }, tr('模型已保存', 'Model saved'));
    if (ok) onClose();
  };
  return <Dialog title={model ? tr('编辑模型', 'Edit model') : tr('添加 API 模型', 'Add API model')} description={tr('配置上游连接，客户端通过本地代理访问。', 'Configure an upstream connection for your local proxy.')} onClose={onClose}><form onSubmit={submit}>
    <div className="form-grid"><label className="field">{tr('显示名称', 'Display name')}<Input required autoFocus value={label} onChange={event => setLabel(event.target.value)} placeholder="GPT-5.5" /></label><label className="field">{tr('上游模型', 'Upstream model')}<Input required value={upstream} onChange={event => { setUpstream(event.target.value); if (!idEdited) setId(modelSlug(event.target.value)); }} placeholder="gpt-5.5" /></label></div>
    <label className="field">{tr('模型 ID', 'Model ID')}<Input required value={id} disabled={Boolean(model)} onChange={event => { setIdEdited(true); setId(event.target.value); }} /><small>{tr('客户端请求使用的模型 ID，保存后保持不变。', 'The model ID used by clients. It stays stable after creation.')}</small></label>
    <label className="field">{tr('API 格式', 'API format')}<select value={style} onChange={event => setStyle(event.target.value)}><option value="responses">OpenAI Responses</option><option value="chat">OpenAI Chat Completions</option><option value="message">Anthropic Messages</option><option value="gemini">Google Gemini</option></select></label>
    <label className="field">Base URL<Input required type="url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" /></label>
    <label className="field">API Key<div className="password-input"><Input required type={showKey ? 'text' : 'password'} autoComplete="off" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder="sk-…" /><IconButton label={showKey ? tr('隐藏密钥', 'Hide API key') : tr('显示密钥', 'Show API key')} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</IconButton></div></label>
    <div className="dialog-actions"><Button onClick={onClose} disabled={busy.has('save-model')}>{tr('取消', 'Cancel')}</Button><Button type="submit" variant="primary" busy={busy.has('save-model')}>{tr('保存模型', 'Save model')}</Button></div>
  </form></Dialog>;
}
