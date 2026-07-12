import { ArrowRight, Sparkle } from '@phosphor-icons/react';
import { FormEvent, useState } from 'react';
import { api, formatDuration, formatMoney, formatTokens } from '../../api';
import { Button, Empty, Notice } from '../../ui';

type ChatMessage = { role: 'user' | 'agent'; text: string; meta?: { tokens: number; cost: number; latencyMs: number } };

export function Chat({ agentId }: { agentId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]); const [conversationId, setConversationId] = useState<string>(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const message = String(new FormData(form).get('message') || ''); if (!message.trim()) return;
    setMessages((current) => [...current, { role: 'user', text: message }]); form.reset(); setBusy(true); setError('');
    try {
      const result = await api<{ response: string; usage: { totalTokens: number }; conversationId: string; estimatedCostUsd: number; latencyMs: number }>(`/agents/${agentId}/chat`, { method: 'POST', body: JSON.stringify({ message, conversationId }) });
      setConversationId(result.conversationId); setMessages((current) => [...current, { role: 'agent', text: result.response, meta: { tokens: result.usage.totalTokens, cost: result.estimatedCostUsd, latencyMs: result.latencyMs } }]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao conversar'); }
    finally { setBusy(false); }
  };
  return <section className="chat"><div className="messages">{!messages.length && <Empty icon={<Sparkle size={27}/>} title="Teste em contexto" body="Faça uma pergunta. Cada resposta será registrada com tokens, custo e latência."/>}{messages.map((message, index) => <div key={index} className={`message-wrap ${message.role}`}><div className={`message ${message.role}`}>{message.text}</div>{message.meta && <small>{formatTokens(message.meta.tokens)} tokens / {formatMoney(message.meta.cost)} / {formatDuration(message.meta.latencyMs)}</small>}</div>)}{busy && <div className="message agent typing">Pensando</div>}</div>{error && <Notice>{error}</Notice>}<form onSubmit={submit}><input name="message" aria-label="Mensagem" placeholder="Pergunte algo ao agente" autoComplete="off"/><Button disabled={busy} aria-label="Enviar"><ArrowRight size={18}/></Button></form></section>;
}
