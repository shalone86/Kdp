// Small API server. The editor runs entirely in the browser; this server only exists to talk to photo
// services that don't allow direct browser access (CORS) — Immich, Google Photos media downloads and
// iCloud shared albums. It never stores photos or credentials.

import express, { type Request, type Response } from 'express';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSharedAlbum, isICloudAssetUrl } from './icloud';

loadDotEnv();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT ?? process.env.API_PORT ?? 8787);

app.get('/api/config', (_req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    immichDefaultUrl: process.env.IMMICH_DEFAULT_URL || null,
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

// ------------------------------------------------------------------------------------------- Immich
// The browser sends the server URL and API key on every request (headers), we forward to Immich.

const IMMICH_PATHS = [/^albums$/, /^albums\/[\w-]+$/, /^assets\/[\w-]+\/thumbnail$/, /^assets\/[\w-]+\/original$/, /^search\/metadata$/, /^server\/ping$/, /^users\/me$/];

function immichTarget(req: Request): URL | string {
  const base = String(req.header('x-immich-url') ?? '').trim();
  const key = String(req.header('x-immich-key') ?? '').trim();
  if (!base || !key) return 'Missing Immich server URL or API key.';
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return 'That Immich URL doesn’t look right.';
  }
  if (!/^https?:$/.test(url.protocol)) return 'Immich URL must start with http:// or https://';
  const allowed = (process.env.IMMICH_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length && !allowed.includes(url.hostname.toLowerCase())) return 'This Immich host is not allowed by the server configuration.';
  return url;
}

app.all('/api/immich/*path', async (req: Request, res: Response) => {
  const sub = ([] as string[]).concat((req.params as { path: string | string[] }).path).join('/');
  if (!IMMICH_PATHS.some((re) => re.test(sub))) return res.status(404).json({ error: 'Unsupported Immich endpoint' });
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).end();
  const target = immichTarget(req);
  if (typeof target === 'string') return res.status(400).json({ error: target });
  const base = target.href.replace(/\/+$/, '').replace(/\/api$/, '');
  const qs = new URLSearchParams(req.query as Record<string, string>).toString();
  const url = `${base}/api/${sub}${qs ? `?${qs}` : ''}`;
  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers: {
        'x-api-key': String(req.header('x-immich-key')),
        accept: req.header('accept') ?? 'application/json',
        ...(req.method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      body: req.method === 'POST' ? JSON.stringify(req.body ?? {}) : undefined,
    });
    await pipe(upstream, res);
  } catch (e) {
    res.status(502).json({ error: `Couldn’t reach Immich at ${base}: ${(e as Error).message}` });
  }
});

// ------------------------------------------------------------------------------------ Google Photos
// The browser gets an OAuth token (Google Identity Services) and the Picker API session. Picked media
// "baseUrl"s need the token as a header, which the browser can't send cross-origin, so we proxy them.

const PICKER = 'https://photospicker.googleapis.com/v1';

function bearer(req: Request) {
  const h = req.header('authorization') ?? '';
  return /^Bearer [\w.\-~+/]+=*$/.test(h) ? h : null;
}

async function googleCall(req: Request, res: Response, url: string, method = 'GET') {
  const auth = bearer(req);
  if (!auth) return res.status(401).json({ error: 'Missing Google access token' });
  try {
    const upstream = await fetch(url, { method, headers: { authorization: auth, 'content-type': 'application/json' }, body: method === 'POST' ? '{}' : undefined });
    await pipe(upstream, res);
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
}

app.post('/api/google/sessions', (req, res) => googleCall(req, res, `${PICKER}/sessions`, 'POST'));
app.get('/api/google/sessions/:id', (req, res) => googleCall(req, res, `${PICKER}/sessions/${encodeURIComponent(req.params.id)}`));
app.delete('/api/google/sessions/:id', (req, res) => googleCall(req, res, `${PICKER}/sessions/${encodeURIComponent(req.params.id)}`, 'DELETE'));
app.get('/api/google/media-items', (req, res) => {
  const qs = new URLSearchParams({ sessionId: String(req.query.sessionId ?? ''), pageSize: '100' });
  if (req.query.pageToken) qs.set('pageToken', String(req.query.pageToken));
  return googleCall(req, res, `${PICKER}/mediaItems?${qs}`);
});
app.get('/api/google/download', (req, res) => {
  const raw = String(req.query.url ?? '');
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return res.status(400).json({ error: 'Bad URL' });
  }
  if (u.protocol !== 'https:' || !u.hostname.endsWith('.googleusercontent.com')) return res.status(400).json({ error: 'Only Google Photos media URLs can be downloaded' });
  return googleCall(req, res, u.href);
});

// ------------------------------------------------------------------------------------------- iCloud

app.get('/api/icloud/album', async (req, res) => {
  try {
    res.json(await fetchSharedAlbum(String(req.query.url ?? '')));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.get('/api/icloud/download', async (req, res) => {
  const raw = String(req.query.url ?? '');
  if (!isICloudAssetUrl(raw)) return res.status(400).json({ error: 'Only iCloud shared-album media URLs can be downloaded' });
  try {
    await pipe(await fetch(raw), res);
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
});

// ------------------------------------------------------------------------------------------ helpers

async function pipe(upstream: globalThis.Response, res: Response) {
  res.status(upstream.status);
  for (const h of ['content-type', 'content-length', 'cache-control']) {
    const v = upstream.headers.get(h);
    if (v) res.setHeader(h, v);
  }
  if (!upstream.body) return res.end();
  const reader = upstream.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!res.write(value)) await new Promise((r) => res.once('drain', r));
  }
  res.end();
}

function loadDotEnv() {
  const file = path.resolve(process.cwd(), '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// In production, serve the built app too.
if (process.env.NODE_ENV === 'production') {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  app.use(express.static(dist, { index: 'index.html', maxAge: '1h' }));
  app.get('/*path', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Photobook API listening on http://localhost:${PORT}`);
});
