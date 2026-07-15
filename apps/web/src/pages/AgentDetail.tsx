import { BookOpen, ChartLineUp, Copy, Flask, Globe, Sparkle, Target } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Agent, api } from '../api';
import { Button, Notice, Page, Skeleton } from '../ui';
import { Activity } from './agent/Activity';
import { Chat } from './agent/Chat';
import { Evals } from './agent/Evals';
import { Knowledge } from './agent/Knowledge';
import { QualificationOperations } from './agent/QualificationOperations';

export function AgentDetail() {
  const { id = '' } = useParams(); const [agent, setAgent] = useState<Agent | null>(null); const [tab, setTab] = useState<'operation' | 'knowledge' | 'evals' | 'chat' | 'activity'>('knowledge'); const [publishing, setPublishing] = useState(false); const [publicationNotice, setPublicationNotice] = useState('');
  useEffect(() => { void api<Agent>(`/agents/${id}`).then((value) => { setAgent(value); if (value.templateKey === 'qualification-scheduling') setTab('operation'); }); }, [id]);
  if (!agent) return <Page title="Carregando" subtitle=""><Skeleton/></Page>;
  const publicUrl = `${window.location.origin}/a/${agent.publicId}`;
  const togglePublication = async () => { setPublishing(true); setPublicationNotice(''); try { const result = await api<{ isPublic: boolean; publishedAt: string | null }>(`/agents/${id}/publication`, { method: 'PATCH', body: JSON.stringify({ published: !agent.isPublic }) }); setAgent({ ...agent, ...result }); setPublicationNotice(result.isPublic ? 'Agente publicado. O link já pode ser compartilhado.' : 'Publicação desativada. O link deixou de responder.'); } catch (reason) { setPublicationNotice(reason instanceof Error ? reason.message : 'Falha ao alterar a publicação.'); } finally { setPublishing(false); } };
  return <Page title={agent.name} subtitle={agent.description || 'Agente personalizado'} backTo="/agents" wide action={<div className="agent-head-meta"><span className="model-chip">{agent.model}</span><span className="model-chip">raciocínio {agent.reasoningEffort === 'none' ? 'off' : agent.reasoningEffort}</span>{agent.promptGeneratedAt && <span className="model-chip">prompt v{agent.promptVersion}</span>}</div>}>
    <div className={`publication-bar${agent.isPublic ? ' active' : ''}`}><div><Globe size={20}/><span><strong>{agent.isPublic ? 'Teste público ativo' : 'Teste privado'}</strong><small>{agent.isPublic ? publicUrl : 'Publique para gerar uma URL pública e reversível.'}</small></span></div><div>{agent.isPublic && <Button variant="ghost" onClick={() => { void navigator.clipboard.writeText(publicUrl); setPublicationNotice('Link copiado.'); }}><Copy size={16}/>Copiar link</Button>}<Button onClick={togglePublication} disabled={publishing}>{publishing ? 'Aguarde...' : agent.isPublic ? 'Despublicar' : 'Publicar para teste'}</Button></div></div>
    {publicationNotice && <Notice tone={publicationNotice.includes('Falha') || publicationNotice.includes('Ative') ? undefined : 'success'}>{publicationNotice}</Notice>}
    <div className="tabs">{agent.templateKey === 'qualification-scheduling' && <button className={tab === 'operation' ? 'active' : ''} onClick={() => setTab('operation')}><Target size={17}/>Operação</button>}<button className={tab === 'knowledge' ? 'active' : ''} onClick={() => setTab('knowledge')}><BookOpen size={17}/>Conhecimento</button><button className={tab === 'evals' ? 'active' : ''} onClick={() => setTab('evals')}><Flask size={17}/>Evals</button><button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}><Sparkle size={17}/>Testar</button><button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}><ChartLineUp size={17}/>Atividade</button></div>
    {tab === 'operation' && agent.templateKey === 'qualification-scheduling' && <QualificationOperations agentId={id}/>}
    {tab === 'knowledge' && <Knowledge agentId={id}/>}
    {tab === 'evals' && <Evals agentId={id}/>}
    {tab === 'chat' && <Chat agentId={id}/>}
    {tab === 'activity' && <Activity agentId={id}/>}
  </Page>;
}
