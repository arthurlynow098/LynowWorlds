import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createCache } from './cache.mjs';
import * as live from './provider.mjs';
import { archivedEvent, archivedGame, officialRecords } from './official.mjs';

const cache = createCache(process.env.VERCEL ? join(tmpdir(), 'lynow-worlds') : fileURLToPath(new URL('./.cache/', import.meta.url)));
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };

async function agenda() {
  try {
    const snapshot = await cache('schedule', 30000, live.schedule);
    return { items: snapshot.value, updatedAt: new Date(snapshot.at), source: snapshot.stale ? 'Última consulta salva · fonte indisponível' : 'LoL Esports' };
  } catch {
    const saved = JSON.parse(await readFile(new URL('./schedule.json', import.meta.url), 'utf8'));
    return { items: saved.items ?? saved, source: 'Agenda arquivada · LoL Esports', updatedAt: saved.updatedAt ?? null };
  }
}

async function api(path) {
  if (path === '/api/schedule') return agenda();
  if (path === '/api/records') return officialRecords();
  const match = /^\/api\/(event|game)\/([\w-]{1,90})$/.exec(path);
  if (!match) return null;
  const [, kind, id] = match;
  const archived = kind === 'game' ? archivedGame(id) : archivedEvent(id);
  if (archived) return archived;
  const snapshot = await cache(kind + '-' + id, kind === 'game' ? 8000 : 15000, () => live[kind](id));
  return snapshot.stale ? { ...snapshot.value, notice: 'Fonte indisponível. Exibindo a última consulta salva.' } : snapshot.value;
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

export async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname === '/api/entry' && url.searchParams.has('route') ? '/api/' + url.searchParams.get('route') : url.pathname;
  if (req.method !== 'GET') return json(res, 405, { error: 'Use GET.' });
  if (path.startsWith('/api/')) {
    try {
      const value = await api(path);
      return value ? json(res, 200, value) : json(res, 404, { error: 'Recurso desconhecido.' });
    } catch (error) {
      console.warn(path, error.message);
      return json(res, 503, { error: 'A fonte ainda não disponibilizou esses dados. Tente atualizar em instantes.' });
    }
  }
  const file = path === '/' ? '/index.html' : path;
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*[\w-]+\.[a-z0-9]+$/.test(file) || !mime[extname(file)]) return json(res, 404, { error: 'Arquivo desconhecido.' });
  try {
    const bytes = await readFile(new URL('./public' + file, import.meta.url));
    res.writeHead(200, { 'Content-Type': mime[extname(file)], 'X-Content-Type-Options': 'nosniff' });
    res.end(bytes);
  } catch { json(res, 404, { error: 'Arquivo desconhecido.' }); }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const server = createServer(handler);
  const port = Number(process.env.PORT || 3000);
  server.on('error', error => { console.error('Falha ao iniciar:', error.message); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log('Lynow Worlds em http://127.0.0.1:' + server.address().port));
}
