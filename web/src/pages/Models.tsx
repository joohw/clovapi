import { Input } from '@/components/ui/input';
import { useMemo, useState } from 'react';
import { ArrowRight, Search, PlugZap, Check, CircleAlert, LoaderCircle } from 'lucide-react';
import { useApp } from '../context';
import { useModelTests } from '../model-tests';
import { Button, CopyButton, Empty, IconButton, PageHeading, ProviderIcon, ProviderName } from '../components/common';

export function Models({ onManage }: { onManage: () => void }) {
  const { models, status, tr } = useApp();
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('all');
  const { tests, test } = useModelTests();
  const providers = useMemo(() => [...new Set(models.map(item => item.providerId))], [models]);
  const visible = models.filter(model => (provider === 'all' || provider === model.providerId) && `${model.label} ${model.modelId} ${model.vendorName} ${model.providerId} ${model.apiStyle}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <>
    <PageHeading title={tr('模型库', 'Models')} description={tr('连接不同来源的模型，通过一个本地入口访问。', 'Access models from every provider through one local endpoint.')} />
    <section className="panel page-panel">
      <div className="panel-toolbar"><div className="filter-tabs" aria-label={tr('按供应商筛选', 'Filter by provider')}><button className={provider === 'all' ? 'selected' : ''} onClick={() => setProvider('all')}>{tr('全部模型', 'All models')}<span>{models.length}</span></button>{providers.map(id => <button key={id} className={provider === id ? 'selected' : ''} onClick={() => setProvider(id)}><ProviderName id={id} /></button>)}</div><label className="search"><Search size={16} /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder={tr('搜索模型、供应商…', 'Search models, providers…')} aria-label={tr('搜索模型', 'Search models')} /></label></div>
      {visible.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label={tr('模型列表', 'Model list')}><table className="model-table"><thead><tr><th>{tr('模型', 'MODEL')}</th><th>{tr('供应商', 'PROVIDER')}</th><th>{tr('API 格式', 'API FORMAT')}</th><th>{tr('连接测试', 'CONNECTION TEST')}</th><th className="align-right">{tr('操作', 'ACTIONS')}</th></tr></thead><tbody>{visible.map(model => {
        const result = tests[`${model.providerId}/${model.modelId}`];
        return <tr key={`${model.providerId}/${model.modelId}`}>
          <td><div className="model-cell"><CopyButton value={model.modelId} label={`${tr('复制模型 ID', 'Copy model ID')}: ${model.modelId}`} /><strong title={model.label && model.label !== model.modelId ? `${model.label} · ${model.modelId}` : model.modelId}>{model.label || model.modelId}</strong></div></td>
          <td><span className="provider-cell"><ProviderIcon id={model.providerId} small /><ProviderName id={model.providerId} /></span></td>
          <td><span className="protocol-tag">{model.apiStyle}</span></td>
          <td><span className={`test-state ${result?.status || ''}`} title={result?.summary}>{result?.status === 'pass' ? <Check size={13} /> : result?.status === 'fail' ? <CircleAlert size={13} /> : result?.status === 'testing' ? <LoaderCircle size={13} className="spin" /> : <span className="tiny-dash" />}{result?.status === 'pass' ? tr('连接正常', 'Passed') : result?.status === 'fail' ? tr('测试失败', 'Failed') : result?.status === 'testing' ? tr('测试中', 'Testing') : tr('未测试', 'Not tested')}</span></td>
          <td><div className="row-actions"><IconButton label={`${tr('测试连接', 'Test connection')}: ${model.modelId}`} disabled={result?.status === 'testing'} onClick={() => void test(model.providerId, model.modelId)}><PlugZap size={14} /></IconButton><CopyButton value={model.proxyBaseUrl || `${status.baseUrl}/${model.providerId}/v1`} label={tr('复制代理地址', 'Copy proxy URL')} /></div></td>
        </tr>;
      })}</tbody></table></div> : <Empty title={search || provider !== 'all' ? tr('没有匹配的模型', 'No matching models') : tr('添加你的第一个模型', 'Connect your first model')} description={search ? tr('试试其他关键词，或切换供应商。', 'Try another search or provider filter.') : tr('在供应商页面连接订阅账号、API 或 Ollama。', 'Connect a subscription, custom API or Ollama in Providers.')} action={!search && <Button onClick={onManage}>{tr('前往供应商', 'Go to providers')}<ArrowRight size={15} /></Button>} />}
      <div className="panel-footer"><span>{tr(`显示 ${visible.length} 个模型，共 ${models.length} 个`, `Showing ${visible.length} of ${models.length} models`)}</span><span className="muted">{tr('复制模型 ID 和代理地址，即可接入客户端', 'Copy a model ID and proxy URL to connect your client')}</span></div>
    </section>
  </>;
}
