/* LudoApp · servidor EN VIVO (estilo Kahoot) · Node + Socket.IO
 * Sirve la app, y gestiona salas con PIN. El docente (host) NO juega: espectea.
 * Variables: PORT, HOST_KEY (clave del docente; si no se define, cualquiera puede ser host). */
const http = require('http'), fs = require('fs'), path = require('path');
const { Server } = require('socket.io');
const ROOT = __dirname, PORT = Number(process.env.PORT) || 8787, HOST_KEY = process.env.HOST_KEY || '';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg' };
const BLOCK = /(^|\/)(\.|node_modules|\.env|ludo-server-data|servidor|package|db\/|api\/|tests\/|parches)/i;

const server = http.createServer((req, res) => {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/health') { res.writeHead(200); return res.end('ok'); }
  if (p === '/') p = '/live.html';
  const fp = path.normalize(path.join(ROOT, p));
  if (!fp.startsWith(ROOT) || BLOCK.test(p.slice(1))) { res.writeHead(403); return res.end('forbidden'); }
  fs.stat(fp, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
});
const io = new Server(server, { cors: { origin: '*' }, pingInterval: 10000, pingTimeout: 20000 });

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
setInterval(() => { const now = Date.now(); rooms.forEach((r, k) => { if (now - r.created > 4 * 3600e3) rooms.delete(k); }); }, 600e3);
server.listen(PORT, () => console.log('LudoApp EN VIVO → http://localhost:' + PORT + (HOST_KEY ? '  (clave docente activa)' : '')));
