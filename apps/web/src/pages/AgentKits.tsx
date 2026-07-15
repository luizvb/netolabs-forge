import { ArrowRight, CalendarCheck, CheckCircle, Clock, Target } from '@phosphor-icons/react';
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Agent, AgentTemplate, api } from '../api';
import { Button, Field, Notice, Page, Skeleton } from '../ui';

export function AgentKits() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<AgentTemplate[] | null>(null); const [error, setError] = useState('');
  useEffect(() => { void api<AgentTemplate[]>('/agent-templates').then(setTemplates).catch((reason) => setError(reason.message)); }, []);
  return <Page title="Kits de agentes" subtitle="Instale uma operação completa, com regras, ações, evals e resultado definido." wide>
    {error && <Notice>{error}</Notice>}
    {!templates ? <Skeleton/> : <div className="kit-catalog">{templates.map((template) => <article className="kit-feature" key={template.key}><div className="kit-icon"><Target size={28}/></div><div><span className="kit-availability">Disponível</span><h2>{template.name}</h2><p>{template.description}</p><strong>{template.outcome}</strong><div className="kit-segments">{template.segments.map((segment) => <span key={segment}>{segment}</span>)}</div></div><Button onClick={() => navigate(`/kits/${template.key}`)}>Configurar <ArrowRight size={17}/></Button></article>)}</div>}
    <section className="kit-roadmap-preview"><div><h2>Próximos Kits</h2><p>A mesma camada de capacidades será reutilizada sem transformar cada integração em um agente diferente.</p></div><div className="roadmap-pair"><article><CalendarCheck size={22}/><strong>Atendimento N1</strong><span>Resolução e handoff com contexto</span></article><article><CheckCircle size={22}/><strong>Customer Success</strong><span>Ativação e intervenção de risco</span></article></div></section>
  </Page>;
}

export function QualificationKitSetup() {
  const navigate = useNavigate(); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError('');
    const data = new FormData(event.currentTarget);
    const weekdays = data.getAll('weekdays').map(Number);
    if (!weekdays.length) { setError('Selecione pelo menos um dia de atendimento.'); setSaving(false); return; }
    try {
      const agent = await api<Agent>('/agent-templates/qualification-scheduling/install', { method: 'POST', body: JSON.stringify({
        name: data.get('name'), model: data.get('model'), reasoningEffort: data.get('reasoningEffort'),
        config: {
          businessName: data.get('businessName'), offerName: data.get('offerName'), serviceArea: data.get('serviceArea'), meetingTitle: data.get('meetingTitle'),
          minimumScore: Number(data.get('minimumScore')), timeZone: 'America/Sao_Paulo', weekdays,
          startTime: data.get('startTime'), endTime: data.get('endTime'), meetingDurationMinutes: Number(data.get('meetingDurationMinutes')),
          slotIntervalMinutes: Number(data.get('slotIntervalMinutes')), bookingHorizonDays: Number(data.get('bookingHorizonDays')), minimumNoticeHours: Number(data.get('minimumNoticeHours')),
        },
      }) });
      navigate(`/agents/${agent.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível instalar o Kit.'); }
    finally { setSaving(false); }
  };
  return <Page title="Qualificação + Agendamento" subtitle="Defina o encaixe comercial e a disponibilidade que o agente pode confirmar." backTo="/kits" wide>
    <form className="kit-setup" onSubmit={submit}>
      <section className="kit-setup-main"><div className="kit-section-heading"><Target size={22}/><div><h2>Operação comercial</h2><p>Esses dados viram o contrato do agente e aparecem apenas quando necessário.</p></div></div>{error && <Notice>{error}</Notice>}
        <div className="form-grid">
          <Field name="name" label="Nome do agente" defaultValue="Agente comercial" required minLength={2} helper="Nome visível no workspace e no link publicado."/>
          <Field name="businessName" label="Empresa" placeholder="Ex: NetoLabs" required minLength={2}/>
          <Field name="offerName" label="Oferta principal" placeholder="Ex: projeto de energia solar" required minLength={2}/>
          <Field name="meetingTitle" label="Nome da reunião" placeholder="Ex: diagnóstico de 30 minutos" required minLength={2}/>
          <Field name="serviceArea" label="Área atendida" placeholder="Ex: cidades da Grande São Paulo" required minLength={2} helper="O lead confirma se a demanda está dentro desta área."/>
          <label className="field"><span>Score mínimo</span><select name="minimumScore" defaultValue="4"><option value="3">3 - mais inclusivo</option><option value="4">4 - equilibrado</option><option value="5">5 - mais seletivo</option></select><small>O score máximo é 7 e a área atendida é sempre obrigatória.</small></label>
        </div>
        <div className="kit-section-heading schedule-heading"><Clock size={22}/><div><h2>Disponibilidade</h2><p>Começa na agenda interna; após instalar, você pode conectar o Google Calendar no painel do agente.</p></div></div>
        <fieldset className="weekday-field"><legend>Dias de atendimento</legend><div>{[['1','Seg'],['2','Ter'],['3','Qua'],['4','Qui'],['5','Sex'],['6','Sáb']].map(([value,label]) => <label key={value}><input type="checkbox" name="weekdays" value={value} defaultChecked={value !== '6'}/><span>{label}</span></label>)}</div></fieldset>
        <div className="schedule-grid"><Field type="time" name="startTime" label="Início" defaultValue="09:00" required/><Field type="time" name="endTime" label="Fim" defaultValue="17:00" required/><label className="field"><span>Duração</span><select name="meetingDurationMinutes" defaultValue="30"><option value="30">30 minutos</option><option value="45">45 minutos</option><option value="60">60 minutos</option></select></label><label className="field"><span>Intervalo entre opções</span><select name="slotIntervalMinutes" defaultValue="30"><option value="30">30 minutos</option><option value="45">45 minutos</option><option value="60">60 minutos</option></select></label><label className="field"><span>Janela futura</span><select name="bookingHorizonDays" defaultValue="14"><option value="7">7 dias</option><option value="14">14 dias</option><option value="30">30 dias</option></select></label><label className="field"><span>Antecedência mínima</span><select name="minimumNoticeHours" defaultValue="2"><option value="0">Sem antecedência</option><option value="2">2 horas</option><option value="24">24 horas</option><option value="48">48 horas</option></select></label></div>
        <div className="kit-section-heading model-heading"><CheckCircle size={22}/><div><h2>Modelo de apoio</h2><p>Usado no chat privado e nos evals. A qualificação pública permanece determinística.</p></div></div>
        <div className="schedule-grid"><label className="field"><span>Modelo</span><select name="model" defaultValue="google/gemini-2.5-flash"><option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option><option value="google/gemini-2.5-pro">Gemini 2.5 Pro</option><option value="openai/gpt-5.4">GPT-5.4</option></select></label><label className="field"><span>Raciocínio</span><select name="reasoningEffort" defaultValue="none"><option value="none">Desligado</option><option value="low">Baixo</option><option value="medium">Médio</option></select></label></div>
      </section>
      <aside className="kit-contract"><Target size={26}/><h2>O que será instalado</h2><div><strong>Scorecard fixo</strong><span>Área, papel na decisão, prazo e prontidão.</span></div><div><strong>Agenda transacional</strong><span>Horários reais e proteção contra reserva duplicada.</span></div><div><strong>5 evals iniciais</strong><span>Privacidade, grounding, ações e escalonamento.</span></div><div><strong>Painel de outcomes</strong><span>Sessões, qualificados e bookings confirmados.</span></div><Button disabled={saving}>{saving ? 'Instalando...' : 'Instalar Kit'}</Button><small>A publicação continua desligada até você revisar e ativar o link.</small></aside>
    </form>
  </Page>;
}
