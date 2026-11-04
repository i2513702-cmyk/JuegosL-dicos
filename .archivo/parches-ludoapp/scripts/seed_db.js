/* LudoApp scripts/seed_db.js
 * Importa/reescribe el banco de preguntas de la app (js/core/data.js) y también
 * cualquier lista JSON adicional que le pases por argumento, directamente a la
 * base de datos de Supabase servidor de la app en ejecución (http://localhost:PORT).
 *
 * El server debe estar corriendo: node api/server.js
 *
 * Uso:
 *   node scripts/seed_db.js                         -> sube las 24 preguntas base
 *   node scripts/seed_db.js extras.json             -> sube las base + las de extras.json
 *   node scripts/seed_db.js --url http://host:puerto  -> host remoto del server
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://localhost:3100';

let extraPath = null;
let url = BASE;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--url') { url = args[i + 1]; i++; }
  else extraPath = args[i];
}

/* permite cargar data.js (script pensado para navegador) en Node */
globalThis.window = globalThis;
require('../js/core/data.js'); /* llena globalThis.App.seedData */
const questions = globalThis.App.seedData.questions;

function cleanEnnunciado(q) {
  const out = {
    id: q.id,
    course_id: q.course_id,
    category_id: q.category_id,
    difficulty_id: q.difficulty_id,
    enunciado: q.enunciado,
    opciones: q.opciones,
    respuesta_correcta: q.respuesta_correcta,
    feedback: q.feedback,
    ejemplo_aplicado: q.ejemplo_aplicado
  };
  return out;
}

async function main() {
  const all = questions.map(cleanEnnunciado);
  if (extraPath && fs.existsSync(extraPath)) {
    const extra = JSON.parse(fs.readFileSync(extraPath, 'utf8'));
    if (Array.isArray(extra)) all.push(...extra.map(cleanEnnunciado));
  }

  const health = await (await fetch(url + '/api/health')).json();
  if (!health.ok) {
    console.error('El server no está listo o sin conexión a Supabase:');
    console.error('  ' + (health.actions || health.error));
    console.error('Asegúrate de ejecutar primero: node api/server.js');
    process.exit(1);
  }

  /* login con la cuenta docente; si no existe, la registra (clave 1234 demo) */
  let sesion = await fetch(url + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario: 'profe', clave: '1234' })
  }).then((r) => r.json());

  if (!sesion.token) {
    const reg = await fetch(url + '/api/auth/register', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: 'Prof. Ana López', usuario: 'profe', clave: '1234', rol: 'docente' })
    }).then((r) => r.json());
    if (!reg.token) {
      console.error('No se pudo autenticar ni crear la cuenta profe:', reg.reason || reg);
      process.exit(1);
    }
    sesion = reg;
  }

  const token = sesion.token;
  const resp = await fetch(url + '/api/questions/import', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ questions: all })
  });
  const body = await resp.json();
  if (!resp.ok || !body.ok) {
    console.error('Error al importar:', body.reason || body.error || body);
    process.exit(1);
  }
  console.log('Preguntas importadas en la BD de Supabase: ' + all.length);
  console.log('Respuesta del server:', JSON.stringify(body));
}

main().catch((e) => { console.error(e); process.exit(1); });