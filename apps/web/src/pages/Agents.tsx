import { Copy, MagicWand, Plus, Robot, ShieldCheck, Trash } from '@phosphor-icons/react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Agent, GeneratedPrompt, api, formatDate } from '../api';
import { Button, Empty, Field, Notice, Page, Skeleton, StatusBadge, Textarea } from '../ui';

function AgentRow({ agent, onDelete }: { agent: Agent; onDelete?: (id: string) => void }) {
  return <div className="agent-row"><Link to={`/agents/${agent.id}`}><span className="agent-glyph"><Robot size={19}/></span><div><strong>{agent.name}</strong><small>{agent.description || 'Sem descrição'}</small></div></Link><StatusBadge value={agent.status}/><time>{formatDate(agent.createdAt)}</time>{onDelete && <button className="icon-button danger" aria-label={`Excluir ${agent.name}`} onClick={() => onDelete(agent.id)}><Trash size={17}/></button>}</div>;
}

export function AgentsPage() {
  const [agents, setAgents] = useState<Agent[] | null>(null); const [error, setError] = useState('');
  const load = useCallback(() => api<Agent[]>('/agents').then(setAgents).catch((reason) => setError(reason.message)), []);
  useEffect(() => { void load(); }, [load]);
  const remove = async (id: string) => { if (!confirm('Excluir este agente e todos os dados relacionados?')) return; await api(`/agents/${id}`, { method: 'DELETE' }); await load(); };
  return <Page title="Agentes" subtitle="Configure comportamento, conhecimento, qualidade e operação." action={<Link className="button primary" to="/agents/new"><Plus size={16}/>Novo agente</Link>}>{error && <Notice>{error}</Notice>}{!agents ? <Skeleton/> : agents.length ? <div className="rows agent-list">{agents.map((agent) => <AgentRow key={agent.id} agent={agent} onDelete={remove}/>)}</div> : <Empty icon={<Robot size={28}/>} title="Seu estúdio está vazio" body="Comece por uma definição simples e deixe o Forge estruturar o prompt oficial." action={<Link className="button primary" to="/agents/new">Criar agente</Link>}/>}</Page>;
}

export function NewAgent() {
  const navigate = useNavigate();
  const [name, setName] = useState(''); const [model, setModel] = useState('gemini-2.5-flash'); const [description, setDescription] = useState('');
  const [definition, setDefinition] = useState(''); const [guardrailInput, setGuardrailInput] = useState(''); const [instructions, setInstructions] = useState('');
  const [generated, setGenerated] = useState<GeneratedPrompt | null>(null); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [generating, setGenerating] = useState(false); const [saving, setSaving] = useState(false);
  const guardrails = guardrailInput.split('\n').map((value) => value.trim()).filter(Boolean);
  const generate = async () => {
    if (definition.trim().length < 20) { setError('Descreva o agente com pelo menos 20 caracteres.'); return; }
    setGenerating(true); setError(''); setNotice('');
    try {
      const result = await api<GeneratedPrompt>('/prompts/generate', { method: 'POST', body: JSON.stringify({ name: name || undefined, definition, guardrails, model: 'gemini-2.5-pro' }) });
      setGenerated(result); setInstructions(result.instructions); setGuardrailInput(result.guardrails.join('\n')); setNotice(result.source === 'google-adk' ? 'Prompt gerado pelo supervisor Google ADK.' : 'Prompt gerado pelo framework seguro local. Conecte Gemini para refinamento pelo supervisor.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao gerar prompt'); }
    finally { setGenerating(false); }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const agent = await api<Agent>('/agents', { method: 'POST', body: JSON.stringify({ name, model, description, promptDefinition: definition, guardrails, instructions, generatedPrompt: Boolean(generated) }) });
      navigate(`/agents/${agent.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao criar agente'); }
    finally { setSaving(false); }
  };
  return <Page title="Novo agente" subtitle="Comece pela intenção. O Forge estrutura papel, limites, grounding e escalonamento." backTo="/agents" wide>
    <form onSubmit={submit} className="prompt-builder">
      <section className="builder-definition"><div className="builder-section-head"><div><h2>Definição</h2><p>Descreva o resultado esperado em linguagem natural.</p></div><MagicWand size={21}/></div>{error && <Notice>{error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}<Field label="Nome" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} helper="Curto e reconhecível para sua equipe."/><Field label="Descrição" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Ex: responde dúvidas do time comercial"/><label className="field"><span>Modelo do agente</span><select value={model} onChange={(event) => setModel(event.target.value)}><option value="gemini-2.5-flash">Gemini 2.5 Flash</option><option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option><option value="gemini-2.5-pro">Gemini 2.5 Pro</option></select></label><Textarea label="O que este agente deve fazer?" value={definition} onChange={(event) => setDefinition(event.target.value)} rows={7} required minLength={20} placeholder="Quero um agente para responder perguntas comerciais do Projeto X usando apenas a base conectada..." helper="Inclua público, objetivo, limites, tom e quando escalar para uma pessoa."/><Textarea label="Guardrails adicionais" value={guardrailInput} onChange={(event) => setGuardrailInput(event.target.value)} rows={6} placeholder={'Uma regra por linha\nNunca confirmar descontos não documentados\nNão coletar dados sensíveis'} helper="O Forge adiciona grounding, privacidade, prompt injection e escalonamento automaticamente."/><Button type="button" onClick={generate} disabled={generating}><MagicWand size={17}/>{generating ? 'Gerando prompt...' : 'Gerar prompt oficial'}</Button></section>
      <section className="builder-prompt"><div className="builder-section-head"><div><h2>Prompt oficial</h2><p>Revise o contrato antes de criar o agente.</p></div><ShieldCheck size={21}/></div><Textarea label="Instruções do sistema" value={instructions} onChange={(event) => setInstructions(event.target.value)} rows={28} required minLength={20} placeholder="Gere o prompt a partir da definição ou escreva manualmente."/>{generated && <div className="prompt-meta"><span>{generated.guardrails.length} guardrails</span><span>{generated.source === 'google-adk' ? generated.model : 'template Forge'}</span><span>{generated.usage.totalTokens} tokens de geração</span></div>}<div className="builder-actions"><Button type="button" variant="ghost" disabled={!instructions} onClick={() => void navigator.clipboard.writeText(instructions)}><Copy size={16}/>Copiar</Button><Button disabled={saving || !instructions.trim()}>{saving ? 'Criando...' : 'Criar agente'}</Button></div></section>
    </form>
  </Page>;
}
