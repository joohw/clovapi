import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Trash2 } from 'lucide-react';
import { checked, useApp } from '../context';
import { compact } from '../domain';
import type { ProxyLogEntry, ProxyLogsResult } from '../types';
import { Button, Confirm, Empty, PageHeading } from '../components/common';
import { LogDetailDialog } from '../components/LogDetailDialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

export function Logs({ scope }: { scope: 'calls' | 'system' }) {
  const { api, tr, run, busy } = useApp();
  const [data, setData] = useState<ProxyLogsResult>({});
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<ProxyLogEntry | null>(null);
  const [confirm, setConfirm] = useState(false);
  const detailTrigger = useRef<HTMLButtonElement | null>(null);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    try {
      const result = checked(await api.proxyLogsList({ scope, limit: 50, offset, apiKey: filter === 'unidentified' ? undefined : filter, apiKeyUnidentified: filter === 'unidentified' }));
      if (request === generation.current) { setData(result); setError(''); }
    } catch (error) { if (request === generation.current) setError(String(error)); }
  }, [api, scope, offset, filter]);
  useEffect(() => { void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 10000); return () => { ++generation.current; clearInterval(timer); }; }, [load]);
  const calls = data.requests || [];
  return <>
    <PageHeading title={scope === 'calls' ? tr('调用日志', 'Call logs') : tr('系统日志', 'System logs')} description={scope === 'calls' ? tr('查看请求、响应与 Token 用量，每 10 秒自动更新。', 'Inspect requests, responses and token usage. Refreshes every 10 seconds.') : tr('查看本地代理的运行记录与诊断信息。', 'Runtime events and diagnostics from your local proxy.')}><Button onClick={() => void load()}><RefreshCw size={15} />{tr('刷新', 'Refresh')}</Button><Button onClick={() => setConfirm(true)}><Trash2 size={15} />{tr('清空日志', 'Clear logs')}</Button></PageHeading>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <section className={`panel page-panel ${scope === 'calls' ? 'call-logs-panel' : ''}`}>
      {scope === 'calls' && <div className="panel-toolbar">
        <strong>{tr('最近请求', 'Recent requests')}</strong>
        <Select value={filter || 'all'} onValueChange={value => { setOffset(0); setFilter(value === 'all' ? '' : value); }}>
          <SelectTrigger className="log-key-select" aria-label={tr('按 API Key 筛选', 'Filter by API key')}><SelectValue /></SelectTrigger>
          <SelectContent className="log-key-options" position="popper" align="end">
            <SelectItem value="all">{tr('全部 API Key', 'All API keys')}</SelectItem>
            {data.apiKeyAggregates?.map(item => {
              const value = item.unidentified ? 'unidentified' : item.apiKey?.fingerprint;
              return value ? <SelectItem key={value} value={value}>{item.apiKey?.label || tr('未识别', 'Unidentified')} · {item.count} {tr('次', 'calls')} · {compact(item.totalTokens)} tokens</SelectItem> : null;
            })}
          </SelectContent>
        </Select>
      </div>}
      {scope === 'calls' ? calls.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label={tr('调用日志列表', 'Call log list')}>
        <table className="log-table">
          <thead><tr><th className="log-time">{tr('时间', 'TIME')}</th><th>{tr('模型', 'MODEL')}</th><th>{tr('路由', 'ROUTE')}</th><th className="log-status">{tr('状态', 'STATUS')}</th><th className="log-duration">{tr('耗时', 'DURATION')}</th><th className="log-tokens">Tokens</th><th className="log-actions" /></tr></thead>
          <tbody>{calls.map(entry => {
            const model = entry.route?.requestedModel || entry.route?.upstreamModel || '—';
            const route = entry.route?.providerId || entry.request?.url || '—';
            return <tr key={entry.id}>
              <td className="mono">{new Date(entry.startedAt).toLocaleString()}</td>
              <td><strong className="log-cell-text" title={model}>{model}</strong></td>
              <td><code className="log-cell-text muted" title={route}>{route}</code></td>
              <td><span className={`protocol-tag ${(entry.status || entry.upstream?.status || 0) >= 400 || entry.error ? 'failed' : ''}`}>{entry.status || entry.upstream?.status || '—'}</span></td>
              <td className="mono">{entry.durationMs} ms</td>
              <td className="mono">{compact(entry.tokenUsage?.totalTokens)}</td>
              <td><Button variant="ghost" onClick={event => { detailTrigger.current = event.currentTarget; setSelected(entry); }}>{tr('详情', 'Details')}<ChevronRight size={14} /></Button></td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <Empty title={tr('暂无调用记录', 'No requests yet')} description={tr('通过代理发起请求后，记录会显示在这里。', 'Requests appear here after a client uses the proxy.')} /> : (data.system || []).length ? <div className="system-log" tabIndex={0} role="region" aria-label={tr('系统日志列表', 'System log list')}>{data.system?.map(entry => <div key={entry.id}><time>{new Date(entry.at).toLocaleString()}</time><span className={entry.stream === 'stderr' ? 'failed' : 'muted'}>{entry.stream}</span><pre>{entry.message}</pre></div>)}</div> : <Empty title={tr('暂无系统日志', 'No system logs')} />}
      <div className="panel-footer"><span>{scope === 'calls' ? tr(`本页 ${calls.length} 条请求`, `${calls.length} requests on this page`) : tr(`最近 ${data.system?.length || 0} 条日志`, `${data.system?.length || 0} recent events`)}</span>{scope === 'calls' && <div className="actions"><Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}><ChevronLeft size={14} />{tr('上一页', 'Previous')}</Button><Button disabled={!data.callLogPage?.hasMore} onClick={() => setOffset(offset + 50)}>{tr('下一页', 'Next')}<ChevronRight size={14} /></Button></div>}</div>
    </section>
    {selected && <LogDetailDialog key={selected.id} entry={selected} onClose={() => setSelected(null)} onClosed={() => detailTrigger.current?.focus()} />}
    {confirm && <Confirm title={tr('清空日志？', 'Clear logs?')} description={tr('当前类别的历史日志将被永久删除。', 'All stored logs in this category will be permanently deleted.')} busy={busy.has('clear-logs')} onClose={() => setConfirm(false)} onConfirm={() => void run('clear-logs', async () => { checked(await api.proxyLogsClear(scope)); setOffset(0); setFilter(''); await load(); setConfirm(false); })} />}
  </>;
}
