import { ArrowRight, Robot } from '@phosphor-icons/react';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatDuration, formatMoney, formatTokens, publicApi } from '../api';
import { Brand, Button, Empty, Notice, Skeleton } from '../ui';
import { QualificationPublicAgent } from './QualificationPublicAgent';

type PublicAgentInfo = { publicId: string; name: string; description: string; model: string; reasoningEffort: string; templateKey?: string | null; publicTemplate?: { businessName?: string; offerName?: string; serviceArea?: string; meetingTitle?: string; timeZone?: string } | null };
type Message = { role: 'user' | 'agent'; text: string; meta?: { tokens: number; cost: number; latencyMs: number } };

export function PublicAgent() {
  const { publicId = '' } = useParams();
  const [agent, setAgent] = useState<PublicAgentInfo | null>(null); const [messages, setMessages] = useState<Message[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [missing, setMissing] = useState(false);
  useEffect(() => { void publicApi<PublicAgentInfo>(`/public/agents/${publicId}`).then(setAgent).catch(() => setMissing(true)); }, [publicId]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const message = String(new FormData(form).get('message') || '').trim(); if (!message || busy) return;
    setMessages((current) => [...current, { role: 'user', text: message }]); form.reset(); setBusy(true); setError('');
    try {
      const result = await publicApi<{ response: string; usage: { totalTokens: number }; estimatedCostUsd: number; latencyMs: number }>(`/public/agents/${publicId}/chat`, { method: 'POST', body: JSON.stringify({ message, requestId: crypto.randomUUID() }) });
      setMessages((current) => [...current, { role: 'agent', text: result.response, meta: { tokens: result.usage.totalTokens, cost: result.estimatedCostUsd, latencyMs: result.latencyMs } }]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao conversar com o agente.'); }
    finally { setBusy(false); }
  };
  if (missing) return <main className="public-agent-page"><header><Brand/><Link to="/">Criado com Forge</Link></header><Empty icon={<Robot size={30}/>} title="Agente indisponível" body="Este link não existe ou a publicação foi desativada pelo proprietário."/></main>;
  if (!agent) return <main className="public-agent-page"><header><Brand/></header><Skeleton/></main>;
  return <main className={`public-agent-page${agent.templateKey === 'qualification-scheduling' ? ' qualification-agent-page' : ''}`}><header><Brand/><Link to="/">Criado com Forge</Link></header><section className="public-agent-intro"><span>{agent.templateKey === 'qualification-scheduling' ? 'Qualificação e agenda' : 'Agente publicado'}</span><h1>{agent.name}</h1><p>{agent.description || 'Converse com este agente em um ambiente público de teste.'}</p>{agent.templateKey !== 'qualification-scheduling' && <div><small>{agent.model}</small><small>raciocínio {agent.reasoningEffort === 'none' ? 'desligado' : agent.reasoningEffort}</small></div>}</section>{agent.templateKey === 'qualification-scheduling' ? <QualificationPublicAgent agent={agent}/> : <section className="chat public-chat"><div className="messages">{!messages.length && <Empty icon={<Robot size={27}/>} title="Comece o teste" body="Envie uma pergunta. Não inclua dados pessoais, sigilosos ou credenciais."/>}{messages.map((message, index) => <div key={index} className={`message-wrap ${message.role}`}><div className={`message ${message.role}`}>{message.text}</div>{message.meta && <small>{formatTokens(message.meta.tokens)} tokens / {formatMoney(message.meta.cost)} / {formatDuration(message.meta.latencyMs)}</small>}</div>)}{busy && <div className="message agent typing">Pensando</div>}</div>{error && <Notice>{error}</Notice>}<form onSubmit={submit}><input name="message" aria-label="Mensagem" placeholder="Pergunte algo ao agente" maxLength={4000} autoComplete="off"/><Button disabled={busy} aria-label="Enviar"><ArrowRight size={18}/></Button></form></section>}<footer>{agent.templateKey === 'qualification-scheduling' ? 'Seus dados serão usados pela empresa responsável para contato e agendamento.' : 'As respostas são geradas por IA e podem conter erros.'}</footer></main>;
}
