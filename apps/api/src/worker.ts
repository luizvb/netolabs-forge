import { drainKnowledgeJobs } from './knowledge-worker.js';

const pollMs = Math.max(500, Number(process.env.WORKER_POLL_MS ?? 2_000));
let running = true;
process.on('SIGTERM', () => { running = false; });
process.on('SIGINT', () => { running = false; });

while (running) {
  const result = await drainKnowledgeJobs({ limit: 10, workerId: `persistent-${process.pid}` });
  if (!result.processed) await new Promise((resolve) => setTimeout(resolve, pollMs));
}
