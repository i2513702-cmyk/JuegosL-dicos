/* ============================================================
 * LudoApp servidor.js
 * Servidor LOCAL de demostración (sin dependencias, solo Node).
 *   - Sirve la app completa en  http://localhost:8787
 *   - GET  /api/sync  ->  { v, players, users, lobbies }
 *   - POST /api/sync  ->  { players, users, lobbies, deleted }
 *       El servidor fusiona por id usando createdAt/updatedAt y
 *       respeta "tombstones" (borrados), incrementando v.
 *
 * Uso:  node servidor.js   (o PORT=9000 node servidor.js)
 * Abre http://localhost:8787 en los dos navegadores (Edge y Opera GX).
 * ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 8787;
const DATA_FILE = process.env.LUDO_DATA_FILE || path.join(ROOT, 'ludo-server-data.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

const SHARED = ['players', 'users', 'lobbies'];

function emptyDoc() {
  return { v: 0, players: [], users: [], lobbies: [], del: {} };
}

let state = emptyDoc();
try {
  const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (parsed && typeof parsed.v === 'number') state = parsed;
  state.del = state.del || {};
} catch (e) { /* archivo aun no existe */ }

function save() {
  try {
    const tmp = DATA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state));
    fs.renameSync(tmp, DATA_FILE);
  } catch (e) {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(state)); } catch (_) {}
  }
}

function tsOf(r) { return (r && (r.updatedAt || r.createdAt)) || ''; }

function mergeCollection(dst, incoming, col) {
  const byId = new Map();
  (dst || []).forEach((r) => { if (r && r.id !== undefined) byId.set(r.id, r); });
  const delMap = state.del[col] || {};

  (incoming || []).forEach((r) => {
    if (!r || r.id === undefined) return;
    if (r.deleted) { byId.delete(r.id); return; }
    const tombTs = delMap[r.id];
    if (tombTs && tombTs >= tsOf(r)) return; // fue borrado en otro lado y más reciente
    const old = byId.get(r.id);
    if (!old) { byId.set(r.id, r); return; }
    if (tsOf(r) >= tsOf(old)) byId.set(r.id, r);
  });

  const delIn = (state.del.isIncoming && state.del.isIncoming[col]) || {};
  Object.keys(delIn).forEach((id) => byId.delete(id));
  return Array.from(byId.values());
}

function handleSyncPost(body, res) {
  const deleted = body.deleted || {};
  ['players', 'users', 'lobbies'].forEach((col) => {
    const del = deleted[col] || {};
    state.del[col] = state.del[col] || {};
    const pkg = state.del.isIncoming = state.del.isIncoming || {};
    const dst = pkg[col] = pkg[col] || {};
    Object.keys(del).forEach((id) => {
      if (!state.del[col][id] || state.del[col][id] <= del[id]) state.del[col][id] = del[id];
      dst[id] = del[id];
    });
  });
  SHARED.forEach((col) => {
    state[col] = mergeCollection(state[col], body[col], col);
  });
  delete state.del.isIncoming;
  state.v = (state.v || 0) + 1;
  save();
  sendJson(res, 200, { ok: true, v: state.v });
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function serveStatic(urlPath, res) {
  let p = decodeURIComponent(urlPath.split('?')[0]);
  if (p === '/' ) p = '/index.html';
  const fp = path.normalize(path.join(ROOT, p));
  if (!fp.startsWith(ROOT)) { sendJson(res, 403, { ok: false, error: 'forbidden' }); return; }
  fs.stat(fp, (err, st) => {
    if (err || !st.isFile()) { sendJson(res, 404, { ok: false, error: 'not found' }); return; }
    const ext = path.extname(fp).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  if (req.method === 'GET' && url === '/api/sync') {
    sendJson(res, 200, { ok: true, v: state.v, players: state.players, users: state.users, lobbies: state.lobbies });
    return;
  }
  if (req.method === 'POST' && url === '/api/sync') {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 5e6) req.destroy(); });
    req.on('end', () => {
      let body;
      try { body = JSON.parse(raw || '{}'); } catch (e) { sendJson(res, 400, { ok: false, error: 'bad json' }); return; }
      try { handleSyncPost(body, res); } catch (e) { sendJson(res, 500, { ok: false, error: String(e && e.message) }); }
    });
    return;
  }
  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(url, res);
    return;
  }
  sendJson(res, 405, { ok: false });
});

server.listen(PORT, () => {
  console.log('');
  console.log('  🎓 LudoApp · servidor local de demo');
  console.log('');
  console.log('  ✔ Abre la app en los DOS navegadores:');
  console.log('      Edge:    http://localhost:' + PORT);
  console.log('      Opera GX: http://localhost:' + PORT);
  console.log('');
  console.log('  🔁 Las salas (lobbies), jugadores y cuentas demo se comparten');
  console.log('     entre navegadores de esta misma PC en tiempo real.');
  console.log('');
  console.log('  ✖ Cerrá con Ctrl+C (no borra los datos, quedan en ludo-server-data.json)');
  console.log('');
});

process.on('SIGINT', () => { try { save(); } catch (_) {} process.exit(0); });
process.on('SIGTERM', () => { try { save(); } catch (_) {} process.exit(0); });