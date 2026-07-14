import { ArrowSquareOut, ArrowsClockwise, LinkSimple, PlugsConnected, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { Button, Notice, Skeleton, StatusBadge } from '../../ui';

const CONSENT_VERSION = '2026-07-13';
type BenchlineState = { status: string; consentVersion: string; workspaceUrl?: string; lastSyncAt?: string | null; lastError?: string | null; agent?: null | { latestEval: null | { score: number | null; status: string; completedAt: string | null }; findings: number; recommendations: number } };

export function benchlinePanelMode(status: string) {
  if (['unavailable', 'syncing', 'error', 'revocation_pending', 'revoked', 'connected', 'partial'].includes(status)) return status;
  return 'consent';
}

export function BenchlinePanel({ agentId }: { agentId: string }) {
  const [state, setState] = useState<BenchlineState | null>(null); const [accepted, setAccepted] = useState(false); const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  const load = useCallback(() => api<BenchlineState>(`/benchline/status?agentId=${agentId}`).then(setState), [agentId]);
  useEffect(() => { void load().catch((reason) => setError(reason.message)); }, [load]);
  const act = async (action: 'connect' | 'sync' | 'unlink') => { setBusy(action); setError(''); try { if (action === 'unlink') await api('/benchline/link', { method: 'DELETE' }); else await api(`/benchline/${action}`, { method: 'POST', body: action === 'connect' ? JSON.stringify({ consentAccepted: true, consentVersion: CONSENT_VERSION }) : '{}' }); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha na integração Benchline'); } finally { setBusy(''); } };
  if (!state) return <section className="benchline-panel"><Skeleton/></section>;
  const mode = benchlinePanelMode(state.status);
  const consent = <div className="benchline-consent"><label><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)}/><span>Autorizo o Forge a criar e atualizar minha conta, workspace e definições de agentes no Benchline conforme os termos da integração v{CONSENT_VERSION}.</span></label><Button disabled={!accepted || Boolean(busy)} onClick={() => void act('connect')}><LinkSimple size={16}/>{busy === 'connect' ? 'Vinculando...' : state.status === 'revoked' ? 'Vincular novamente' : 'Vincular Benchline'}</Button></div>;
  let content = consent;
  if (mode === 'unavailable') content = <Notice>A integração ainda não foi configurada neste ambiente.</Notice>;
  else if (mode === 'syncing') content = <div className="benchline-connected"><div><StatusBadge value="syncing"/><span>Sincronizando workspace e agentes…</span><small>Você pode permanecer nesta página enquanto concluímos o vínculo.</small></div><Button variant="ghost" disabled><ArrowsClockwise size={16}/>Sincronizando</Button></div>;
  else if (mode === 'error') content = <div className="benchline-connected"><div><StatusBadge value="error"/><span>Não foi possível concluir a sincronização.</span><small>{state.lastError ?? 'O vínculo continua salvo e pode ser tentado novamente.'}</small></div><Button variant="ghost" disabled={Boolean(busy)} onClick={() => void act('sync')}><ArrowsClockwise size={16}/>{busy === 'sync' ? 'Tentando…' : 'Tentar novamente'}</Button></div>;
  else if (mode === 'revocation_pending') content = <div className="benchline-connected"><div><StatusBadge value="syncing"/><span>Desvinculação aguardando confirmação.</span><small>Novos evals do bundle permanecem bloqueados; o histórico não será apagado.</small></div><Button variant="ghost" disabled={Boolean(busy)} onClick={() => void act('unlink')}><ArrowsClockwise size={16}/>{busy === 'unlink' ? 'Tentando…' : 'Reconciliar agora'}</Button></div>;
  else if (mode === 'revoked') content = <><Notice>O vínculo foi revogado. O histórico no Benchline foi preservado e nenhum agente será sincronizado sem um novo consentimento.</Notice>{consent}</>;
  else if (mode === 'connected' || mode === 'partial') content = <><div className="benchline-connected"><div><StatusBadge value={mode}/><span>{state.agent?.latestEval ? `Último eval: ${state.agent.latestEval.score?.toFixed(1) ?? state.agent.latestEval.status}` : 'Pronto para o primeiro eval'}</span><small>{state.agent?.findings ?? 0} findings / {state.agent?.recommendations ?? 0} recomendações</small></div><div className="actions"><Button variant="ghost" disabled={Boolean(busy)} onClick={() => void act('sync')}><ArrowsClockwise size={16}/>{busy === 'sync' ? 'Sincronizando…' : 'Sincronizar'}</Button>{state.workspaceUrl && <a className="button primary" href={state.workspaceUrl} target="_blank" rel="noreferrer">Abrir Benchline<ArrowSquareOut size={16}/></a>}<button className="icon-button" aria-label="Desvincular Benchline" disabled={Boolean(busy)} onClick={() => void act('unlink')}><X size={16}/></button></div></div>{mode === 'partial' && <Notice>Parte dos agentes ainda não foi sincronizada. Use “Sincronizar” para tentar novamente.</Notice>}</>;
  return <section className="benchline-panel"><div className="benchline-copy"><div className="benchline-mark"><PlugsConnected size={20}/></div><div><p className="eyebrow">Forge + Benchline</p><h3>Evals contínuos, sem cobrança adicional</h3><p>Vincule este workspace para sincronizar definições de agentes e receber score, findings e recomendações. Knowledge, conversas e chamadas de modelo não são enviados.</p></div></div>{error && <Notice>{error}</Notice>}{content}</section>;
}
