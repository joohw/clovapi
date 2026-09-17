import { useId } from 'react';
import { X } from 'lucide-react';
import { useApp } from '../context';
import { pretty } from '../domain';
import type { ProxyLogEntry } from '../types';
import { IconButton } from './common';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

function DetailSection({ title, value }: { title: string; value: unknown }) {
  const id = useId();
  return <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
    <h3 id={id} className="shrink-0 text-xs font-medium">{title}</h3>
    <pre tabIndex={0} aria-labelledby={id} className="m-0 min-h-0 flex-1 overflow-auto overscroll-contain rounded-lg border border-border bg-muted/50 p-4 text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere focus-visible:outline-2 focus-visible:outline-ring">{pretty(value)}</pre>
  </section>;
}

export function LogDetailDialog({ entry, onClose, onClosed }: { entry: ProxyLogEntry; onClose: () => void; onClosed: () => void }) {
  const { tr } = useApp();
  const requestLabel = [entry.request?.method, entry.request?.url].filter(Boolean).join(' ') || '—';
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent
      className="flex h-[min(760px,calc(100dvh-2rem))] w-[calc(100%-2rem)] flex-col overflow-hidden border-border bg-card p-4 sm:max-w-[950px] sm:p-6"
      showCloseButton={false}
      onCloseAutoFocus={event => { event.preventDefault(); onClosed(); }}
    >
      <DialogHeader className="min-w-0 shrink-0 pr-8 text-left">
        <DialogTitle>{tr('调用详情', 'Request details')}</DialogTitle>
        <DialogDescription className="truncate" title={requestLabel}>{requestLabel}</DialogDescription>
      </DialogHeader>
      <DialogClose asChild><IconButton className="absolute top-3 right-3" label={tr('关闭', 'Close')}><X size={16} /></IconButton></DialogClose>
      <Tabs defaultValue="overview" className="min-h-0 flex-1 gap-4 overflow-hidden">
        <TabsList className="w-full shrink-0 sm:w-fit" aria-label={tr('调用详情分类', 'Request detail sections')}>
          <TabsTrigger value="overview" className="px-6">{tr('概览', 'Overview')}</TabsTrigger>
          <TabsTrigger value="request" className="px-6">{tr('请求', 'Request')}</TabsTrigger>
          <TabsTrigger value="response" className="px-6">{tr('响应', 'Response')}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="min-h-0 flex-col gap-4 overflow-hidden data-[state=active]:flex">
          {entry.error && <div role="alert" className="max-h-24 shrink-0 overflow-auto overscroll-contain rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-destructive wrap-anywhere">{entry.error}</div>}
          <DetailSection title={tr('路由与用量', 'Route and usage')} value={{
            status: entry.status || entry.upstream?.status,
            startedAt: entry.startedAt,
            durationMs: entry.durationMs,
            route: entry.route,
            tokenUsage: entry.tokenUsage,
            toolCallCount: entry.toolCallCount,
          }} />
        </TabsContent>
        <TabsContent value="request" className="min-h-0 grid-rows-2 gap-4 overflow-hidden data-[state=active]:grid md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:grid-rows-1">
          <div className="flex min-h-0 min-w-0 flex-col gap-4">
            <DetailSection title={tr('请求头', 'Request headers')} value={entry.request?.headers} />
            <DetailSection title={tr('上游请求头', 'Upstream request headers')} value={entry.upstream?.requestHeaders} />
          </div>
          <DetailSection title={tr('请求内容', 'Request body')} value={entry.request?.body} />
        </TabsContent>
        <TabsContent value="response" className="min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,2fr)] gap-4 overflow-hidden data-[state=active]:grid md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:grid-rows-1">
          <DetailSection title={tr('响应头', 'Response headers')} value={entry.upstream?.headers} />
          <DetailSection title={tr('响应内容', 'Response body')} value={entry.upstream?.body} />
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>;
}
