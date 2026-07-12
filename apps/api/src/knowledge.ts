import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import mammoth from 'mammoth';
import { extractText } from 'unpdf';
import { load } from 'cheerio';

export function chunkText(text: string, size = 1200) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < clean.length) {
    let end = Math.min(cursor + size, clean.length);
    if (end < clean.length) {
      const boundary = clean.lastIndexOf(' ', end);
      if (boundary > cursor + size * 0.6) end = boundary;
    }
    chunks.push(clean.slice(cursor, end).trim());
    cursor = end;
  }
  return chunks.filter(Boolean);
}

export async function extractFileText(filename: string, mimeType: string, buffer: Buffer) {
  if (buffer.byteLength > 10 * 1024 * 1024) throw Object.assign(new Error('File exceeds the 10 MB limit'), { statusCode: 413 });
  const extension = filename.toLowerCase().split('.').pop();
  if (mimeType === 'application/pdf' || extension === 'pdf') return (await extractText(new Uint8Array(buffer), { mergePages: true })).text;
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || extension === 'docx') return (await mammoth.extractRawText({ buffer })).value;
  if (mimeType.startsWith('text/') || ['txt', 'md', 'csv'].includes(extension ?? '')) return buffer.toString('utf8');
  throw Object.assign(new Error('Unsupported file. Use PDF, DOCX, TXT, Markdown or CSV.'), { statusCode: 415 });
}

export async function fetchPublicPage(url: string) {
  let target = new URL(url);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    await assertPublicUrl(target);
    const response = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'AgentStudio/0.1' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirect === 3) throw Object.assign(new Error('Too many URL redirects'), { statusCode: 400 });
      target = new URL(location, target);
      continue;
    }
    if (!response.ok) throw Object.assign(new Error(`URL returned ${response.status}`), { statusCode: 400 });
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) throw Object.assign(new Error('URL must return HTML or plain text'), { statusCode: 415 });
    const body = await response.text();
    if (body.length > 2_000_000) throw Object.assign(new Error('URL content exceeds the 2 MB limit'), { statusCode: 413 });
    if (contentType.includes('text/plain')) return body.trim();
    const $ = load(body); $('script,style,noscript,nav,footer,form').remove(); return $('body').text().replace(/\s+/g, ' ').trim().slice(0, 200000);
  }
  throw new Error('Could not fetch URL');
}

async function assertPublicUrl(target: URL) {
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw Object.assign(new Error('URL is not allowed'), { statusCode: 400 });
  const host = target.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw Object.assign(new Error('URL is not allowed'), { statusCode: 400 });
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw Object.assign(new Error('URL resolves to a private network'), { statusCode: 400 });
}

function isPrivateAddress(address: string) {
  const value = address.toLowerCase();
  if (value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true;
  const ipv4 = value.startsWith('::ffff:') ? value.slice(7) : value;
  const parts = ipv4.split('.').map(Number);
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168) || parts[0] >= 224;
}
