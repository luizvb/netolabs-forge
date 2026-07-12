import { ArrowRight, ChartLineUp, CurrencyDollar, Database, Plus, Robot, Timer } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Agent, AnalyticsOverview, api, formatDuration, formatMoney, formatTokens } from '../api';
import { Empty, Page, Skeleton, StatusBadge } from '../ui';

export function Dashboard() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  useEffect(() => { void Promise.all([api<Agent[]>('/agents'), api<AnalyticsOverview>('/analytics/overview?days=30')]).then(([nextAgents, nextOverview]) => { setAgents(nextAgents); setOverview(nextOverview); }); }, []);
  return <Page title="Painel" subtitle="Operação, qualidade e custo do seu workspace." wide action={<Link className="button primary" to="/agents/new"><Plus size={16}/>Novo agente</Link>}>
    {!agents || !overview ? <Skeleton/> : <>
      <section className="metric-strip">
        <article><Robot size={18}/><span>Agentes</span><strong>{overview.totals.agents}</strong><small>{agents.filter((agent) => agent.status === 'ready').length} prontos</small></article>
        <article><ChartLineUp size={18}/><span>Chamadas</span><strong>{overview.totals.requests}</strong><small>{formatTokens(overview.totals.totalTokens)} tokens</small></article>
        <article><CurrencyDollar size={18}/><span>Custo estimado</span><strong>{formatMoney(overview.totals.estimatedCostUsd)}</strong><small>últimos 30 dias</small></article>
        <article><Timer size={18}/><span>Latência média</span><strong>{formatDuration(overview.totals.averageLatencyMs)}</strong><small>{Math.round(overview.totals.errorRate * 100)}% de erros</small></article>
        <article className="metric-highlight"><Database size={18}/><span>Knowledge</span><strong>{overview.knowledge.ready}/{overview.knowledge.total}</strong><small>{overview.knowledge.processing + overview.knowledge.queuedJobs} em processamento</small></article>
      </section>
      <div className="dashboard-grid">
        <section className="section-block recent-activity"><div className="section-title"><h2>Atividade recente</h2><Link to="/observability">Ver observabilidade <ArrowRight size={14}/></Link></div>{overview.recentCalls.length ? <div className="activity-list">{overview.recentCalls.map((call) => <Link to={`/observability?call=${call.id}`} key={call.id}><div><strong>{call.input}</strong><small>{call.agentName} / {call.kind.replaceAll('_', ' ')}</small></div><div><span>{formatTokens(call.totalTokens)} tokens</span><span>{formatMoney(call.estimatedCostUsd)}</span></div><StatusBadge value={call.status}/></Link>)}</div> : <Empty icon={<ChartLineUp size={26}/>} title="Sem atividade registrada" body="Conversas, gerações e evals aparecerão aqui com tokens, custo e latência."/>}</section>
        <section className="section-block operations-summary"><div className="section-title"><h2>Qualidade e pipeline</h2></div><div className="operation-numbers"><div><span>Testes executados</span><strong>{overview.tests.total}</strong><small>{overview.tests.passed} aprovados / {overview.tests.failed} falharam</small></div><div><span>Taxa de aprovação</span><strong>{Math.round(overview.totals.evalPassRate * 100)}%</strong><small>casos avaliados</small></div><div><span>Conversas</span><strong>{overview.totals.conversations}</strong><small>nos últimos 30 dias</small></div><div><span>Fontes ativas</span><strong>{overview.knowledge.active}</strong><small>{overview.knowledge.failed} com falha</small></div></div></section>
      </div>
    </>}
  </Page>;
}
