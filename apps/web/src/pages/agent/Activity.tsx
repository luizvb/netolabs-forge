import { ArrowRight, ChartLineUp } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ModelCall, api, formatDateTime, formatDuration, formatMoney, formatTokens } from '../../api';
import { Empty, Skeleton, StatusBadge } from '../../ui';

export function Activity({ agentId }: { agentId: string }) {
  const [calls, setCalls] = useState<ModelCall[] | null>(null);
  useEffect(() => { void api<ModelCall[]>(`/analytics/calls?agentId=${agentId}&limit=100`).then(setCalls); }, [agentId]);
  return <section className="workspace-panel"><div className="panel-head"><div><h2>Atividade do agente</h2><p>Perguntas, respostas, geração, evals, tokens e custo.</p></div><Link className="button ghost" to="/observability">Abrir dashboard <ArrowRight size={15}/></Link></div>{!calls ? <Skeleton/> : calls.length ? <div className="agent-call-list">{calls.map((call) => <Link key={call.id} to={`/observability?call=${call.id}`}><div><strong>{call.input}</strong><small>{formatDateTime(call.createdAt)} / {call.kind.replaceAll('_', ' ')}</small></div><span>{formatTokens(call.totalTokens)}</span><span>{formatMoney(call.estimatedCostUsd)}</span><span>{formatDuration(call.latencyMs)}</span><StatusBadge value={call.status}/></Link>)}</div> : <Empty icon={<ChartLineUp size={27}/>} title="Sem chamadas registradas" body="Converse, gere cenários ou execute evals para preencher esta visão."/>}</section>;
}
