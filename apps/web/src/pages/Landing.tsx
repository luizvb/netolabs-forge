import { ArrowRight, Brain, ChartLineUp, Check, Database, FlowArrow, PlugsConnected, ShieldCheck } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { Brand } from '../ui';

const integrations = [
  ['HubSpot', 'https://cdn.simpleicons.org/hubspot/20231f'],
  ['Salesforce', 'https://a.sfdcstatic.com/shared/images/c360-nav/salesforce-with-type-logo.svg'],
  ['Zendesk', 'https://cdn.simpleicons.org/zendesk/20231f'],
  ['Intercom', 'https://cdn.simpleicons.org/intercom/20231f'],
  ['Zapier', 'https://cdn.simpleicons.org/zapier/20231f'],
] as const;

const method = [
  { icon: PlugsConnected, title: 'Conecta o que já existe', body: 'CRM, conhecimento e canais entram no mesmo fluxo operacional.' },
  { icon: Brain, title: 'Aprende o seu processo', body: 'Regras, tom, limites e escalonamento viram comportamento testável.' },
  { icon: ChartLineUp, title: 'Prova antes de escalar', body: 'Evals e observabilidade mostram se o agente está pronto para produção.' },
] as const;

export function Landing() {
  return <main className="forge-site">
    <nav className="forge-site-nav" aria-label="Navegação principal">
      <Link to="/"><Brand/></Link>
      <div className="forge-site-links">
        <a href="#diferenca">Por que Forge</a>
        <a href="#processo">Como funciona</a>
        <Link to="/auth">Entrar</Link>
        <Link className="forge-site-button forge-site-button-small" to="/agents/new">Criar agente <ArrowRight size={16}/></Link>
      </div>
    </nav>

    <section className="forge-site-hero">
      <div className="forge-site-hero-copy">
        <h1>Atendimento que pensa. E resolve.</h1>
        <div className="forge-site-hero-side">
          <p>Forge transforma processo, CRM e conhecimento em agentes de IA prontos para operar em até duas semanas.</p>
          <div><Link className="forge-site-button" to="/agents/new">Criar agente <ArrowRight size={18}/></Link><a className="forge-site-link" href="#processo">Ver como funciona</a></div>
        </div>
      </div>
      <div className="forge-live-product">
        <div className="forge-live-bar"><span>forge.netolabs.dev/agents/new</span><Link to="/agents/new">Abrir plataforma <ArrowRight size={15}/></Link></div>
        <div className="forge-live-viewport"><iframe src="/agents/new?embed=1" title="Builder real de agentes do Forge" tabIndex={-1}/><Link className="forge-live-overlay" to="/agents/new" aria-label="Abrir o builder real do Forge"/></div>
      </div>
    </section>

    <section className="forge-logo-rail" aria-label="Integrações com CRM e atendimento">
      {integrations.map(([name, src]) => <img key={name} src={src} alt={name} loading="lazy"/>)}
    </section>

    <section className="forge-manifesto" id="diferenca">
      <p className="forge-site-kicker">O novo padrão de atendimento</p>
      <h2>Responder rápido ficou barato.<br/>Responder certo continua difícil.</h2>
      <p>Ferramentas de massa tratam contexto como detalhe. O Forge começa pelo processo, conecta as fontes e testa cada comportamento antes de colocar o agente diante do cliente.</p>
    </section>

    <section className="forge-comparison">
      <div className="forge-comparison-side forge-comparison-generic">
        <header><span>Automação de massa</span><h3>Mais conversas.<br/>O mesmo agente.</h3></header>
        <div><p>Responde sem conhecer a operação.</p><p>Replica um playbook genérico.</p><p>Escala volume antes de provar qualidade.</p></div>
      </div>
      <div className="forge-comparison-side forge-comparison-forge">
        <header><span>Forge</span><h3>Cada empresa.<br/>Um sistema próprio.</h3></header>
        <div><p><Check size={17}/> Consulta contexto antes de agir.</p><p><Check size={17}/> Respeita regras e limites reais.</p><p><Check size={17}/> Só escala depois dos evals.</p></div>
      </div>
    </section>

    <section className="forge-method" id="processo">
      <div className="forge-method-sticky"><h2>Do CRM à resposta, sem perder o contexto.</h2><p>O Forge entra na operação como infraestrutura, não como mais uma caixa de entrada.</p></div>
      <div className="forge-method-cards">{method.map(({ icon: Icon, title, body }, index) => <article key={title} className={`forge-method-card forge-method-card-${index + 1}`}><Icon size={34}/><span>{title}</span><p>{body}</p></article>)}</div>
    </section>

    <section className="forge-delivery">
      <div><p className="forge-site-kicker">Produção em até 2 semanas</p><h2>Curto no calendário.<br/>Rigoroso na entrega.</h2></div>
      <div className="forge-delivery-track">
        <article><span>Diagnóstico</span><p>Dor, processo, sistemas e riscos.</p></article>
        <article><span>Construção</span><p>Agente, integrações e conhecimento.</p></article>
        <article><span>Validação</span><p>Guardrails, cenários e evals.</p></article>
        <article><span>Produção</span><p>Publicação, observabilidade e melhoria.</p></article>
      </div>
    </section>

    <section className="forge-evals">
      <div className="forge-evals-copy"><ShieldCheck size={38}/><h2>Se não passa nos evals, não vai para produção.</h2><p>Qualidade não é uma percepção. O Forge transforma comportamento em critérios repetíveis e acompanha o agente depois do lançamento.</p></div>
      <div className="forge-evals-grid"><div><Database size={22}/><span>Grounding</span><strong>Respostas apoiadas em fontes reais</strong></div><div><ShieldCheck size={22}/><span>Guardrails</span><strong>Limites que resistem a desvios</strong></div><div><FlowArrow size={22}/><span>Escalonamento</span><strong>Humano no momento certo</strong></div><div><ChartLineUp size={22}/><span>Observabilidade</span><strong>Qualidade, custo e latência visíveis</strong></div></div>
    </section>

    <section className="forge-final-cta">
      <h2>Comece pelo trabalho.<br/>O login vem depois.</h2>
      <p>Entre na plataforma, defina o agente e revise o prompt. Sua conta só será solicitada na publicação.</p>
      <Link className="forge-site-button forge-site-button-light" to="/agents/new">Criar agente <ArrowRight size={18}/></Link>
    </section>

    <footer className="forge-site-footer"><Brand/><p>Agentes de IA construídos para operações reais.</p><a href="https://netolabs.dev" target="_blank" rel="noreferrer">NetoLabs</a></footer>
  </main>;
}
