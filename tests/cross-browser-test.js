/* ============================================================
 * E2E: dos "navegadores" (Edge y Opera GX) sincronizando por
 * localStorage SEPARADOS, igual que navegadores reales distintos.
 * Se simulan como dos contextos vm aislados que comparten el
 * servidor local en fetch pero NO storage.
 *
 *  node tests/cross-browser-test.js
 * ============================================================ */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const PORT = 8791;
const BASE = 'http://localhost:' + PORT;
const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(os.tmpdir(), 'ludo-e2e-' + Date.now() + '.json');

const FILES = ['js/core/data.js', 'js/core/storage.js', 'js/auth.js', 'js/core/sync.js'];

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('  OK  ' + msg); }
  else { fail++; console.log('FAIL  ' + msg); }
}

function makeBrowser(label) {
  const ls = new Map();
  const localStorage = {
    getItem: (k) => (ls.has(k) ? ls.get(k) : null),
    setItem: (k, v) => { ls.set(k, String(v)); },
    removeItem: (k) => { ls.delete(k); },
    length: 0
  };
  const sandbox = {
    console, JSON, Math, Date, Object, Array, Map, Set, String, Number, Boolean,
    Promise, Error, RegExp, parseInt, parseFloat, NaN, Infinity,
    setTimeout, clearTimeout, setInterval, clearInterval,
    localStorage,
    fetch: (url, opts) => {
      const full = String(url).startsWith('http') ? String(url) : BASE + String(url);
      return fetch(full, opts);
    },
    dispatchEvent: () => {},
    CustomEvent: function (name) { this.type = name; this.detail = null; },
    pass: (msg) => ok(true, label + ': ' + msg),
    fail: (msg) => ok(false, label + ': ' + msg)
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  FILES.forEach((f) => {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    vm.runInContext(code, ctx, { filename: f });
  });
  return { ctx, label };
}

(async () => {
  if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
  const server = spawn(process.execPath, ['servidor.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(PORT), LUDO_DATA_FILE: DATA_FILE })
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));

  /* esperar servidor */
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try { const r = await fetch(BASE + '/api/sync'); up = r.ok; } catch (e) { await delay(250); }
  }
  ok(up, 'servidor arrancó en el puerto ' + PORT);

  const edge = makeBrowser('Edge');
  const opera = makeBrowser('Opera');
  const A = edge.ctx.App;
  const B = opera.ctx.App;

  /* ---- Fase 1: docente (Edge) crea sala ---- */
  await A.sync.init();
  ok(A.sync.isEnabled(), 'Edge: sync habilitado');
  const loginR = A.auth.login('profe', '1234');
  ok(!!loginR && !!loginR.user, 'Edge: docente inicia sesión');
  const lobby = A.lobby.create(A.auth.who().id);
  ok(!!lobby && lobby.codigo.length === 5, 'Edge: docente creó sala ' + lobby.codigo);
  const lobbyId = lobby.id;
  await delay(1400);

  /* ---- Fase 2: alumna (Opera GX) encuentra y se une ---- */
  await B.sync.init();
  ok(B.sync.isEnabled(), 'Opera: sync habilitado');
  let found = null;
  for (let i = 0; i < 10 && !found; i++) {
    found = B.lobby.byCodigo(lobby.codigo);
    if (!found) await delay(1500);
  }
  ok(!!found, 'Opera: VE la sala creada en Edge (código ' + lobby.codigo + ')');
  if (!found) { await shutdown(server); return; }
  B.auth.login('maria', '1234');
  const maria = B.auth.currentPlayer();
  const joinR = B.lobby.join(found.id, maria.id);
  ok(joinR.ok, 'Opera: maria se unió a la sala');
  await delay(1400);

  /* ---- Fase 3: Edge recibe la incorporación y resuelve el nombre ---- */
  let lobbyBack = null;
  for (let i = 0; i < 10 && !lobbyBack; i++) {
    lobbyBack = A.lobby.get(lobbyId);
    if (lobbyBack && lobbyBack.jugadores.length) break;
    lobbyBack = null;
    await delay(1500);
  }
  ok(!!lobbyBack && lobbyBack.jugadores.length === 1, 'Edge: ve a la alumna recién unida desde Opera');
  const pr = A.storage.getById('players', maria.id);
  ok(!!pr && pr.nombre === 'María Torres', 'Edge: resuelve el nombre de la alumna: ' + (pr ? pr.nombre : '?'));

  /* ---- Fase 4: el docente inicia y la alumna ve "ya comenzó" ---- */
  const startR = A.lobby.start(lobbyId);
  ok(startR.ok, 'Edge: docente inició la partida');
  await delay(1400);
  let seenStarted = null;
  for (let i = 0; i < 10 && !seenStarted; i++) {
    seenStarted = B.lobby.byCodigo(lobby.codigo);
    if (seenStarted && seenStarted.estado === 'jugando') break;
    seenStarted = null;
    await delay(1500);
  }
  ok(!!seenStarted && seenStarted.estado === 'jugando', 'Opera: ve la sala en estado "jugando"');

  /* ---- Fase 5: borrado sincronizado ---- */
  A.lobby.close(lobbyId);
  await delay(1400);
  let gone = null;
  for (let i = 0; i < 10 && !gone; i++) {
    gone = B.lobby.byCodigo(lobby.codigo);
    if (!gone) break;
    gone = null;
    await delay(1500);
  }
  ok(!gone, 'Opera: la sala eliminada en Edge desaparece también en Opera');

  await shutdown(server);
})().catch((e) => { console.error('EXC', e); process.exit(1); });

async function shutdown(server) {
  try { server.kill('SIGKILL'); } catch (e) {}
  try { fs.unlinkSync(DATA_FILE); } catch (e) {}
  console.log('');
  console.log('RESULTADO: ' + pass + ' OK, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
}