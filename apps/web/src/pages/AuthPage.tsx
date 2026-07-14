import { ArrowLeft, ArrowRight, GoogleLogo } from '@phosphor-icons/react';
import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Brand, Button, Field, Notice } from '../ui';
import { neonAuthAvailable, signInWithGoogle } from '../auth-client';

export function AuthPage({ onAuth }: { onAuth: () => void }) {
  const [params] = useSearchParams();
  const isPublishing = params.get('intent') === 'publish';
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const legacyVisible = !neonAuthAvailable || import.meta.env.VITE_ALLOW_LEGACY_AUTH === 'true';
  const google = async () => {
    setBusy(true); setError('');
    try { await signInWithGoogle(`/auth${isPublishing ? '?intent=publish' : ''}`); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao entrar com Google'); setBusy(false); }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await api(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) }); onAuth(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao entrar'); }
    finally { setBusy(false); }
  };
  return <main className="auth-shell">
    <section className="auth-story">
      <Link to="/"><Brand inverse/></Link>
      <div><p className="overline">Build / Ground / Evaluate</p><h1>{isPublishing ? 'Seu agente está pronto para o workspace.' : 'Agentes que sustentam resultados.'}</h1><p>{isPublishing ? 'Entre ou crie sua conta para publicar o rascunho sem perder o trabalho.' : 'Crie, conecte conhecimento e prove qualidade antes de colocar um agente para trabalhar.'}</p></div>
      <div className="story-index"><span>Build</span><span>Ground</span><span>Evaluate</span><span>Observe</span></div>
    </section>
    <section className="auth-panel"><form onSubmit={submit} className="auth-form"><Link className="auth-back" to={isPublishing ? '/demo' : '/'}><ArrowLeft size={15}/>{isPublishing ? 'Voltar ao rascunho' : 'Voltar ao site'}</Link><header><h2>Entre no Forge</h2><p>{isPublishing ? 'Autentique para publicar seu agente sem perder o rascunho.' : 'Continue de onde parou ou crie seu workspace.'}</p></header>{error && <Notice>{error}</Notice>}<Button type="button" variant="ghost" disabled={busy || !neonAuthAvailable} onClick={() => void google()}><GoogleLogo size={18} weight="bold"/>{busy ? 'Conectando...' : 'Continuar com Google'}</Button>{!neonAuthAvailable && <Notice>Google via Neon Auth indisponível neste ambiente. Use o acesso local abaixo.</Notice>}{legacyVisible && <><div className="auth-divider"><span>Acesso local</span></div>{mode === 'register' && <Field label="Nome" name="name" autoComplete="name" required minLength={2}/>}<Field label="Email" name="email" type="email" autoComplete="email" required/><Field label="Senha" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} helper="Mínimo de 8 caracteres"/><Button disabled={busy}>{busy ? 'Aguarde...' : mode === 'login' ? 'Entrar' : 'Criar conta'}<ArrowRight size={16}/></Button><button type="button" className="text-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? 'Ainda não tem conta? Criar agora' : 'Já tem uma conta? Entrar'}</button></>}</form></section>
  </main>;
}
