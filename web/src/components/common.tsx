import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Check, Copy, LoaderCircle, X, Inbox, Code2, Sparkles, Server, Plug, type LucideIcon } from 'lucide-react';
import { useApp } from '../context';
import { Button as ShadcnButton } from '@/components/ui/button';

export function Button({ children, className = '', busy, variant = 'default', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; variant?: 'default' | 'primary' | 'danger' | 'ghost' }) {
  const variants = { default: 'secondary', primary: 'default', danger: 'destructive', ghost: 'ghost' } as const;
  return <ShadcnButton type="button" {...props} variant={variants[variant]} disabled={props.disabled || busy} className={className}>{busy && <LoaderCircle size={15} className="spin" />}{children}</ShadcnButton>;
}
export function IconButton({ label, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <ShadcnButton type="button" {...props} variant="ghost" size="icon-sm" className={props.className} title={label} aria-label={label}>{children}</ShadcnButton>;
}
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const { copy, tr } = useApp();
  return <IconButton label={label || tr('复制', 'Copy')} onClick={() => void copy(value)}><Copy size={14} /></IconButton>;
}
const icons: Record<string, LucideIcon> = { codex: Code2, 'claude-code': Sparkles, ollama: Server, custom: Plug };
export function ProviderIcon({ id, small = false }: { id: string; small?: boolean }) {
  const Icon = icons[id] || icons.custom;
  return <span className={`provider-icon ${small ? 'small' : ''}`}><Icon size={small ? 16 : 20} aria-hidden="true" /></span>;
}
export function ProviderName({ id }: { id: string }) {
  return <>{({ codex: 'Codex', 'claude-code': 'Claude', ollama: 'Ollama', custom: 'Custom API' } as Record<string, string>)[id] || id}</>;
}
export function Empty({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="empty"><span className="empty-icon"><Inbox size={25} /></span><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}
export function PageHeading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div><div className="actions">{children}</div></div>;
}
export function Dialog({ title, description, children, onClose, wide = false }: { title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const { tr } = useApp();
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className={`dialog ${wide ? 'wide' : ''}`} aria-labelledby={id} onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="dialog-heading"><div><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div><IconButton label={tr('关闭', 'Close')} onClick={onClose}><X size={19} /></IconButton></div>{children}
  </dialog>;
}
export function Confirm({ title, description, onClose, onConfirm, busy }: { title: string; description: string; onClose: () => void; onConfirm: () => void; busy?: boolean }) {
  const { tr } = useApp();
  return <Dialog title={title} description={description} onClose={onClose}><div className="dialog-actions"><Button onClick={onClose} disabled={busy}>{tr('取消', 'Cancel')}</Button><Button variant="danger" busy={busy} onClick={onConfirm}>{tr('确认删除', 'Delete')}</Button></div></Dialog>;
}
export function Toast() {
  const { toast, setToast, tr } = useApp();
  if (!toast) return null;
  return <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}><Check size={17} /><span>{toast.message}</span><IconButton label={tr('关闭提示', 'Dismiss')} onClick={() => setToast(null)}><X size={15} /></IconButton></div>;
}
