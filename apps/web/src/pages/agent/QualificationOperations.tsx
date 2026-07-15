import { ArrowSquareOut, CalendarCheck, ChartLineUp, GoogleLogo, PlugsConnected, Target, UsersThree, WarningCircle } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { CalendarConnectionState, GoogleCalendarItem, QualificationOperations as Operations, api, formatDateTime } from '../../api';
import { Button, Empty, Notice, Skeleton, StatusBadge } from '../../ui';

const percent = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 }).format(value);

export function QualificationOperations({ agentId }: { agentId: string }) {
  const [data, setData] = useState<Operations | null>(null);
  const [calendar, setCalendar] = useState<CalendarConnectionState | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendarItem[]>([]);
  const [error, setError] = useState('');
  const [calendarError, setCalendarError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<'connect' | 'select' | 'disconnect' | ''>('');

  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get('calendar');
    if (outcome === 'connected') setNotice('Google Calendar conectado. Os próximos horários já respeitam a agenda selecionada.');
    if (outcome === 'denied') setCalendarError('A conexão foi cancelada no Google. Nenhuma credencial foi salva.');
    if (outcome === 'error') setCalendarError('Não foi possível concluir a conexão. Revise a configuração e tente novamente.');
    if (outcome) {
      const url = new URL(window.location.href); url.searchParams.delete('calendar'); window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
    void Promise.all([
      api<Operations>(`/agents/${agentId}/qualification`),
      api<CalendarConnectionState>(`/agents/${agentId}/calendar-connection`),
    ]).then(([operations, connection]) => { setData(operations); setCalendar(connection); }).catch((reason) => setError(reason.message));
  }, [agentId]);

  useEffect(() => {
    if (calendar?.configured && calendar.connection?.status === 'connected') {
      void api<{ calendars: GoogleCalendarItem[] }>(`/agents/${agentId}/calendar-connection/calendars`).then((result) => setCalendars(result.calendars)).catch((reason) => setCalendarError(reason.message));
    } else setCalendars([]);
  }, [agentId, calendar?.configured, calendar?.connection?.id, calendar?.connection?.status]);

  async function connect() {
    setBusy('connect'); setCalendarError('');
    try {
      const result = await api<{ authorizationUrl: string }>(`/agents/${agentId}/calendar-connection/google/authorize`, { method: 'POST' });
      window.location.assign(result.authorizationUrl);
    } catch (reason) { setCalendarError(reason instanceof Error ? reason.message : 'Não foi possível iniciar a conexão.'); setBusy(''); }
  }

  async function selectCalendar(calendarId: string) {
    setBusy('select'); setCalendarError(''); setNotice('');
    try {
      const result = await api<CalendarConnectionState>(`/agents/${agentId}/calendar-connection`, { method: 'PATCH', body: JSON.stringify({ calendarId }) });
      setCalendar(result); setNotice('Agenda atualizada. A disponibilidade pública já usa este calendário.');
    } catch (reason) { setCalendarError(reason instanceof Error ? reason.message : 'Não foi possível trocar a agenda.'); }
    finally { setBusy(''); }
  }

  async function disconnect() {
    if (!window.confirm('Desconectar o Google Calendar? O agente voltará a usar apenas a agenda interna.')) return;
    setBusy('disconnect'); setCalendarError(''); setNotice('');
    try {
      await api<void>(`/agents/${agentId}/calendar-connection`, { method: 'DELETE' });
      setCalendar({ configured: calendar?.configured ?? false, connection: null }); setCalendars([]); setNotice('Google Calendar desconectado. A agenda interna continua ativa.');
    } catch (reason) { setCalendarError(reason instanceof Error ? reason.message : 'Não foi possível desconectar a agenda.'); }
    finally { setBusy(''); }
  }

  if (error) return <Notice>{error}</Notice>;
  if (!data || !calendar) return <Skeleton rows={5}/>;
  const connection = calendar.connection;

  return <section className="qualification-operations">
    {notice && <Notice tone="success">{notice}</Notice>}
    {calendarError && <Notice>{calendarError}</Notice>}
    <div className="outcome-metrics"><div><UsersThree size={19}/><span>Sessões</span><strong>{data.metrics.sessions}</strong></div><div><Target size={19}/><span>Qualificados</span><strong>{data.metrics.qualified}</strong><small>{percent(data.metrics.qualificationRate)} dos concluídos</small></div><div><CalendarCheck size={19}/><span>Bookings</span><strong>{data.metrics.booked}</strong><small>{percent(data.metrics.bookingRate)} dos qualificados</small></div><div><ChartLineUp size={19}/><span>Score mínimo</span><strong>{data.config.minimumScore}/7</strong><small>{data.config.serviceArea}</small></div></div>

    <section className="workspace-panel calendar-connection-panel">
      <div className="calendar-connection-copy"><div className="calendar-provider-mark"><GoogleLogo size={24} weight="bold"/></div><div><span className="eyebrow">Integração de agenda</span><h2>Google Calendar</h2><p>{connection?.status === 'connected' ? 'Horários ocupados são bloqueados e cada booking confirmado vira um evento com Google Meet.' : 'Conecte a agenda da equipe para eliminar conflitos e criar convites automaticamente.'}</p></div></div>
      {!calendar.configured ? <div className="calendar-connection-action warning"><WarningCircle size={20}/><div><strong>Configuração pendente</strong><span>Adicione as credenciais OAuth do Google no ambiente da API.</span></div></div> : connection?.status === 'connected' ? <div className="calendar-connection-action connected"><div className="calendar-connection-status"><PlugsConnected size={19}/><div><strong>Conectado</strong><span>{connection.calendarName} · {connection.calendarTimeZone}</span><small>Validado {formatDateTime(connection.lastValidatedAt)}</small></div></div><label><span>Agenda usada pelo agente</span><select value={connection.calendarId} disabled={busy === 'select'} onChange={(event) => void selectCalendar(event.target.value)}>{calendars.length ? calendars.map((item) => <option value={item.id} key={item.id}>{item.summary}{item.primary ? ' (principal)' : ''}</option>) : <option value={connection.calendarId}>{connection.calendarName}</option>}</select></label><Button variant="ghost" disabled={Boolean(busy)} onClick={() => void disconnect()}>{busy === 'disconnect' ? 'Desconectando…' : 'Desconectar'}</Button></div> : <div className="calendar-connection-action">{connection?.status === 'reauth_required' && <div className="calendar-reauth"><WarningCircle size={18}/><span>A autorização expirou. Reconecte para reabrir os horários públicos.</span></div>}<Button disabled={Boolean(busy)} onClick={() => void connect()}><GoogleLogo size={17}/>{busy === 'connect' ? 'Abrindo Google…' : connection ? 'Reconectar Google' : 'Conectar Google Calendar'}</Button><small>O token de acesso não é armazenado; a autorização renovável fica criptografada no servidor.</small></div>}
    </section>

    <div className="operations-layout"><div className="workspace-panel"><div className="panel-head"><div><h2>Leads recentes</h2><p>Dados coletados pelo fluxo determinístico.</p></div></div>{data.leads.length ? <div className="lead-list">{data.leads.map((lead) => <article key={lead.id}><div><strong>{lead.answers.name || 'Qualificação em andamento'}</strong><span>{lead.answers.company || 'Empresa não informada'}</span><small>{lead.answers.contact || 'Contato ainda não informado'}</small></div><div><StatusBadge value={lead.status}/><strong>{lead.score}/7</strong><time>{formatDateTime(lead.createdAt)}</time></div></article>)}</div> : <Empty icon={<UsersThree size={27}/>} title="Nenhum lead ainda" body="Publique o agente e faça uma qualificação pelo link público para validar a jornada."/>}</div>
      <div className="operations-side"><section className="workspace-panel"><div className="panel-head"><div><h2>Agenda confirmada</h2><p>{data.config.startTime} - {data.config.endTime}, {data.config.timeZone}.</p></div></div>{data.bookings.length ? <div className="booking-list">{data.bookings.map((booking) => <article key={booking.id}><CalendarCheck size={20}/><div><strong>{booking.contactName}</strong><span>{booking.company}</span><small>{formatDateTime(booking.startAt)}{booking.externalProvider === 'google' ? ' · Google Calendar' : ' · Agenda interna'}</small></div>{booking.externalEventUrl ? <a className="icon-button" href={booking.externalEventUrl} target="_blank" rel="noreferrer" aria-label="Abrir evento no Google Calendar"><ArrowSquareOut size={16}/></a> : <StatusBadge value={booking.status}/>}</article>)}</div> : <Empty icon={<CalendarCheck size={27}/>} title="Agenda livre" body="Bookings confirmados aparecerão aqui."/>}</section><section className="workspace-panel setup-summary"><h2>Contrato instalado</h2><dl><div><dt>Oferta</dt><dd>{data.config.offerName}</dd></div><div><dt>Reunião</dt><dd>{data.config.meetingTitle}</dd></div><div><dt>Horizonte</dt><dd>{data.config.bookingHorizonDays} dias</dd></div><div><dt>Antecedência</dt><dd>{data.config.minimumNoticeHours} horas</dd></div></dl></section></div></div>
  </section>;
}
