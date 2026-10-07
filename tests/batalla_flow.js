/* ============================================================
 * Driver: abre tests/batalla_flow.html en Edge headless,
 * recoge los resultados en base64 del DOM y los muestra.
 *   node tests/batalla_flow.js
 * ============================================================ */
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EDGE = fs.existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
  ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  : 'C:/Program Files/Microsoft/Edge/Application/msedge.exe';

const ROOT = path.join(__dirname, '..');
const PORT = 8796;
const BASE = 'http://localhost:' + PORT;
const DATA_FILE = path.join(os.tmpdir(), 'ludo-flow-' + Date.now() + '.json');
const PROFILE = path.join(os.tmpdir(), 'ludo-flow-profile-' + Date.now());

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

function runPage(url, budget) {
  try {
    return execFileSync(EDGE, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
      '--user-data-dir=' + PROFILE,
      '--virtual-time-budget=' + budget, '--dump-dom', url
    ], { encoding: 'utf8', timeout: 120000, maxBuffer: 60 * 1024 * 1024 });
  } catch (e) {
    return (e.stdout || '').toString();
  } finally {
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (_) {}
  }
}

function parseAudit(dom) {
  const m = String(dom).match(/<pre id="audit-out">([\s\S]*?)<\/pre>/);
  if (!m) {
    console.error('No se encontró el bloque de resultado (¿la página no terminó?).');
    return null;
  }
  const b64 = m[1].replace(/^<[^>]+>|<\/pre>$/g, '').trim();
  try { return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')); }
  catch (e) { console.error('No se pudo decodificar el resultado: ' + e.message); return null; }
}

(async () => {
  const server = spawn(process.execPath, ['servidor.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(PORT), LUDO_DATA_FILE: DATA_FILE })
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));

  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try { const r = await fetch(BASE + '/api/sync'); up = r.ok; } catch (e) { await delay(250); }
  }
  if (!up) { console.error('No arrancó servidor'); process.exit(2); }

  const url = BASE + '/tests/batalla_flow.html';
  const dom = runPage(url, 30000);
  const res = parseAudit(dom);

  try { server.kill('SIGKILL'); } catch (_) {}
  try { fs.unlinkSync(DATA_FILE); } catch (_) {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (_) {}
  if (!res) process.exit(2);

  let pass = 0, fail = 0;
  console.log('');
  res.steps.forEach((s) => {
    if (s.ok) { pass++; console.log('  OK  ' + s.msg); }
    else { fail++; console.log('FAIL  ' + s.msg); }
  });

  console.log('');
  if (res.errors && res.errors.length) {
    console.log('ERRORES JS DETECTADOS:');
    res.errors.forEach((e) => console.log('  x' + (e.n > 1 ? '(' + e.n + 'x)' : '') + ' [' + e.type + '] ' + e.text));
  } else {
    console.log('ERRORES JS: ninguno');
  }

  console.log('');
  console.log('FLUJO BATALLA: ' + pass + ' OK, ' + fail + ' FAIL, ' + (res.errors ? res.errors.length : 0) + ' error(es) JS');
  process.exit(fail || (res.errors && res.errors.length) ? 1 : 0);
})().catch((e) => { console.error('EXC', e); process.exit(1); });
