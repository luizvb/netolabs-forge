import { ArrowRight } from '@phosphor-icons/react';
import { FormEvent, useState } from 'react';
import { api } from '../api';
import { Brand, Button, Field, Notice } from '../ui';

export function AuthPage({ onAuth }: { onAuth: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); onAuth(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao entrar'); }
    finally { setBusy(false); }
  };
  return <main className="auth-shell">
    <section className="auth-story">
      <Brand inverse/>
      <div><p className="overline">Build / Ground / Evaluate</p><h1>Agentes que sustentam resultados.</h1><p>Crie, conecte conhecimento e prove qualidade antes de colocar um agente para trabalhar.</p></div>
      <div className="story-index"><span>Build</span><span>Ground</span><span>Evaluate</span><span>Observe</span></div>
    </section>
    <section className="auth-panel"><form onSubmit={submit} className="auth-form"><header><h2>{mode === 'login' ? 'Bem-vindo de volta' : 'Crie seu workspace'}</h2><p>{mode === 'login' ? 'Continue de onde parou.' : 'Seu primeiro agente começa aqui.'}</p></header>{error && <Notice>{error}</Notice>}{mode === 'register' && <Field label="Nome" name="name" autoComplete="name" required minLength={2}/>}<Field label="Email" name="email" type="email" autoComplete="email" required/><Field label="Senha" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} helper="Mínimo de 8 caracteres"/><Button disabled={busy}>{busy ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}<ArrowRight size={16}/></Button><button type="button" className="text-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Ainda não tem conta? Criar agora' : 'Já tem uma conta? Entrar'}</button></form></section>
  </main>;
}
