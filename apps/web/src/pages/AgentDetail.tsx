import { BookOpen, ChartLineUp, Flask, Sparkle } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Agent, api } from '../api';
import { Page, Skeleton } from '../ui';
import { Activity } from './agent/Activity';
import { Chat } from './agent/Chat';
import { Evals } from './agent/Evals';
import { Knowledge } from './agent/Knowledge';

export function AgentDetail() {
  const { id = '' } = useParams(); const [agent, setAgent] = useState<Agent | null>(null); const [tab, setTab] = useState<'knowledge' | 'evals' | 'chat' | 'activity'>('knowledge');
  useEffect(() => { void api<Agent>(`/agents/${id}`).then(setAgent); }, [id]);
  if (!agent) return <Page title="Carregando" subtitle=""><Skeleton/></Page>;
  return <Page title={agent.name} subtitle={agent.description || 'Agente personalizado'} backTo="/agents" wide action={<div className="agent-head-meta"><span className="model-chip">{agent.model}</span>{agent.promptGeneratedAt && <span className="model-chip">prompt v{agent.promptVersion}</span>}</div>}>
    <div className="tabs"><button className={tab === 'knowledge' ? 'active' : ''} onClick={() => setTab('knowledge')}><BookOpen size={17}/>Conhecimento</button><button className={tab === 'evals' ? 'active' : ''} onClick={() => setTab('evals')}><Flask size={17}/>Evals</button><button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}><Sparkle size={17}/>Testar</button><button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}><ChartLineUp size={17}/>Atividade</button></div>
    {tab === 'knowledge' && <Knowledge agentId={id}/>} {tab === 'evals' && <Evals agentId={id}/>} {tab === 'chat' && <Chat agentId={id}/>} {tab === 'activity' && <Activity agentId={id}/>} 
  </Page>;
}
