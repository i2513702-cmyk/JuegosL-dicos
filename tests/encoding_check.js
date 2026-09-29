/* Verifica que el navegador real decodifique bien las tildes.
 * Abre index.html por file:// (caso de doble clic) y busca caracteres acentuados.
 *  node tests/encoding_check.js */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const EDGE = fs.existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
  ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  : 'C:/Program Files/Microsoft/Edge/Application/msedge.exe';

const idx = 'file:///' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const tmp = path.join(process.env.TEMP || '/tmp', 'ludo-encchk-' + Date.now());

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  OK  ' + msg); } else { fail++; console.log('FAIL  ' + msg); } }

try {
  const out = execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--user-data-dir=' + tmp,
    '--virtual-time-budget=6000', '--dump-dom', idx
  ], { encoding: 'utf8', timeout: 60000, maxBuffer: 30 * 1024 * 1024 });

  ok(out.indexOf('Iniciar sesión') !== -1, 'login renderizado');
  ok(out.indexOf('contraseña') !== -1, 'palabra "contraseña" correcta');
  ok(out.indexOf('🎓 LudoApp') !== -1 || out.indexOf('LudoApp') !== -1, 'marca LudoApp presente');
  ok(out.indexOf('┬') === -1 && out.indexOf('Ã') === -1 && out.indexOf('ƒÄ') === -1 && out.indexOf('ðŸ') === -1,
    'sin rastros de mojibake (┬, Ã, ƒÄ, ðŸ)');
  const snippet = out.match(/Iniciar sesión[\s\S]{0,160}/);
  console.log('  ...  ' + (snippet ? snippet[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '(snippet)'));
} catch (e) {
  console.error('EXC del navegador: ' + e.message);
  process.exit(1);
}

console.log('');
console.log('RESULTADO: ' + pass + ' OK, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);