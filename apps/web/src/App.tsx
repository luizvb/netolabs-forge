import { ArrowSquareIn, ChartLineUp, CreditCard, Gauge, Robot, SignOut, StackPlus } from '@phosphor-icons/react';
import { ReactNode, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api';
import { PENDING_DRAFT_KEY } from './agent-draft';
import { AgentDetail } from './pages/AgentDetail';
import { AgentsPage, NewAgent } from './pages/Agents';
import { AuthPage } from './pages/AuthPage';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { Observability } from './pages/Observability';
import { Billing } from './pages/Billing';
import { PublicAgent } from './pages/PublicAgent';
import { AgentKits, QualificationKitSetup } from './pages/AgentKits';
import { Brand, ForgeMark } from './ui';
import { signOutNeon } from './auth-client';

export function postAuthDestination(hasPendingDraft: boolean, pathname: string) {
  if (hasPendingDraft) return '/agents/new';
  return pathname === '/auth' ? '/' : null;
}

function Shell({ children, user, onLogout, guest = false }: { children: ReactNode; user?: { name: string }; onLogout?: () => void; guest?: boolean }) {
  const location = useLocation();
  const nav = guest ? [['/agents/new', 'Agentes', Robot]] as const : [['/', 'Painel', Gauge], ['/kits', 'Kits', StackPlus], ['/agents', 'Agentes', Robot], ['/observability', 'Observabilidade', ChartLineUp], ['/billing', 'Plano', CreditCard]] as const;
  const active = (path: string) => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
  return <div className={`app-shell${guest ? ' guest-app-shell' : ''}`}><aside><Brand/><nav>{nav.map(([to, label, Icon]) => <Link key={to} className={active(to) ? 'active' : ''} to={to}><Icon size={18}/>{label}</Link>)}</nav>{guest ? <div className="guest-account"><div><strong>Workspace temporário</strong><small>Seu rascunho fica neste navegador</small></div><Link aria-label="Entrar" to="/auth"><ArrowSquareIn size={18}/></Link></div> : <div className="account"><span>{user!.name.slice(0, 1).toUpperCase()}</span><div><strong>{user!.name}</strong><small>Workspace pessoal</small></div><button aria-label="Sair" onClick={onLogout}><SignOut size={18}/></button></div>}</aside><section className="main-area">{children}</section></div>;
}

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isPublicAgent = location.pathname.startsWith('/a/');
  const publicEntry = isPublicAgent || ['/', '/agents/new', '/demo', '/auth'].includes(location.pathname);
  const [state, setState] = useState<'loading' | 'guest' | 'ready'>(() => publicEntry ? 'guest' : 'loading'); const [user, setUser] = useState<{ name: string } | null>(null);
  const load = () => api<{ user: { name: string } }>('/auth/me').then((result) => {
    setUser(result.user); setState('ready');
    const destination = postAuthDestination(Boolean(sessionStorage.getItem(PENDING_DRAFT_KEY)), location.pathname);
    if (destination) navigate(destination);
  }).catch(() => setState('guest'));
  useEffect(() => { void load(); }, []);
  if (isPublicAgent) return <Routes><Route path="/a/:publicId" element={<PublicAgent/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>;
  if (state === 'loading') return <div className="boot"><ForgeMark inverse/></div>;
  if (state === 'guest') return <Routes><Route path="/" element={<Landing/>}/><Route path="/agents/new" element={<Shell guest><NewAgent guest/></Shell>}/><Route path="/demo" element={<Navigate to="/agents/new" replace/>}/><Route path="/auth" element={<AuthPage onAuth={load}/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>;
  const logout = async () => { await Promise.allSettled([api('/auth/logout', { method: 'POST' }), signOutNeon()]); setState('guest'); };
  return <Shell user={user!} onLogout={logout}><Routes><Route path="/" element={<Dashboard/>}/><Route path="/kits" element={<AgentKits/>}/><Route path="/kits/qualification-scheduling" element={<QualificationKitSetup/>}/><Route path="/agents" element={<AgentsPage/>}/><Route path="/agents/new" element={<NewAgent/>}/><Route path="/agents/:id" element={<AgentDetail/>}/><Route path="/observability" element={<Observability/>}/><Route path="/billing" element={<Billing/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Shell>;
}
