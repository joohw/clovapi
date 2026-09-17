import { Input } from '@/components/ui/input';
import { useState, type FormEvent } from 'react';
import { Pencil, Play, Square, RotateCw } from 'lucide-react';
import { checked, useApp } from '../context';
import { parseProxyAddress, proxyAddresses } from '../domain';
import { Button, CopyButton, IconButton, PageHeading } from '../components/common';

export function Settings() {
  const { tr, locale, setLocale, status, info, api, run, busy, refresh } = useApp();
  const [address, setAddress] = useState('');
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState(false);
  const { listenAddress: configured, baseUrl } = proxyAddresses(status);
  const proxyBusy = busy.has('proxy');
  const editAddress = () => { setAddress(configured); setDirty(false); setEditing(true); };
  const cancelEdit = () => { setAddress(configured); setDirty(false); setEditing(false); };
  const control = (action: 'start' | 'stop' | 'restart') => run('proxy', async () => {
    try {
      if (action !== 'start') checked(await api.proxyStop());
      if (action !== 'stop') checked(await api.proxyStart(status.config?.port, status.config?.host));
    } finally { await refresh(); }
  });
  const saveAddress = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run('proxy', async () => {
      const parsed = parseProxyAddress(address.trim());
      checked(await api.proxyConfigSave({ ...status.config, ...parsed }));
      try {
        if (status.running) {
          checked(await api.proxyStop());
          checked(await api.proxyStart(parsed.port, parsed.host));
        }
      } finally { await refresh(); }
    }, tr('代理地址已更新', 'Proxy address updated'));
    if (ok) { setDirty(false); setEditing(false); }
  };
  return <>
    <PageHeading title={tr('设置', 'Settings')} description={tr('管理本地代理与工作空间偏好。', 'Manage your local proxy and workspace preferences.')} />
    <div className="panel page-panel"><div className="settings-content" tabIndex={0} role="region" aria-label={tr('设置内容', 'Settings content')}>
    <section className="settings-panel">
      <div className="proxy-settings-heading">
        <div className="proxy-settings-title"><h2>{tr('本地代理', 'Local proxy')}</h2><span className="proxy-settings-status" role="status"><span className={`status-dot ${status.running ? 'running' : ''}`} />{status.running ? tr('运行中', 'Running') : tr('已停止', 'Stopped')}</span></div>
        <div className="actions">{status.running ? <><Button busy={proxyBusy} disabled={editing} onClick={() => void control('restart')}><RotateCw size={15} />{tr('重启', 'Restart')}</Button><Button busy={proxyBusy} disabled={editing} onClick={() => void control('stop')}><Square size={13} />{tr('停止', 'Stop')}</Button></> : <Button variant="primary" busy={proxyBusy} disabled={editing} onClick={() => void control('start')}><Play size={14} />{tr('启动代理', 'Start proxy')}</Button>}</div>
      </div>
      {editing ? <form className="proxy-address-editor" onSubmit={saveAddress} onKeyDown={event => { if (event.key === 'Escape' && !proxyBusy) { event.preventDefault(); cancelEdit(); } }}>
        <label htmlFor="proxy-listen-address">{tr('监听地址', 'Listen address')}</label>
        <div className="proxy-address-input">
          <Input id="proxy-listen-address" required autoFocus disabled={proxyBusy} value={address} onChange={event => { setDirty(true); setAddress(event.target.value); }} placeholder="127.0.0.1:27483" />
          <div className="actions"><Button type="submit" variant="primary" busy={proxyBusy} disabled={!dirty}>{tr('保存', 'Save')}</Button><Button disabled={proxyBusy} onClick={cancelEdit}>{tr('取消', 'Cancel')}</Button></div>
        </div>
        {status.running && <p className="muted">{tr('保存后会重启代理，请同步更新客户端地址。', 'Saving restarts the proxy. Update your client address to match.')}</p>}
      </form> : <div className="proxy-address-summary">
        <code>{baseUrl}</code>
        <div className="actions"><CopyButton value={baseUrl} label={tr('复制代理地址', 'Copy proxy URL')} /><IconButton label={tr('编辑监听地址', 'Edit listen address')} disabled={proxyBusy} onClick={editAddress}><Pencil size={15} /></IconButton></div>
      </div>}
    </section>
    <section className="settings-panel"><div className="setting-row setting-row-compact"><h2>{tr('界面语言', 'Language')}</h2><div className="filter-tabs"><button className={locale === 'zh' ? 'selected' : ''} onClick={() => setLocale('zh')}>简体中文</button><button className={locale === 'en' ? 'selected' : ''} onClick={() => setLocale('en')}>English</button></div></div></section>
    <section className="settings-panel"><div className="setting-row setting-row-compact"><strong>clovapi</strong><code className="protocol-tag">{info.version}</code></div></section>
    </div></div>
  </>;
}
