/* LudoApp api/server.js
 * API HTTP sin dependencias (Node 24).
 *   GET  /api/health           -> estado de la conexión y tablas
 *   POST /api/auth/register    -> { nombre, usuario, clave, rol? }
 *   POST /api/auth/login       -> { usuario, clave }
 *   GET  /api/me               -> usuario actual (Bearer token)
 *   GET  /api/questions        -> listar preguntas (filtros opcionales)
 *   POST /api/questions/import -> una lista [{...}] (upsert por id)
 *   GET  /api/courses|categories|difficulties -> catálogo
 * Arranque:  node api/server.js */
'use strict';
const http = require('node:http');
const config = require('./config');
const supabase = require('./supabase');
const auth = require('./auth');
const schema = require('./schema');

const PORT = config.port;

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,apikey'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { data += c; if (data.length > 5 * 1024 * 1024) { reject(new Error('Cuerpo demasiado grande')); req.destroy(); } });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (_) { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') return json(res, 204, {});

  /* ---- health / ready ---- */
  if (path === '/api/health' && req.method === 'GET') {
    return supabase.tableExists('questions').then((t) => {
      json(res, 200, {
        ok: t.exists,
        supabaseUrl: config.supabaseUrl,
        questions: t,
        actions: t.exists
          ? 'Conectado. Usa GET /api/questions y POST /api/questions/import.'
          : t.error
      });
    }).catch((e) => json(res, 500, { ok: false, error: e.message }));
  }

  /* ---- auth ---- */
  if (path === '/api/auth/register' && req.method === 'POST') {
    return readBody(req).then((b) => auth.register(b)).then((r) => json(res, r.status || (r.ok ? 201 : 400), r)).catch((e) => json(res, 500, { ok: false, reason: e.message }));
  }

  if (path === '/api/auth/login' && req.method === 'POST') {
    return readBody(req).then((b) => auth.login(b)).then((r) => json(res, r.status || (r.ok ? 200 : 401), r)).catch((e) => json(res, 500, { ok: false, reason: e.message }));
  }

  /* ---- rutas protegidas ---- */
  const payload = auth.verifyToken(bearer(req));
  if (!payload) return json(res, 401, { ok: false, reason: 'No autenticado. Envía Authorization: Bearer <token>.' });

  if (path === '/api/me' && req.method === 'GET') {
    return json(res, 200, { ok: true, user: { id: payload.sub, nombre: payload.nombre, rol: payload.rol, player_id: payload.player_id } });
  }

  if (path === '/api/questions' && req.method === 'GET') {
    const q = url.searchParams;
    return supabase.listQuestions({
      course_id: q.get('course_id') || undefined,
      category_id: q.get('category_id') || undefined,
      difficulty_id: q.get('difficulty_id') || undefined
    }).then((rows) => json(res, 200, { ok: true, count: rows.length, data: rows }))
      .catch((e) => json(res, 500, { ok: false, error: e.message }));
  }

  if (path === '/api/questions/import' && req.method === 'POST') {
    return readBody(req).then((b) => {
      const list = b && b.questions ? b.questions : b;
      if (!Array.isArray(list) && !list) return json(res, 400, { ok: false, reason: 'Envía un array de preguntas o { questions: [...] }.' });
      return supabase.upsertQuestions(list);
    }).then((r) => json(res, 200, Object.assign({ ok: true }, r)))
      .catch((e) => json(res, 500, { ok: false, error: e.message }));
  }

  if (path === '/api/questions' && req.method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id) return json(res, 400, { ok: false, reason: 'Falta ?id=' });
    return supabase.deleteRow('questions', 'id', id)
      .then(() => json(res, 200, { ok: true, deleted: id }))
      .catch((e) => json(res, 500, { ok: false, error: e.message }));
  }

  for (const table of ['courses', 'categories', 'difficulties']) {
    if (path === '/api/' + table && req.method === 'GET') {
      return supabase.listRows(table).then((rows) => json(res, 200, { ok: true, data: rows }))
        .catch((e) => json(res, 500, { ok: false, error: e.message }));
    }
  }

  return json(res, 404, { ok: false, reason: 'Ruta no encontrada.' });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((e) => json(res, 500, { ok: false, error: e.message }));
});

server.listen(PORT, () => {
  console.log('LudoApp API en http://localhost:' + PORT);
  console.log('  GET  /api/health   -> estado de la conexión');
  console.log('  POST /api/auth/register · /api/auth/login');
  console.log('  GET  /api/questions · POST /api/questions/import');
  console.log('Presiona Ctrl+C para detener.');
  schema.ensureSchema().then(() => {
    console.log('Listo. Prueba  GET /api/health  para confirmar el estado.');
  });
});