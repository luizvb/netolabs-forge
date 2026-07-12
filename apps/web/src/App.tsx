import { ChartLineUp, Gauge, Robot, SignOut } from '@phosphor-icons/react';
import { ReactNode, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api';
import { AgentDetail } from './pages/AgentDetail';
import { AgentsPage, NewAgent } from './pages/Agents';
import { AuthPage } from './pages/AuthPage';
import { Dashboard } from './pages/Dashboard';
import { Observability } from './pages/Observability';
import { Brand, ForgeMark } from './ui';

function Shell({ children, user, onLogout }: { children: ReactNode; user: { name: string }; onLogout: () => void }) {
  const location = useLocation();
  const nav = [['/', 'Painel', Gauge], ['/agents', 'Agentes', Robot], ['/observability', 'Observabilidade', ChartLineUp]] as const;
  const active = (path: string) => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
  return <div className="app-shell"><aside><Brand/><nav>{nav.map(([to, label, Icon]) => <Link key={to} className={active(to) ? 'active' : ''} to={to}><Icon size={18}/>{label}</Link>)}</nav><div className="account"><span>{user.name.slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><small>Workspace pessoal</small></div><button aria-label="Sair" onClick={onLogout}><SignOut size={18}/></button></div></aside><section className="main-area">{children}</section></div>;
}

export function App() {
  const [state, setState] = useState<'loading' | 'guest' | 'ready'>('loading'); const [user, setUser] = useState<{ name: string } | null>(null);
  const load = () => api<{ user: { name: string } }>('/auth/me').then((result) => { setUser(result.user); setState('ready'); }).catch(() => setState('guest'));
  useEffect(() => { void load(); }, []);
  if (state === 'loading') return <div className="boot"><ForgeMark inverse/></div>;
  if (state === 'guest') return <AuthPage onAuth={load}/>;
  const logout = async () => { await api('/auth/logout', { method: 'POST' }); setState('guest'); };
  return <Shell user={user!} onLogout={logout}><Routes><Route path="/" element={<Dashboard/>}/><Route path="/agents" element={<AgentsPage/>}/><Route path="/agents/new" element={<NewAgent/>}/><Route path="/agents/:id" element={<AgentDetail/>}/><Route path="/observability" element={<Observability/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Shell>;
}
