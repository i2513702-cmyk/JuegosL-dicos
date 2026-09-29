/* ============================================================
 * E2E con NAVEGADORES reales (dos sesiones Edge aisladas que
 * simulan Edge (docente) y Opera GX (alumna), ambos Chromium).
 * PASOS secuenciales con --dump-dom (el navegador sale solo):
 *  1) profe (perfil A) crea la sala
 *  2) alumna (perfil B) la ve por sync y se une por la UI
 *  3) profe (perfil A) verifica que ve a la alumna + nombre
 *
 *  node tests/ui_cross_test.js
 * ============================================================ */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 8793;
const BASE = 'http://localhost:' + PORT;
const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(os.tmpdir(), 'ludo-ui2-' + Date.now() + '.json');

const EDGE = fs.existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
  ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  : 'C:/Program Files/Microsoft/Edge/Application/msedge.exe';

const { spawn } = require('node:child_process');
let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  OK  ' + msg); } else { fail++; console.log('FAIL  ' + msg); } }
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

function runBrowser(profile, url, budget) {
  const out = execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--user-data-dir=' + profile,
    '--virtual-time-budget=' + budget,
    '--dump-dom', url
  ], { encoding: 'utf8', timeout: 90000, maxBuffer: 20 * 1024 * 1024 });
  const m = out.match(/data-result="([^"]*)"/);
  if (!m) return { raw: out.slice(-400) };
  try { return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')); }
  catch (e) { return { raw: m[1] }; }
}

(async () => {
  if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
  const server = spawn(process.execPath, ['servidor.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { PORT: String(PORT), LUDO_DATA_FILE: DATA_FILE }),
    stdio: 'ignore'
  });
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    try { const r = await fetch(BASE + '/api/sync'); up = r.ok; } catch (e) { await delay(250); }
  }
  if (!up) { console.error('servidor no arranco'); process.exit(1); }
  console.log('servidor app en ' + BASE);

  const profA = path.join(os.tmpdir(), 'ludo-profA-' + Date.now());
  const alumB = path.join(os.tmpdir(), 'ludo-alumB-' + Date.now());

  /* paso 1: docente crea la sala */
  const r1 = runBrowser(profA, BASE + '/tests/ui_cross.html?role=profe&step=create', 10000);
  ok(r1.sync === 'yes', 'paso1: sync activo (docente)');
  ok(r1.code && r1.code.length === 5, 'paso1: docente creo sala, codigo ' + r1.code);
  ok(r1.verifyStorage === 'yes', 'paso1: sala visible en su storage');
  const code = r1.code;

  /* paso 2: alumna (otro perfil = otro localstorage) la encuentra y se une */
  const r2 = runBrowser(alumB, BASE + '/tests/ui_cross.html?role=alumno&step=join', 25000);
  ok(r2.sync === 'yes', 'paso2: sync activo (alumna)');
  ok(r2.saw === code, 'paso2: alumna VE el codigo creado por el docente (' + r2.saw + ')');
  ok(r2.joined === 'yes', 'paso2: alumna quedo anotada en la sala (storage)');
  ok(r2.uiJoined === 'yes', 'paso2: alumna ve "Te has unido" en la UI');

  /* paso 3: docente comprueba que la ve */
  const r3 = runBrowser(profA, BASE + '/tests/ui_cross.html?role=profe&step=check', 20000);
  ok(r3.joined === 'yes', 'paso3: docente ve a la alumna recien unida');
  ok(r3.name === 'María Torres', 'paso3: docente resuelve el nombre de la alumna (' + r3.name + ')');
  ok(r3.chip === 'yes', 'paso3: el chip de la sala muestra "María Torres"');

  console.log('');
  console.log('RESULTADO: ' + pass + ' OK, ' + fail + ' FAIL');
  try { server.kill('SIGKILL'); } catch (e) {}
  try { fs.unlinkSync(DATA_FILE); } catch (e) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('EXC', e); process.exit(1); });