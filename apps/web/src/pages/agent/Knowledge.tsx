import { ArrowsClockwise, BookOpen, Database, Eye, FileText, Plus, Power, Trash } from '@phosphor-icons/react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { KnowledgeDetail, Source, api, apiForm, formatDateTime } from '../../api';
import { Button, Empty, Field, Modal, Notice, Skeleton, StatusBadge, Textarea } from '../../ui';

function SourceDetail({ agentId, sourceId, onClose, onChanged }: { agentId: string; sourceId: string; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<KnowledgeDetail | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<KnowledgeDetail>(`/agents/${agentId}/knowledge/${sourceId}`).then(setDetail).catch((reason) => setError(reason.message)), [agentId, sourceId]);
  useEffect(() => { void load(); }, [load]);
  const toggle = async () => { if (!detail) return; setBusy(true); try { await api(`/agents/${agentId}/knowledge/${sourceId}`, { method: 'PATCH', body: JSON.stringify({ active: !detail.active }) }); await load(); onChanged(); } finally { setBusy(false); } };
  const reprocess = async () => { setBusy(true); try { await api(`/agents/${agentId}/knowledge/${sourceId}/reprocess`, { method: 'POST', body: '{}' }); await load(); onChanged(); } finally { setBusy(false); } };
  return <Modal title="Detalhe da fonte" onClose={onClose} wide>{error && <Notice>{error}</Notice>}{!detail ? <Skeleton/> : <div className="knowledge-detail">
    <div className="source-detail-head"><div><FileText size={22}/><div><h3>{detail.title}</h3><p>{detail.type} / versão {detail.version}</p></div></div><div className="actions"><Button variant="ghost" disabled={busy} onClick={toggle}><Power size={16}/>{detail.active ? 'Inativar' : 'Ativar'}</Button><Button variant="ghost" disabled={busy} onClick={reprocess}><ArrowsClockwise size={16}/>Reprocessar</Button></div></div>
    <div className="source-facts"><div><span>Status</span><StatusBadge value={detail.status}/></div><div><span>Ativa</span><strong>{detail.active ? 'Sim' : 'Não'}</strong></div><div><span>Caracteres</span><strong>{detail.characterCount.toLocaleString('pt-BR')}</strong></div><div><span>Chunks</span><strong>{detail.chunkCount}</strong></div><div><span>Atualizada</span><strong>{formatDateTime(detail.updatedAt)}</strong></div><div><span>Processada</span><strong>{formatDateTime(detail.lastProcessedAt)}</strong></div></div>
    {detail.error && <Notice>{detail.error}</Notice>}
    <section><h3>Conteúdo salvo</h3><pre className="content-preview">{detail.rawText || 'Aguardando processamento.'}</pre></section>
    <section><h3>Chunks persistidos</h3>{detail.chunks.length ? <div className="chunk-list">{detail.chunks.map((chunk) => <article key={chunk.id}><span>{chunk.position + 1}</span><p>{chunk.content}</p></article>)}</div> : <p className="muted-copy">Nenhum chunk persistido.</p>}</section>
    <section><h3>Histórico do worker</h3>{detail.jobs.length ? <div className="job-history">{detail.jobs.map((job) => <article key={job.id}><StatusBadge value={job.status}/><div><strong>{job.step}</strong><small>{formatDateTime(job.createdAt)} / tentativa {job.attempts} de {job.maxAttempts}</small>{job.error && <p>{job.error}</p>}</div><span>{job.progress}%</span></article>)}</div> : <p className="muted-copy">Nenhum job registrado.</p>}</section>
  </div>}</Modal>;
}

export function Knowledge({ agentId }: { agentId: string }) {
  const [items, setItems] = useState<Source[] | null>(null); const [open, setOpen] = useState(false); const [detailId, setDetailId] = useState<string | null>(null);
  const [error, setError] = useState(''); const [kind, setKind] = useState<'text' | 'url' | 'file'>('text'); const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<Source[]>(`/agents/${agentId}/knowledge`).then(setItems).catch((reason) => setError(reason.message)), [agentId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!items?.some((item) => item.status === 'processing' || ['queued', 'processing'].includes(item.latestJob?.status ?? ''))) return;
    const timer = window.setInterval(() => { void load(); }, 2_000); return () => window.clearInterval(timer);
  }, [items, load]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setBusy(true); const form = new FormData(event.currentTarget);
    try {
      if (kind === 'file') { const upload = new FormData(); const file = form.get('file'); if (!(file instanceof File) || !file.size) throw new Error('Selecione um arquivo.'); upload.append('file', file); await apiForm(`/agents/${agentId}/knowledge/upload`, upload); }
      else { const payload = kind === 'text' ? { type: kind, title: form.get('title'), content: form.get('content') } : { type: kind, title: form.get('title'), url: form.get('url') }; await api(`/agents/${agentId}/knowledge`, { method: 'POST', body: JSON.stringify(payload) }); }
      setOpen(false); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao adicionar fonte'); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => { if (!confirm('Excluir esta fonte e todos os chunks?')) return; await api(`/agents/${agentId}/knowledge/${id}`, { method: 'DELETE' }); await load(); };
  const toggle = async (source: Source) => { await api(`/agents/${agentId}/knowledge/${source.id}`, { method: 'PATCH', body: JSON.stringify({ active: !source.active }) }); await load(); };
  return <section className="workspace-panel"><div className="panel-head"><div><h2>Base de conhecimento</h2><p>Pipeline durável com conteúdo versionado, chunks e status do worker.</p></div><Button onClick={() => setOpen(true)}><Plus size={16}/>Adicionar</Button></div>{error && <Notice>{error}</Notice>}{!items ? <Skeleton/> : items.length ? <div className="knowledge-list">{items.map((source) => {
    const job = source.latestJob; const progress = job?.status === 'completed' ? 100 : job?.progress ?? (source.status === 'ready' ? 100 : 0);
    return <article key={source.id} className={!source.active ? 'inactive' : ''}><div className="source-icon">{source.type === 'file' ? <FileText size={20}/> : <Database size={20}/>}</div><div className="source-main"><div><strong>{source.title}</strong><span>{source.active ? 'Ativa' : 'Inativa'}</span></div><small>{source.url || `${source.characterCount.toLocaleString('pt-BR')} caracteres / ${source.chunkCount} chunks`}</small>{source.status === 'processing' && <div className="job-progress"><span style={{ width: `${progress}%` }}/><small>{job?.step ?? 'queued'} / {progress}%</small></div>}{source.error && <small className="source-error">{source.error}</small>}</div><div className="source-state"><StatusBadge value={job?.status === 'queued' ? 'queued' : source.status}/><time>{formatDateTime(source.updatedAt)}</time></div><div className="source-actions"><button className="icon-button" onClick={() => setDetailId(source.id)} aria-label="Ver detalhes"><Eye size={16}/></button><button className="icon-button" onClick={() => void toggle(source)} aria-label={source.active ? 'Inativar' : 'Ativar'}><Power size={16}/></button><button className="icon-button danger" onClick={() => void remove(source.id)} aria-label="Excluir fonte"><Trash size={16}/></button></div></article>;
  })}</div> : <Empty icon={<BookOpen size={27}/>} title="Sem fontes conectadas" body="Adicione um documento, texto ou URL pública para reduzir respostas sem base." action={<Button onClick={() => setOpen(true)}>Adicionar fonte</Button>}/>} 
    {open && <Modal title="Nova fonte" onClose={() => setOpen(false)}><form onSubmit={submit} className="modal-form">{error && <Notice>{error}</Notice>}<label className="field"><span>Tipo</span><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="text">Texto</option><option value="url">URL pública</option><option value="file">Documento</option></select></label>{kind !== 'file' && <Field label="Título" name="title" required/>}{kind === 'url' && <Field label="URL" name="url" type="url" placeholder="https://" required/>}{kind === 'text' && <Textarea label="Conteúdo" name="content" rows={9} required helper="O worker normaliza, cria chunks e versiona o conteúdo."/>}{kind === 'file' && <Field label="Arquivo" name="file" type="file" accept=".pdf,.docx,.txt,.md,.csv" required helper="PDF, DOCX, TXT, Markdown ou CSV. Até 10 MB."/>}<Button disabled={busy}>{busy ? 'Enfileirando...' : 'Adicionar fonte'}</Button></form></Modal>}
    {detailId && <SourceDetail agentId={agentId} sourceId={detailId} onClose={() => setDetailId(null)} onChanged={() => void load()}/>} 
  </section>;
}
