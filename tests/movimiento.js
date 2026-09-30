/* ============================================================
 * Driver: abre tests/movimiento.html en Edge headless y comprueba
 * que las fichas de Ludo, Carrera y Conquista SE MUEVEN al jugar.
 *   node tests/movimiento.js
 * ============================================================ */
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EDGE = fs.existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
  ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  : 'C:/Program Files/Microsoft/Edge/Application/msedge.exe';

const ROOT = path.join(__dirname, '..');
const PORT = 8797;
const BASE = 'http://localhost:' + PORT;
const PROFILE = path.join(os.tmpdir(), 'ludo-mov-' + Date.now());
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const server = spawn(process.execPath, ['servidor.js'], {
    cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(PORT) })
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));

  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try { const r = await fetch(BASE + '/api/sync'); up = r.ok; } catch (e) { await delay(250); }
  }
  if (!up) { console.error('No arrancó servidor'); process.exit(2); }

  let dom = '';
  try {
    dom = execFileSync(EDGE, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
      '--user-data-dir=' + PROFILE, '--virtual-time-budget=120000',
      '--dump-dom', BASE + '/tests/movimiento.html'
    ], { encoding: 'utf8', timeout: 260000, maxBuffer: 40 * 1024 * 1024 });
  } catch (e) { dom = (e.stdout || '').toString(); }

  const m = dom.match(/<pre id="mov-out"[^>]*>([\s\S]*?)<\/pre>/);
  if (!m) { console.error('No se encontró el resultado (¿la página no terminó?)'); server.kill(); process.exit(2); }

  let res;
  try { res = JSON.parse(Buffer.from(m[1].trim(), 'base64').toString('utf8')); }
  catch (e) { console.error('No se pudo decodificar: ' + e.message); server.kill(); process.exit(2); }

  try { server.kill('SIGKILL'); } catch (_) {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (_) {}

  let pass = 0, fail = 0;
  console.log('');
  res.steps.forEach((s) => {
    if (s.ok) { pass++; console.log('  OK  ' + s.msg); }
    else { fail++; console.log('FAIL  ' + s.msg); }
  });
  if (res.errors && res.errors.length) {
    console.log('');
    console.log('ERRORES JS:');
    res.errors.forEach((e) => console.log('  x ' + e));
  }
  console.log('');
  console.log('MOVIMIENTO: ' + pass + ' OK, ' + fail + ' FAIL, ' + (res.errors ? res.errors.length : 0) + ' error(es) JS');
  process.exit(fail || (res.errors && res.errors.length) ? 1 : 0);
})().catch((e) => { console.error('EXC', e); process.exit(1); });