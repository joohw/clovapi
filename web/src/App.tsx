import { useEffect, useState, type MouseEvent } from 'react';
import { Activity, Boxes, Layers3, Menu, ScrollText, Settings2, X, CircleAlert } from 'lucide-react';
import { useApp } from './context';
import { Button, Empty, IconButton, Toast } from './components/common';
import { Models } from './pages/Models';
import { Providers } from './pages/Providers';
import { Logs } from './pages/Logs';
import { Settings } from './pages/Settings';
import { pages, resolveRoute, type Page } from './navigation';

export default function App() {
  const { tr, info, loading, error, refresh, run } = useApp();
  const [page, setPage] = useState(() => resolveRoute(window.location).page);
  const [mobileOpen, setMobileOpen] = useState(false);
  const names: Record<Page, string> = { models: tr('模型库', 'Models'), providers: tr('供应商', 'Providers'), 'call-logs': tr('调用日志', 'Call logs'), 'system-logs': tr('系统日志', 'System logs'), settings: tr('设置', 'Settings') };
  const icons = { models: Boxes, providers: Layers3, 'call-logs': Activity, 'system-logs': ScrollText, settings: Settings2 };
  useEffect(() => {
    const update = () => {
      const route = resolveRoute(window.location);
      if (route.canonicalHref) window.history.replaceState(window.history.state, '', route.canonicalHref);
      setPage(route.page);
      setMobileOpen(false);
    };
    update();
    window.addEventListener('popstate', update);
    window.addEventListener('hashchange', update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('hashchange', update);
    };
  }, []);
  const pageTitle = page ? names[page] : tr('页面不存在', 'Page not found');
  useEffect(() => { document.title = `${pageTitle} · clovapi`; }, [pageTitle]);
  function navigate(nextPage: Page) {
    const href = `/${nextPage}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== href) window.history.pushState(null, '', href);
    setPage(nextPage);
    setMobileOpen(false);
  }
  function followLink(event: MouseEvent<HTMLAnchorElement>, nextPage: Page) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (event.currentTarget.target && event.currentTarget.target !== '_self') || event.currentTarget.hasAttribute('download')) return;
    event.preventDefault();
    navigate(nextPage);
  }
  return <div className="app-shell">
    {mobileOpen && <button className="sidebar-overlay" aria-label={tr('关闭导航', 'Close navigation')} onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
      <a className="brand" href="/models" onClick={event => followLink(event, 'models')} aria-label="clovapi"><span className="brand-full">clovapi</span></a>
      <IconButton className="mobile-close" label={tr('关闭导航', 'Close navigation')} onClick={() => setMobileOpen(false)}><X size={20} /></IconButton>
      <nav aria-label={tr('主导航', 'Main navigation')}>
        {pages.map(item => { const Icon = icons[item]; return <a key={item} href={`/${item}`} onClick={event => followLink(event, item)} className={`nav-item ${page === item ? 'active' : ''}`} aria-current={page === item ? 'page' : undefined} title={names[item]}><Icon size={19} strokeWidth={1.7} /><span className="sidebar-label">{names[item]}</span></a>; })}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-footer"><span className="version-label">{info.version}</span></div>
      </div>
    </aside>
    <div className="workspace">
      <header className="mobile-topbar"><IconButton label={tr('打开导航', 'Open navigation')} onClick={() => setMobileOpen(true)}><Menu size={20} /></IconButton></header>
      <main id="main-content" className={`main-content ${page ?? 'not-found'}-page`}>
        {error && <div className="error-banner" role="alert"><CircleAlert size={18} /><span>{error}</span><Button onClick={() => void run('refresh', refresh)}>{tr('重试', 'Retry')}</Button></div>}
        {loading ? <div className="loading-skeleton" aria-label={tr('加载中', 'Loading')}><div /><div /><div /></div> : <>
          {page === 'models' && <Models onManage={() => navigate('providers')} />}
          {page === 'providers' && <Providers />}
          {page === 'call-logs' && <Logs key="calls" scope="calls" />}
          {page === 'system-logs' && <Logs key="system" scope="system" />}
          {page === 'settings' && <Settings />}
          {page === null && <Empty title={tr('页面不存在', 'Page not found')} action={<Button onClick={() => navigate('models')}>{tr('返回模型库', 'Back to models')}</Button>} />}
        </>}
      </main>
    </div>
    <Toast />
  </div>;
}
