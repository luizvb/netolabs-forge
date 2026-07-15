import { ArrowRight, CalendarCheck, CheckCircle, ShieldCheck, Target } from '@phosphor-icons/react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AvailabilitySlot, PublicApiError, QualificationQuestion, QualificationTurn, publicApi } from '../api';
import { Button, Notice, Skeleton } from '../ui';

type PublicTemplate = { businessName?: string; offerName?: string; serviceArea?: string; meetingTitle?: string; timeZone?: string };
type PublicInfo = { publicId: string; name: string; description: string; publicTemplate?: PublicTemplate | null };
type FlowMessage = { role: 'agent' | 'user'; text: string };

const sessionKey = (publicId: string) => `forge:qualification:${publicId}`;
const optionLabel = (question: QualificationQuestion, value: string) => question.options?.find((option) => option.value === value)?.label ?? value;

function formatSlot(slot: AvailabilitySlot) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: slot.timeZone, weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(slot.startAt));
}

export function QualificationPublicAgent({ agent }: { agent: PublicInfo }) {
  const [sessionId, setSessionId] = useState<string>(); const [turn, setTurn] = useState<QualificationTurn | null>(null); const [messages, setMessages] = useState<FlowMessage[]>([]);
  const [restoring, setRestoring] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const template = agent.publicTemplate ?? {};
  useEffect(() => {
    const stored = sessionStorage.getItem(sessionKey(agent.publicId));
    if (!stored) { setRestoring(false); return; }
    void publicApi<QualificationTurn>(`/public/agents/${agent.publicId}/qualification/${stored}`).then((result) => {
      setSessionId(stored); setTurn(result); setMessages([{ role: 'agent', text: result.message }]);
    }).catch(() => sessionStorage.removeItem(sessionKey(agent.publicId))).finally(() => setRestoring(false));
  }, [agent.publicId]);

  const begin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); if (data.get('consent') !== 'yes') { setError('Confirme o consentimento para iniciar.'); return; }
    setBusy(true); setError('');
    try {
      const result = await publicApi<QualificationTurn & { sessionId: string }>(`/public/agents/${agent.publicId}/qualification/start`, { method: 'POST', body: JSON.stringify({ consentAccepted: true }) });
      setSessionId(result.sessionId); sessionStorage.setItem(sessionKey(agent.publicId), result.sessionId); setTurn(result); setMessages([{ role: 'agent', text: result.message }]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível iniciar.'); }
    finally { setBusy(false); }
  };

  const respond = async (answer: string) => {
    if (!sessionId || !turn?.question || busy) return;
    const question = turn.question; setBusy(true); setError(''); setMessages((current) => [...current, { role: 'user', text: optionLabel(question, answer) }]);
    try {
      const result = await publicApi<QualificationTurn>(`/public/agents/${agent.publicId}/qualification/${sessionId}/respond`, { method: 'POST', body: JSON.stringify({ requestId: crypto.randomUUID(), questionKey: question.key, answer }) });
      setTurn(result); setMessages((current) => [...current, { role: 'agent', text: result.message }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível registrar a resposta.');
      if (reason instanceof PublicApiError && reason.code === 'STALE_QUALIFICATION_QUESTION') {
        const resumed = await publicApi<QualificationTurn>(`/public/agents/${agent.publicId}/qualification/${sessionId}`); setTurn(resumed);
      }
    } finally { setBusy(false); }
  };

  const submitAnswer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const answer = String(new FormData(form).get('answer') || '').trim(); if (!answer) return; form.reset(); void respond(answer);
  };

  const book = async (slot: AvailabilitySlot) => {
    if (!sessionId || busy) return; setBusy(true); setError('');
    try {
      const result = await publicApi<QualificationTurn>(`/public/agents/${agent.publicId}/qualification/${sessionId}/bookings`, { method: 'POST', body: JSON.stringify({ requestId: crypto.randomUUID(), startAt: slot.startAt }) });
      setTurn(result); setMessages((current) => [...current, { role: 'user', text: formatSlot(slot) }, { role: 'agent', text: result.message }]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível confirmar o horário.');
      if (reason instanceof PublicApiError && reason.code === 'BOOKING_SLOT_UNAVAILABLE') {
        const slots = (reason.details?.slots ?? []) as AvailabilitySlot[]; setTurn((current) => current ? { ...current, slots } : current);
      }
    } finally { setBusy(false); }
  };

  const slotGroups = useMemo(() => turn?.slots ?? [], [turn?.slots]);
  if (restoring) return <section className="qualification-public"><Skeleton rows={4}/></section>;
  if (!turn) return <section className="qualification-public consent-panel"><ShieldCheck size={30}/><h2>Antes de começar</h2><p>O agente fará perguntas sobre sua necessidade e usará os dados apenas para qualificar o contato e organizar o agendamento com {template.businessName || 'a empresa'}.</p><form onSubmit={begin}><label className="consent-check"><input type="checkbox" name="consent" value="yes"/><span>Concordo em enviar estas informações para contato e agendamento.</span></label>{error && <Notice>{error}</Notice>}<Button disabled={busy}>{busy ? 'Iniciando...' : 'Começar qualificação'} <ArrowRight size={17}/></Button></form></section>;
  return <section className="qualification-public"><div className="qualification-progress"><Target size={18}/><div><strong>{turn.status === 'collecting' ? 'Qualificação em andamento' : turn.status === 'qualified' ? 'Perfil qualificado' : turn.status === 'booked' ? 'Horário confirmado' : 'Análise concluída'}</strong><span>{template.offerName}</span></div></div><div className="qualification-messages" aria-live="polite">{messages.map((message, index) => <div className={`qualification-message ${message.role}`} key={`${message.role}-${index}`}>{message.text}</div>)}{busy && <div className="qualification-message agent pending">Registrando</div>}</div>{error && <Notice>{error}</Notice>}
    {turn.status === 'collecting' && turn.question && <div className="current-question"><span>Próxima informação</span><strong>{turn.question.label}</strong></div>}
    {turn.status === 'collecting' && turn.question?.type === 'choice' && <div className="choice-grid" aria-label={turn.question.label}>{turn.question.options?.map((option) => <button key={option.value} disabled={busy} onClick={() => void respond(option.value)}>{option.label}<ArrowRight size={16}/></button>)}</div>}
    {turn.status === 'collecting' && turn.question && turn.question.type !== 'choice' && <form className="qualification-answer" onSubmit={submitAnswer}>{turn.question.type === 'long_text' ? <textarea name="answer" aria-label="Resposta" placeholder="Descreva sua necessidade" minLength={10} maxLength={2000} required/> : <input name="answer" aria-label="Resposta" placeholder="Digite sua resposta" minLength={2} maxLength={180} autoComplete={turn.question.key === 'name' ? 'name' : 'off'} required/>}<Button disabled={busy} aria-label="Enviar resposta"><ArrowRight size={18}/></Button></form>}
    {turn.status === 'qualified' && <div className="slot-picker"><header><CalendarCheck size={22}/><div><h2>Escolha um horário</h2><p>{template.meetingTitle}. Horário de Brasília.</p></div></header>{slotGroups.length ? <div>{slotGroups.map((slot) => <button key={slot.startAt} disabled={busy} onClick={() => void book(slot)}><span>{formatSlot(slot)}</span><ArrowRight size={16}/></button>)}</div> : <p className="no-slots">Não há horários livres nesta janela. A equipe pode entrar em contato pelo dado informado.</p>}</div>}
    {turn.status === 'booked' && <div className="booking-success"><CheckCircle size={30}/><h2>Agendamento confirmado</h2><p>{turn.booking ? formatSlot({ startAt: turn.booking.startAt, endAt: turn.booking.endAt, timeZone: turn.booking.timeZone }) : template.meetingTitle}</p><span>{turn.booking?.conferenceUrl ? 'O link da reunião já está disponível e também foi incluído no convite.' : 'A equipe usará o contato informado para enviar os detalhes.'}</span>{turn.booking?.conferenceUrl && <a className="button primary" href={turn.booking.conferenceUrl} target="_blank" rel="noreferrer">Abrir Google Meet</a>}</div>}
    {turn.status === 'disqualified' && <div className="qualification-terminal"><ShieldCheck size={28}/><h2>Informações registradas</h2><p>O agendamento automático não foi liberado. A equipe ainda poderá revisar o contexto enviado.</p></div>}
  </section>;
}
