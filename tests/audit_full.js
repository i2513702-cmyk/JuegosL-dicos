/* ============================================================
 * Driver: abre tests/audit_full.html en Edge headless (real),
 * recoge los resultados en base64 del DOM y los muestra.
 *   node tests/audit_full.js
 * ============================================================ */
const { execFileSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EDGE = fs.existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
  ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  : 'C:/Program Files/Microsoft/Edge/Application/msedge.exe';

const ROOT = path.join(__dirname, '..');
const PORT = 8795;
const BASE = 'http://localhost:' + PORT;
const DATA_FILE = path.join(os.tmpdir(), 'ludo-audit-' + Date.now() + '.json');
const PROFILE = path.join(os.tmpdir(), 'ludo-audit-profile-' + Date.now());

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

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

  const url = BASE + '/tests/audit_full.html';
  let dom = '';
  try {
    dom = execFileSync(EDGE, [
      '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
      '--user-data-dir=' + PROFILE,
      '--virtual-time-budget=25000', '--dump-dom', url
    ], { encoding: 'utf8', timeout: 90000, maxBuffer: 60 * 1024 * 1024 });
  } catch (e) {
    dom = (e.stdout || '').toString();
  }

  try { server.kill('SIGKILL'); } catch (_) {}
  try { fs.unlinkSync(DATA_FILE); } catch (_) {}

  const m = dom.match(/<pre id="audit-out">([\s\S]*?)<\/pre>/);
  if (!m) {
    console.error('No se encontró el bloque de resultado (¿la página no terminó?).');
    process.exit(2);
  }
  const b64 = m[1].replace(/^<[^>]+>|<\/pre>$/g, '').trim();
  let res;
  try { res = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')); }
  catch (e) { console.error('No se pudo decodificar el resultado: ' + e.message); process.exit(2); }

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
  if (res.warnings && res.warnings.length) {
    console.log('WARNINGS:');
    res.warnings.forEach((e) => console.log('  ! (' + e.n + 'x) ' + e.text));
  }

  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (_) {}

  console.log('');
  console.log('AUDITORÍA: ' + pass + ' OK, ' + fail + ' FAIL, ' + (res.errors ? res.errors.length : 0) + ' error(es) JS');
  process.exit(fail || (res.errors && res.errors.length) ? 1 : 0);
})().catch((e) => { console.error('EXC', e); process.exit(1); });