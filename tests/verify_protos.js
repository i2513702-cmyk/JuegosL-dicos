/* ============================================================
 * Verifica en un navegador real (Edge headless) los 5 prototipos:
 *   - motor-sprites.js compartido (sin codigo duplicado)
 *   - escenario SVG de fondo, 680:380 sin deformar, detras del canvas
 *   - sprites dibujados, HUD accesible y responsive
 *   node tests/verify_protos.js
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
/* uso local sin servidor: node tests/verify_protos.js --file */
const VIA_FILE = process.argv.includes('--file');
const BASE = VIA_FILE ? 'file:///' + ROOT.replace(/\\/g, '/') : 'http://localhost:' + PORT;
const DATA_FILE = path.join(os.tmpdir(), 'ludo-protos-' + Date.now() + '.json');
const PROFILE = path.join(os.tmpdir(), 'ludo-protos-profile-' + Date.now());

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  let server = null;
  if (!VIA_FILE) {
    server = spawn(process.execPath, ['servidor.js'], {
      cwd: ROOT,
      env: Object.assign({}, process.env, { PORT: String(PORT), LUDO_DATA_FILE: DATA_FILE })
    });
    server.stdout.on('data', () => {});
    server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));

    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      try { const r = await fetch(BASE + '/api/sync'); up = r.ok; } catch (e) { await delay(250); }
    }
    if (!up) { console.error('No arranco servidor'); process.exit(2); }
  } else {
    console.log('modo: file:// (sin servidor)');
  }

  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions',
    '--user-data-dir=' + PROFILE,
    '--virtual-time-budget=40000', '--dump-dom'
  ];
  if (VIA_FILE) args.push('--allow-file-access-from-files');
  args.push(BASE + '/tests/verify_protos.html');

  let dom = '';
  try {
    dom = execFileSync(EDGE, args, { encoding: 'utf8', timeout: 120000, maxBuffer: 60 * 1024 * 1024 });
  } catch (e) { dom = (e.stdout || '').toString(); }

  if (server) { try { server.kill('SIGKILL'); } catch (_) {} }
  try { fs.unlinkSync(DATA_FILE); } catch (_) {}
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch (_) {}

  const m = dom.match(/<pre id="audit-out">([\s\S]*?)<\/pre>/);
  if (!m) { console.error('No se encontro el bloque de resultado.'); process.exit(2); }
  const b64 = m[1].replace(/^<[^>]+>|<\/pre>$/g, '').trim();
  let res;
  try { res = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')); }
  catch (e) { console.error('No se pudo decodificar: ' + e.message); process.exit(2); }

  let pass = 0, fail = 0;
  console.log('');
  res.steps.forEach((s) => {
    if (s.ok) { pass++; console.log('  OK  ' + s.msg); }
    else { fail++; console.log('FAIL  ' + s.msg); }
  });

  console.log('');
  if (res.errors && res.errors.length) {
    console.log('ERRORES JS:');
    res.errors.forEach((e) => console.log('  x' + (e.n > 1 ? '(' + e.n + 'x)' : '') + ' [' + e.type + '] ' + e.text));
  } else {
    console.log('ERRORES JS: ninguno');
  }

  console.log('');
  console.log('PROTOTIPOS: ' + pass + ' OK, ' + fail + ' FAIL, ' +
    (res.errors ? res.errors.length : 0) + ' error(es) JS');
  process.exit(fail || (res.errors && res.errors.length) ? 1 : 0);
})().catch((e) => { console.error('EXC', e); process.exit(1); });