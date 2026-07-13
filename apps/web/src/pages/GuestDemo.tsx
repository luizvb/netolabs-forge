import { ArrowLeft, ArrowRight, Check, MagicWand, ShieldCheck } from '@phosphor-icons/react';
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand, Button, Field, Notice, Textarea } from '../ui';

export type AgentDraft = { name: string; description: string; definition: string; guardrails: string; instructions: string; model: string };
export const PENDING_DRAFT_KEY = 'forge.pending-agent-draft';
const initialDraft: AgentDraft = { name: '', description: '', definition: '', guardrails: '', instructions: '', model: 'gemini-2.5-flash' };

function buildInstructions(draft: AgentDraft) {
  const role = draft.name.trim() || 'Agente de atendimento';
  return `# ${role}\n\n## Objetivo\n${draft.definition.trim()}\n\n## Regras de operação\n- Consulte as fontes conectadas antes de responder.\n- Não invente informações ausentes no CRM ou na base de conhecimento.\n- Confirme dados críticos antes de executar uma ação.\n- Escalone para uma pessoa quando faltar contexto, houver risco ou o cliente solicitar.\n\n## Guardrails adicionais\n${draft.guardrails.trim() || '- Preserve dados pessoais e siga as permissões do workspace.'}\n\n## Critério de qualidade\nA resposta deve ser correta, fundamentada, útil e compatível com o processo da empresa.`;
}

export function GuestDemo() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<AgentDraft>(() => { try { return { ...initialDraft, ...JSON.parse(sessionStorage.getItem(PENDING_DRAFT_KEY) || '{}') }; } catch { return initialDraft; } });
  const [error, setError] = useState(''); const [generated, setGenerated] = useState(false);
  useEffect(() => { sessionStorage.setItem(PENDING_DRAFT_KEY, JSON.stringify(draft)); }, [draft]);
  const set = (key: keyof AgentDraft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const generate = () => { if (draft.definition.trim().length < 20) { setError('Descreva o trabalho do agente com pelo menos 20 caracteres.'); return; } setDraft((current) => ({ ...current, instructions: buildInstructions(current) })); setGenerated(true); setError(''); };
  const publish = (event: FormEvent) => { event.preventDefault(); if (!draft.instructions.trim()) { setError('Gere ou escreva o contrato operacional antes de publicar.'); return; } sessionStorage.setItem(PENDING_DRAFT_KEY, JSON.stringify(draft)); navigate('/auth?intent=publish'); };

  return <main className="demo-shell"><header className="demo-nav"><Link to="/"><Brand/></Link><span>Demo sem login</span><Link className="demo-back" to="/"><ArrowLeft size={16}/> Voltar</Link></header><section className="demo-intro"><div><p className="landing-eyebrow">Crie antes de cadastrar</p><h1>Defina o agente.<br/>Revise o contrato.</h1></div><p>Seu rascunho fica neste navegador. O login só será solicitado quando você publicar no workspace.</p></section><form className="guest-builder" onSubmit={publish}>
    <section className="guest-definition"><header><div><h2>O trabalho</h2><p>Descreva a operação em linguagem natural.</p></div><MagicWand size={22}/></header>{error && <Notice>{error}</Notice>}{generated && <Notice tone="success">Contrato gerado. Agora revise os limites antes de publicar.</Notice>}<Field label="Nome do agente" value={draft.name} onChange={(event) => set('name', event.target.value)} required minLength={2} helper="Use um nome reconhecível para a equipe."/><Field label="Descrição" value={draft.description} onChange={(event) => set('description', event.target.value)} placeholder="Qualifica leads recebidos pelo site"/><Textarea label="O que esse agente deve fazer?" value={draft.definition} onChange={(event) => set('definition', event.target.value)} rows={7} required minLength={20} placeholder="Quero um agente para consultar o histórico no HubSpot, responder dúvidas comerciais e transferir negociações sensíveis..." helper="Inclua público, objetivo, sistemas, limites e quando chamar uma pessoa."/><Textarea label="Regras específicas" value={draft.guardrails} onChange={(event) => set('guardrails', event.target.value)} rows={5} placeholder={'Nunca confirmar desconto sem aprovação\nNão alterar o estágio de negócio sem evidência'} helper="Uma regra por linha. O Forge adiciona proteções essenciais ao contrato."/><Button type="button" onClick={generate}><MagicWand size={17}/>Gerar contrato</Button></section>
    <section className="guest-contract"><header><div><h2>Contrato operacional</h2><p>O comportamento que será avaliado em produção.</p></div><ShieldCheck size={22}/></header><Textarea label="Instruções do agente" value={draft.instructions} onChange={(event) => set('instructions', event.target.value)} rows={24} required placeholder="Gere o contrato a partir da definição ou escreva suas próprias instruções."/><div className="contract-checks"><span><Check size={14}/> Grounding</span><span><Check size={14}/> Guardrails</span><span><Check size={14}/> Escalonamento</span></div><Button type="submit" disabled={!draft.instructions.trim()}>Publicar agente <ArrowRight size={17}/></Button><small>Ao publicar, você cria ou acessa seu workspace. O rascunho será preservado.</small></section>
  </form></main>;
}
