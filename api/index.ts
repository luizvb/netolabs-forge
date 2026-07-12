import type { IncomingMessage, ServerResponse } from 'node:http';
import app from '../apps/api/src/server.js';

const ready = app.ready();

export default async function handler(request: IncomingMessage, response: ServerResponse) {
  await ready;

  const url = new URL(request.url ?? '/', 'http://forge.internal');
  const path = url.searchParams.get('__forge_path') ?? '';
  url.searchParams.delete('__forge_path');
  request.url = `/${path}${url.search}`;

  app.server.emit('request', request, response);
}
