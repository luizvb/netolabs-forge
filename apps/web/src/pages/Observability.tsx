import { ChartLineUp, ChatCircleText, CurrencyDollar, Eye, ListChecks, Timer } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Agent, AnalyticsOverview, ModelCall, api, formatDateTime, formatDuration, formatMoney, formatTokens } from '../api';
import { Empty, Modal, Page, Skeleton, StatusBadge } from '../ui';

const KINDS = ['chat', 'prompt_generation', 'eval_generation', 'eval_candidate', 'eval_judge', 'prompt_review', 'eval_error'];

function CallDetail({ call, onClose }: { call: ModelCall; onClose: () => void }) {
  return <Modal title="Detalhe da chamada" onClose={onClose} wide><div className="call-detail">
    <div className="call-facts"><div><span>Status</span><StatusBadge value={call.status}/></div><div><span>Agente</span><strong>{call.agentName ?? 'Supervisor do workspace'}</strong></div><div><span>Tipo</span><strong>{call.kind.replaceAll('_', ' ')}</strong></div><div><span>Modelo</span><strong>{call.model}</strong></div><div><span>Tokens</span><strong>{call.inputTokens} entrada / {call.outputTokens} saída</strong></div><div><span>Custo estimado</span><strong>{formatMoney(call.estimatedCostUsd)}</strong></div><div><span>Latência</span><strong>{formatDuration(call.latencyMs)}</strong></div><div><span>Data</span><strong>{formatDateTime(call.createdAt)}</strong></div></div>
    <section><h3>Pergunta ou entrada</h3><pre>{call.input}</pre></section>
    <section><h3>Resposta</h3><pre>{call.output || call.error || 'Nenhuma saída registrada.'}</pre></section>
    <section className="pricing-note"><h3>Snapshot de preço</h3><p>{formatMoney(call.pricing.inputPerMillion)} por 1M tokens de entrada / {formatMoney(call.pricing.outputPerMillion)} por 1M tokens de saída.</p><small>{call.pricing.source}</small></section>
    {Object.keys(call.metadata ?? {}).length > 0 && <section><h3>Metadados</h3><pre>{JSON.stringify(call.metadata, null, 2)}</pre></section>}
  </div></Modal>;
}

export function Observability() {
  const [search, setSearch] = useSearchParams();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [calls, setCalls] = useState<ModelCall[] | null>(null);
  const [active, setActive] = useState<ModelCall | null>(null);
  const [days, setDays] = useState(30);
  const [agentId, setAgentId] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const load = useCallback(async () => {
    const overviewQuery = new URLSearchParams({ days: String(days) }); if (agentId) overviewQuery.set('agentId', agentId);
    const callsQuery = new URLSearchParams({ limit: '150' }); if (agentId) callsQuery.set('agentId', agentId); if (kind) callsQuery.set('kind', kind); if (status) callsQuery.set('status', status);
    const [nextOverview, nextCalls] = await Promise.all([api<AnalyticsOverview>(`/analytics/overview?${overviewQuery}`), api<ModelCall[]>(`/analytics/calls?${callsQuery}`)]);
    setOverview(nextOverview); setCalls(nextCalls);
  }, [agentId, days, kind, status]);
  useEffect(() => { void api<Agent[]>('/agents').then(setAgents); }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const callId = search.get('call'); if (callId) void api<ModelCall>(`/analytics/calls/${callId}`).then(setActive); }, [search]);
  const maxRequests = useMemo(() => Math.max(1, ...(overview?.timeline.map((point) => point.requests) ?? [1])), [overview]);
  const openCall = (call: ModelCall) => { setActive(call); setSearch({ call: call.id }); };
  const closeCall = () => { setActive(null); setSearch({}); };
  return <Page title="Observabilidade" subtitle="Todas as perguntas, respostas, testes, tokens, custos e falhas." wide>
    <div className="filter-bar"><label><span>Período</span><select value={days} onChange={(event) => setDays(Number(event.target.value))}><option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option></select></label><label><span>Agente</span><select value={agentId} onChange={(event) => setAgentId(event.target.value)}><option value="">Todos</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label><label><span>Tipo</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="">Todos</option>{KINDS.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label><label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option><option value="succeeded">Sucesso</option><option value="failed">Falha</option></select></label></div>
    {!overview || !calls ? <Skeleton/> : <>
      <section className="observability-metrics"><article><ChatCircleText size={18}/><span>Chamadas</span><strong>{overview.totals.requests}</strong><small>{overview.totals.conversations} conversas</small></article><article><ChartLineUp size={18}/><span>Tokens</span><strong>{formatTokens(overview.totals.totalTokens)}</strong><small>{formatTokens(overview.totals.inputTokens)} entrada / {formatTokens(overview.totals.outputTokens)} saída</small></article><article><CurrencyDollar size={18}/><span>Custo</span><strong>{formatMoney(overview.totals.estimatedCostUsd)}</strong><small>estimativa com preço versionado</small></article><article><Timer size={18}/><span>Latência</span><strong>{formatDuration(overview.totals.averageLatencyMs)}</strong><small>{Math.round(overview.totals.errorRate * 100)}% de erros</small></article><article><ListChecks size={18}/><span>Evals</span><strong>{Math.round(overview.totals.evalPassRate * 100)}%</strong><small>{overview.tests.passed} aprovados / {overview.tests.failed} falharam</small></article></section>
      <section className="section-block usage-chart"><div className="section-title"><h2>Volume diário</h2><span>{overview.rangeDays} dias</span></div><div className="chart-bars" aria-label="Chamadas por dia">{overview.timeline.map((point) => <div key={point.date} title={`${point.date}: ${point.requests} chamadas`}><span style={{ height: `${Math.max(3, point.requests / maxRequests * 100)}%` }}/><small>{point.date.slice(5)}</small></div>)}</div></section>
      <section className="section-block calls-section"><div className="section-title"><h2>Registro de chamadas</h2><span>{calls.length} itens</span></div>{calls.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Data</th><th>Entrada</th><th>Agente</th><th>Tipo</th><th>Tokens</th><th>Custo</th><th>Latência</th><th>Status</th><th/></tr></thead><tbody>{calls.map((call) => <tr key={call.id}><td>{formatDateTime(call.createdAt)}</td><td className="call-input">{call.input}</td><td>{call.agentName}</td><td>{call.kind.replaceAll('_', ' ')}</td><td>{formatTokens(call.totalTokens)}</td><td>{formatMoney(call.estimatedCostUsd)}</td><td>{formatDuration(call.latencyMs)}</td><td><StatusBadge value={call.status}/></td><td><button className="icon-button" onClick={() => openCall(call)} aria-label="Ver detalhes"><Eye size={17}/></button></td></tr>)}</tbody></table></div> : <Empty icon={<ChartLineUp size={27}/>} title="Nenhuma chamada neste filtro" body="Ajuste os filtros ou converse com um agente para gerar telemetria."/>}</section>
    </>}
    {active && <CallDetail call={active} onClose={closeCall}/>} 
  </Page>;
}
