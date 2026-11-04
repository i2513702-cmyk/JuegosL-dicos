/* LudoApp · servidor EN VIVO · Node + Socket.IO
 *  1) Quiz estilo Kahoot: salas con PIN (el docente espectea).
 *  2) OBSERVAR PARTIDAS: el docente crea una sesión con CÓDIGO (ver.html); cada grupo entra con ese
 *     código desde index.html, juega SU partida y su pantalla se transmite en vivo al docente.
 *  3) /api/sync: sincroniza salas (lobbies) y jugadores entre dispositivos (antes solo en servidor.js).
 * Variables: PORT, HOST_KEY (clave del docente; si no se define, cualquiera puede ser host),
 *            LUDO_DATA_FILE (opcional, archivo donde guardar el sync). */
const http = require('http'), fs = require('fs'), path = require('path');
const { Server } = require('socket.io');
const ROOT = __dirname, PORT = Number(process.env.PORT) || 8787, HOST_KEY = process.env.HOST_KEY || '';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg' };
const BLOCK = /(^|\/)(\.|node_modules|\.env|ludo-server-data|servidor|package|db\/|api\/|tests\/|parches)/i;

/* ---------- /api/sync (mismo protocolo que servidor.js) ---------- */
const DATA_FILE = process.env.LUDO_DATA_FILE || path.join(ROOT, 'ludo-server-data.json');
const SHARED = ['players', 'users', 'lobbies'];
let syncState = { v: 0, players: [], users: [], lobbies: [], del: {} };
try { const j = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); if (j && typeof j.v === 'number') { syncState = j; syncState.del = syncState.del || {}; } } catch (e) { /* aún no existe */ }
let saveTimer = null;
function saveSync() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { fs.writeFileSync(DATA_FILE, JSON.stringify(syncState)); } catch (e) { /* disco de solo lectura: se queda en memoria */ } }, 500);
}
const tsOf = (r) => (r && (r.updatedAt || r.createdAt)) || '';
function mergeCollection(dst, incoming, col) {
  const byId = new Map();
  (dst || []).forEach((r) => { if (r && r.id !== undefined) byId.set(r.id, r); });
  const delMap = syncState.del[col] || {};
  (incoming || []).forEach((r) => {
    if (!r || r.id === undefined) return;
    if (r.deleted) { byId.delete(r.id); return; }
    const tomb = delMap[r.id];
    if (tomb && tomb >= tsOf(r)) return;
    const old = byId.get(r.id);
    if (!old || tsOf(r) >= tsOf(old)) byId.set(r.id, r);
  });
  const delIn = (syncState.del.isIncoming && syncState.del.isIncoming[col]) || {};
  Object.keys(delIn).forEach((id) => byId.delete(id));
  return Array.from(byId.values());
}
function sendJson(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); }
function handleSync(req, res) {
  if (req.method === 'GET') return sendJson(res, 200, { ok: true, v: syncState.v, players: syncState.players, users: syncState.users, lobbies: syncState.lobbies });
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false });
  let raw = '';
  req.on('data', (c) => { raw += c; if (raw.length > 5e6) req.destroy(); });
  req.on('end', () => {
    let body; try { body = JSON.parse(raw || '{}'); } catch (e) { return sendJson(res, 400, { ok: false, error: 'bad json' }); }
    try {
      const deleted = body.deleted || {};
      SHARED.forEach((col) => {
        const del = deleted[col] || {};
        syncState.del[col] = syncState.del[col] || {};
        const pkg = syncState.del.isIncoming = syncState.del.isIncoming || {};
        const dst = pkg[col] = pkg[col] || {};
        Object.keys(del).forEach((id) => { if (!syncState.del[col][id] || syncState.del[col][id] <= del[id]) syncState.del[col][id] = del[id]; dst[id] = del[id]; });
      });
      SHARED.forEach((col) => { syncState[col] = mergeCollection(syncState[col], body[col], col); });
      delete syncState.del.isIncoming;
      syncState.v = (syncState.v || 0) + 1; saveSync();
      sendJson(res, 200, { ok: true, v: syncState.v });
    } catch (e) { sendJson(res, 500, { ok: false, error: String(e && e.message) }); }
  });
}

const server = http.createServer((req, res) => {
  let p; try { p = decodeURIComponent((req.url || '/').split('?')[0]); } catch (e) { res.writeHead(400); return res.end('bad request'); }
  if (p === '/health') { res.writeHead(200); return res.end('ok'); }
  if (p === '/api/sync') return handleSync(req, res);
  if (p === '/') p = '/index.html';
  const fp = path.normalize(path.join(ROOT, p));
  if (!fp.startsWith(ROOT) || BLOCK.test(p.slice(1))) { res.writeHead(403); return res.end('forbidden'); }
  fs.stat(fp, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
});
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 10000, pingTimeout: 20000, maxHttpBufferSize: 3e6, perMessageDeflate: { threshold: 1024 } });
/* partidas en red: el servidor lleva el estado del juego (Ludo) */
require('./servidor/partidas').attach(io, { HOST_KEY });

const rooms = new Map();
const rid = () => Math.random().toString(36).slice(2, 10);
function newPin() { let p; do { p = String(Math.floor(100000 + Math.random() * 900000)); } while (rooms.has(p)); return p; }
const clean = (s, n) => String(s || '').replace(/[<>]/g, '').trim().slice(0, n);

function board(r, n) {
  return [...r.players.values()].sort((a, b) => b.score - a.score).slice(0, n || 999)
    .map((p, i) => ({ id: p.id, nick: p.nick, avatar: p.avatar, score: p.score, streak: p.streak, rank: i + 1 }));
}
const lobbyView = (r) => ({ pin: r.pin, state: r.state, players: [...r.players.values()].map((p) => ({ id: p.id, nick: p.nick, avatar: p.avatar, online: p.online })) });
function pub(q) { return { text: q.enunciado, options: q.opciones, category: q.categoria || '', diff: q.dificultad || 'Fácil' }; }

function sendQuestion(r) {
  const q = r.questions[r.idx];
  r.state = 'question'; r.answers = new Map(); r.endsAt = Date.now() + r.time * 1000;
  const base = Object.assign(pub(q), { index: r.idx, total: r.questions.length, time: r.time, endsAt: r.endsAt, now: Date.now() });
  io.to(r.pin).emit('question', base);
  clearTimeout(r.timer); r.timer = setTimeout(() => reveal(r), r.time * 1000 + 300);
}
function reveal(r) {
  if (r.state !== 'question') return;
  clearTimeout(r.timer); r.state = 'reveal';
  const q = r.questions[r.idx], counts = [0, 0, 0, 0];
  r.answers.forEach((a) => { if (a.choice >= 0 && a.choice < 4) counts[a.choice]++; });
  const top = board(r), rankOf = new Map(top.map((t) => [t.id, t.rank]));
  r.players.forEach((p) => {
    const a = r.answers.get(p.id); if (!a) { p.streak = 0; }
    if (p.sid) io.to(p.sid).emit('result', { correct: !!(a && a.correct), gained: a ? a.gained : 0, score: p.score, streak: p.streak, rank: rankOf.get(p.id), of: r.players.size, answered: !!a, right: q.respuesta_correcta });
  });
  io.to(r.hostSid).emit('reveal', { right: q.respuesta_correcta, counts, top: top.slice(0, 5), answered: r.answers.size, last: r.idx >= r.questions.length - 1 });
  io.to(r.pin).emit('reveal-public', { right: q.respuesta_correcta });
}
function finish(r) {
  r.state = 'ended'; clearTimeout(r.timer);
  const b = board(r);
  io.to(r.pin).emit('ended', { board: b, questions: r.questions.length });
}

io.on('connection', (s) => {
  s.on('host:create', (d, ack) => {
    if (HOST_KEY && d.key !== HOST_KEY) return ack({ ok: false, error: 'Clave de docente incorrecta' });
    const qs = (d.questions || []).filter((q) => q && q.enunciado && Array.isArray(q.opciones) && q.opciones.length >= 2).slice(0, 100);
    if (!qs.length) return ack({ ok: false, error: 'No hay preguntas' });
    const pin = newPin(), token = rid();
    rooms.set(pin, { pin, hostSid: s.id, token, questions: qs, idx: -1, state: 'lobby', time: Math.min(60, Math.max(5, +d.time || 20)), players: new Map(), answers: new Map(), created: Date.now() });
    s.join(pin); s.data = { pin, host: true };
    ack({ ok: true, pin, token });
  });
  s.on('host:rejoin', (d, ack) => {
    const r = rooms.get(d.pin); if (!r || r.token !== d.token) return ack({ ok: false });
    r.hostSid = s.id; s.join(r.pin); s.data = { pin: r.pin, host: true };
    ack({ ok: true, lobby: lobbyView(r), idx: r.idx, total: r.questions.length });
  });
  const hostRoom = () => { const r = s.data && s.data.host && rooms.get(s.data.pin); return r && r.hostSid === s.id ? r : null; };
  s.on('host:start', () => { const r = hostRoom(); if (r && r.state === 'lobby' && r.players.size) { r.idx = 0; sendQuestion(r); } });
  s.on('host:reveal', () => { const r = hostRoom(); if (r) reveal(r); });
  s.on('host:next', () => { const r = hostRoom(); if (!r || r.state !== 'reveal') return; r.idx++; r.idx >= r.questions.length ? finish(r) : sendQuestion(r); });
  s.on('host:kick', (id) => { const r = hostRoom(); if (!r) return; const p = r.players.get(id); if (p) { io.to(p.sid).emit('kicked'); r.players.delete(id); io.to(r.pin).emit('lobby', lobbyView(r)); } });
  s.on('host:close', () => { const r = hostRoom(); if (r) { io.to(r.pin).emit('closed'); rooms.delete(r.pin); } });

  s.on('player:join', (d, ack) => {
    const r = rooms.get(clean(d.pin, 6)); if (!r) return ack({ ok: false, error: 'PIN no encontrado' });
    let p = d.pid && r.players.get(d.pid);
    if (p) { p.sid = s.id; p.online = true; }
    else {
      if (r.state !== 'lobby') return ack({ ok: false, error: 'La partida ya empezó' });
      const nick = clean(d.nick, 14); if (nick.length < 2) return ack({ ok: false, error: 'Escribe un apodo (mín. 2 letras)' });
      if ([...r.players.values()].some((x) => x.nick.toLowerCase() === nick.toLowerCase())) return ack({ ok: false, error: 'Ese apodo ya está en uso' });
      if (r.players.size >= 200) return ack({ ok: false, error: 'Sala llena' });
      p = { id: rid(), nick, avatar: (+d.avatar | 0) % 16, score: 0, streak: 0, sid: s.id, online: true, hits: 0 };
      r.players.set(p.id, p);
    }
    s.join(r.pin); s.data = { pin: r.pin, pid: p.id };
    ack({ ok: true, pid: p.id, state: r.state, me: { nick: p.nick, avatar: p.avatar, score: p.score } });
    io.to(r.pin).emit('lobby', lobbyView(r));
    if (r.state === 'question') { const q = r.questions[r.idx]; s.emit('question', Object.assign(pub(q), { index: r.idx, total: r.questions.length, time: r.time, endsAt: r.endsAt, now: Date.now() })); }
  });
  s.on('player:answer', (choice) => {
    const r = rooms.get(s.data && s.data.pin); if (!r || r.state !== 'question' || !s.data.pid) return;
    const p = r.players.get(s.data.pid); if (!p || r.answers.has(p.id)) return;
    choice = +choice; if (!(choice >= 0 && choice < 4)) return;
    const q = r.questions[r.idx], t = Math.max(0, Math.min(r.time * 1000, Date.now() - (r.endsAt - r.time * 1000)));
    const ok = choice === q.respuesta_correcta; let gained = 0;
    if (ok) {
      const w = { 'Fácil': 1, 'Media': 1.25, 'Difícil': 1.5 }[q.dificultad] || 1;
      p.streak++; p.hits++;
      gained = Math.round((1000 * (1 - t / (r.time * 1000) / 2)) * w) + Math.min(p.streak - 1, 5) * 100;
      p.score += gained;
    } else p.streak = 0;
    r.answers.set(p.id, { choice, correct: ok, gained });
    s.emit('answered');
    io.to(r.hostSid).emit('progress', { answered: r.answers.size, total: [...r.players.values()].filter((x) => x.online).length });
    if (r.answers.size >= [...r.players.values()].filter((x) => x.online).length) setTimeout(() => reveal(r), 600);
  });
  s.on('disconnect', () => {
    const r = rooms.get(s.data && s.data.pin); if (!r || !s.data.pid) return;
    const p = r.players.get(s.data.pid); if (p && p.sid === s.id) { p.online = false; io.to(r.pin).emit('lobby', lobbyView(r)); }
  });
});

/* =====================================================================
 * OBSERVAR PARTIDAS EN VIVO (docente ↔ grupos)
 *  docente : watch:create / watch:rejoin / watch:kick / watch:close  → recibe watch:stream y watch:frame
 *  grupo   : share:join (código + nombre) → share:frame (HTML de su pantalla) / share:end
 * El servidor solo retransmite: no ejecuta nada de lo que envía el cliente. */
const watches = new Map();
const WCH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newWatchCode() { let c; do { c = ''; for (let i = 0; i < 5; i++) c += WCH[Math.floor(Math.random() * WCH.length)]; } while (watches.has(c)); return c; }
const MAX_FRAME = 600 * 1024, MAX_BANK = 2.5e6, MIN_GAP = 300;
const reply = (ack, o) => { if (typeof ack === 'function') ack(o); };
const sInfo = (t) => ({ id: t.id, name: t.name, online: t.online, mode: t.mode, ts: t.ts });
const sFull = (t) => Object.assign(sInfo(t), { html: t.html, meta: t.meta });
const cleanMeta = (m) => { m = m || {}; return { vw: Math.min(2000, Math.max(300, +m.vw || 1000)), vh: Math.min(6000, Math.max(200, +m.vh || 700)), cls: clean(m.cls, 200), hcls: clean(m.hcls, 200), rcls: clean(m.rcls, 200) }; };
function cleanBank(b) {
  if (!b || typeof b !== 'object') return null;
  const out = {};
  ['courses', 'categories', 'difficulties', 'questions'].forEach((k) => { out[k] = Array.isArray(b[k]) ? b[k].filter((x) => x && typeof x === 'object') : []; });
  return JSON.stringify(out).length <= MAX_BANK ? out : false;
}
function emitFrame(w, t) { t.lastEmit = Date.now(); io.to(w.hostSid).emit('watch:frame', { id: t.id, html: t.html, mode: t.mode, meta: t.meta, ts: t.ts }); }

io.on('connection', (s) => {
  const hostWatch = () => { const w = s.watchHost && watches.get(s.watchHost); return w && w.hostSid === s.id ? w : null; };

  s.on('watch:create', (d, ack) => {
    d = d || {};
    if (HOST_KEY && d.key !== HOST_KEY) return reply(ack, { ok: false, error: 'Clave de docente incorrecta' });
    const bank = d.bank == null ? null : cleanBank(d.bank);
    if (bank === false) return reply(ack, { ok: false, error: 'El banco de preguntas es demasiado grande' });
    const code = newWatchCode(), token = rid();
    watches.set(code, { code, token, hostSid: s.id, bank, streams: new Map(), created: Date.now() });
    s.watchHost = code; s.join('w:' + code);
    reply(ack, { ok: true, code, token, questions: bank ? bank.questions.length : 0 });
  });

  s.on('watch:rejoin', (d, ack) => {
    d = d || {};
    const w = watches.get(clean(d.code, 6)); if (!w || w.token !== d.token) return reply(ack, { ok: false });
    w.hostSid = s.id; s.watchHost = w.code; s.join('w:' + w.code);
    reply(ack, { ok: true, code: w.code, questions: w.bank ? w.bank.questions.length : 0, streams: [...w.streams.values()].map(sFull) });
  });

  s.on('watch:kick', (id) => { const w = hostWatch(); const t = w && w.streams.get(id); if (!t) return; if (t.sid) io.to(t.sid).emit('share:kicked'); clearTimeout(t.flush); w.streams.delete(id); });
  s.on('watch:close', () => { const w = hostWatch(); if (!w) return; io.to('sh:' + w.code).emit('watch:closed'); w.streams.forEach((t) => clearTimeout(t.flush)); watches.delete(w.code); });

  s.on('share:join', (d, ack) => {
    d = d || {};
    const w = watches.get(clean(d.code, 6).toUpperCase()); if (!w) return reply(ack, { ok: false, error: 'Código no encontrado. Pídeselo a tu docente.' });
    let t = d.id && w.streams.get(d.id);
    if (t) { t.sid = s.id; t.online = true; }
    else {
      if (w.streams.size >= 100) return reply(ack, { ok: false, error: 'La sesión está llena' });
      t = { id: rid(), name: clean(d.name, 24) || 'Grupo ' + (w.streams.size + 1), sid: s.id, online: true, mode: '', html: '', meta: null, ts: 0, lastEmit: 0, flush: null };
      w.streams.set(t.id, t);
    }
    s.join('sh:' + w.code); s.share = { code: w.code, id: t.id };
    reply(ack, { ok: true, id: t.id, code: w.code, name: t.name, bank: w.bank });
    io.to(w.hostSid).emit('watch:stream', sInfo(t));
  });

  s.on('share:frame', (f) => {
    const w = s.share && watches.get(s.share.code), t = w && w.streams.get(s.share.id);
    if (!t || !f || typeof f.html !== 'string' || f.html.length > MAX_FRAME) return;
    t.html = f.html.replace(/<script[\s\S]*?<\/script>/gi, ''); t.mode = clean(f.mode, 20); t.meta = cleanMeta(f.meta); t.ts = Date.now();
    if (t.ts - t.lastEmit >= MIN_GAP) emitFrame(w, t);
    else if (!t.flush) t.flush = setTimeout(() => { t.flush = null; if (watches.get(w.code) === w) emitFrame(w, t); }, MIN_GAP);
  });

  s.on('share:end', () => {
    const w = s.share && watches.get(s.share.code), t = w && w.streams.get(s.share.id); if (!t) return;
    t.mode = ''; t.html = ''; t.ts = Date.now(); io.to(w.hostSid).emit('watch:stream', sInfo(t));
  });

  s.on('disconnect', () => {
    const w = s.share && watches.get(s.share.code), t = w && w.streams.get(s.share.id);
    if (t && t.sid === s.id) { t.online = false; io.to(w.hostSid).emit('watch:stream', sInfo(t)); }
  });
});
setInterval(() => { const now = Date.now(); watches.forEach((w, k) => { if (now - w.created > 8 * 3600e3) watches.delete(k); }); }, 600e3);

setInterval(() => { const now = Date.now(); rooms.forEach((r, k) => { if (now - r.created > 4 * 3600e3) rooms.delete(k); }); }, 600e3);
server.listen(PORT, () => console.log('LudoApp EN VIVO → http://localhost:' + PORT + (HOST_KEY ? '  (clave docente activa)' : '')));
