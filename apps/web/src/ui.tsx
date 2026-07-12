import { CheckCircle, WarningCircle, X } from '@phosphor-icons/react';
import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function Button({ children, variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }) {
  return <button className={`button ${variant}`} {...props}>{children}</button>;
}

export function Field({ label, helper, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; helper?: string }) {
  return <label className="field"><span>{label}</span><input {...props}/>{helper && <small>{helper}</small>}</label>;
}

export function Textarea({ label, helper, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; helper?: string }) {
  return <label className="field"><span>{label}</span><textarea {...props}/>{helper && <small>{helper}</small>}</label>;
}

export function Notice({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' }) {
  return <div className={`notice ${tone}`}>{tone === 'error' ? <WarningCircle size={18}/> : <CheckCircle size={18}/>}<span>{children}</span></div>;
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return <div className="empty">{icon}<h3>{title}</h3><p>{body}</p>{action}</div>;
}

export function ForgeMark({ inverse = false }: { inverse?: boolean }) {
  return <img className="forge-mark" src={inverse ? '/brand/forge-mark-inverse.svg' : '/brand/forge-mark.svg'} alt=""/>;
}

export function Brand({ inverse = false }: { inverse?: boolean }) {
  return <div className="brand"><ForgeMark inverse={inverse}/><span className="brand-copy"><strong>FORGE</strong><small>BY NETOLABS</small></span></div>;
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18}/></button></header>{children}</div></div>;
}

export function Page({ title, subtitle, action, backTo, children, wide = false }: { title: string; subtitle: string; action?: ReactNode; backTo?: string; children: ReactNode; wide?: boolean }) {
  return <main className={`page ${wide ? 'page-wide' : ''}`}><header className="page-head"><div>{backTo && <Link className="back" to={backTo}>Voltar</Link>}<h1>{title}</h1><p>{subtitle}</p></div>{action}</header>{children}</main>;
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return <div className="skeleton">{Array.from({ length: rows }, (_, index) => <span key={index}/>)}</div>;
}

export function StatusBadge({ value }: { value: string }) {
  return <span className={`result ${value}`}>{value.replaceAll('_', ' ')}</span>;
}
