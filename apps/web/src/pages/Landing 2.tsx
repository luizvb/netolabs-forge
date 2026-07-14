import { ArrowRight, ChartLineUp, Check, CirclesThreePlus, Database, FlowArrow, ListChecks, ShieldCheck } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { Brand } from '../ui';

const integrations = [['HubSpot', 'hubspot'], ['Salesforce', 'salesforce'], ['Pipedrive', 'pipedrive'], ['Zendesk', 'zendesk'], ['Intercom', 'intercom']] as const;
const differences = [
  { icon: FlowArrow, title: 'Opera dentro do seu processo', body: 'O agente consulta CRM, contexto e regras da operação antes de responder ou agir.' },
  { icon: ShieldCheck, title: 'Sabe quando não responder', body: 'Guardrails e escalonamento humano fazem parte do contrato, não de uma promessa comercial.' },
  { icon: ChartLineUp, title: 'Qualidade que pode ser provada', body: 'Evals repetíveis medem aderência, segurança e resultado antes e depois da produção.' },
] as const;

export function Landing() {
  return <main className="landing">
    <nav className="landing-nav" aria-label="Navegação principal">
      <Link to="/" aria-label="Forge, início"><Brand/></Link>
      <div className="landing-nav-links"><a href="#integracoes">Integrações</a><a href="#metodo">Como funciona</a><Link to="/auth">Entrar</Link><Link className="button landing-nav-cta" to="/demo">Criar agente <ArrowRight size={16}/></Link></div>
    </nav>

    <section className="landing-hero">
      <div className="hero-copy landing-reveal"><p className="landing-eyebrow">IA operacional em até 2 semanas</p><h1>Atendimento com contexto. Não em massa.</h1><p>Agentes conectados ao seu CRM, testados para a sua operação e prontos para produzir.</p><div className="hero-actions"><Link className="button landing-primary" to="/demo">Criar agente <ArrowRight size={17}/></Link><a className="landing-text-link" href="#metodo">Ver o método</a></div></div>
      <Link className="hero-product landing-reveal landing-reveal-delay" to="/demo" aria-label="Abrir demo do criador de agentes">
        <div className="hero-product-top"><span>Rascunho operacional</span><span className="hero-state">Pronto para revisar</span></div>
        <div className="hero-product-body"><div className="hero-product-mark"><CirclesThreePlus size={26}/></div><div><span className="product-label">Objetivo</span><strong>Qualificar leads e atualizar o HubSpot</strong><p>Consulta histórico, responde com contexto e transfere oportunidades sensíveis para uma pessoa.</p></div></div>
        <div className="hero-contract"><span><Check size={14}/> Grounding obrigatório</span><span><Check size={14}/> Escalonamento humano</span><span><Check size={14}/> Suite de evals</span></div>
        <div className="hero-product-footer"><span>Experimente sem login</span><ArrowRight size={18}/></div>
      </Link>
    </section>

    <section className="integration-strip" id="integracoes" aria-label="Integrações com plataformas de atendimento e CRM"><p>Conecta com a operação que sua equipe já usa</p><div className="integration-logos">{integrations.map(([name, slug]) => <img key={name} src={`https://cdn.simpleicons.org/${slug}/20231f`} alt={name} loading="lazy"/>)}</div></section>

    <section className="problem-section">
      <div className="problem-statement"><h2>O gap não é falta de canal.<br/>É falta de contexto.</h2></div>
      <div className="problem-lines"><article><span>Hoje</span><p>Times copiam dados, consultam sistemas e respondem manualmente.</p></article><article><span>Concorrentes</span><p>Automatizam volume com respostas iguais para operações diferentes.</p></article><article className="problem-forge"><span>Forge</span><p>Modela a dor, conecta as fontes e prova qualidade antes de escalar.</p></article></div>
    </section>

    <section className="difference-section"><header><h2>Personalização é arquitetura.</h2><p>Não é trocar o nome da empresa em um prompt.</p></header><div className="difference-grid">{differences.map(({ icon: Icon, title, body }, index) => <article key={title} className={index === 1 ? 'difference-accent' : ''}><Icon size={29}/><h3>{title}</h3><p>{body}</p></article>)}</div></section>

    <section className="method-section" id="metodo"><div className="method-intro"><p className="landing-eyebrow">Do diagnóstico à produção</p><h2>Duas semanas para sair do manual.</h2><p>Um ciclo curto, com critério técnico e operação envolvida desde o primeiro dia.</p></div><div className="method-track"><article><Database size={24}/><h3>Mapear</h3><p>Dor, sistemas, dados e pontos de escalonamento.</p></article><article><FlowArrow size={24}/><h3>Conectar</h3><p>CRM, conhecimento e canais no fluxo real.</p></article><article><ListChecks size={24}/><h3>Avaliar</h3><p>Cenários críticos, guardrails e qualidade mensurável.</p></article><article><ChartLineUp size={24}/><h3>Operar</h3><p>Publicação acompanhada, observabilidade e melhoria contínua.</p></article></div></section>

    <section className="eval-section"><div className="eval-copy"><h2>Produção não é o fim do teste.</h2><p>O Forge registra chamadas, custo, latência e qualidade. Quando o comportamento muda, sua equipe enxerga.</p><Link className="landing-text-link" to="/demo">Testar o builder <ArrowRight size={16}/></Link></div><div className="eval-visual" aria-label="Exemplo de critérios de qualidade monitorados"><div><span>Aderência ao processo</span><strong>Obrigatória</strong></div><div><span>Uso de conhecimento</span><strong>Rastreável</strong></div><div><span>Escalonamento</span><strong>Testado</strong></div><div><span>Operação</span><strong>Observável</strong></div></div></section>

    <section className="landing-cta"><div><h2>Seu primeiro agente começa pela dor.</h2><p>Defina o trabalho agora. Faça login apenas quando estiver pronto para publicar.</p></div><Link className="button landing-cta-button" to="/demo">Criar agente <ArrowRight size={17}/></Link></section>
    <footer className="landing-footer"><Brand/><p>Agentes de IA que sustentam resultados.</p><a href="https://netolabs.dev" target="_blank" rel="noreferrer">NetoLabs</a></footer>
  </main>;
}
