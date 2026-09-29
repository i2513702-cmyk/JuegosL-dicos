/* LudoApp api/supabase.js
 * Cliente PostgREST de Supabase usando fetch nativo de Node 18+.
 * Usa la service key (rol service) que ignora RLS: solo vive en .env y se
 * usa 100% del lado del servidor para las operaciones de administración.
 * Las consultas de los navegadores usan la SUPABASE_KEY (publishable) y se
 * rigen por las políticas RLS definidas en db/supabase-schema.sql. */
'use strict';
const config = require('./config');

const BASE = config.supabaseUrl.replace(/\/+$/, '') + '/rest/v1';
const HEADERS = {
  apikey: config.serviceKey,
  Authorization: 'Bearer ' + config.serviceKey,
  'Content-Type': 'application/json'
};

async function request(path, opts) {
  const url = path.startsWith('http') ? path : BASE + path;
  const res = await fetch(url, Object.assign({ headers: HEADERS }, opts));
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
  if (!res.ok) {
    const err = new Error('PostgREST ' + res.status + ': ' + (typeof body === 'string' ? body : JSON.stringify(body)));
    err.status = res.status;
    throw err;
  }
  return body;
}

/* Filtrar columnas inexistentes antes de INSERT/UPDATE */

const QUESTION_FIELDS = [
  'id', 'course_id', 'category_id', 'difficulty_id', 'enunciado',
  'opciones', 'respuesta_correcta', 'feedback', 'ejemplo_aplicado', 'activa'
];

function cleanQuestion(q) {
  const out = {};
  for (const k of QUESTION_FIELDS) if (q[k] !== undefined && q[k] !== null) out[k] = q[k];
  return out;
}

/* ---- catálogo ---- */
async function listQuestions(opts) {
  const params = new URLSearchParams();
  params.set('select', QUESTION_FIELDS.join(','));
  params.set('order', 'id');
  if (opts && opts.course_id) params.set('course_id', 'eq.' + opts.course_id);
  if (opts && opts.category_id) params.set('category_id', 'eq.' + opts.category_id);
  if (opts && opts.difficulty_id) params.set('difficulty_id', 'eq.' + opts.difficulty_id);
  return request('/questions?' + params.toString());
}

/* Upsert por PK (id): los que existen se actualizan, los nuevos se insertan. */
async function upsertQuestions(list) {
  const clean = (Array.isArray(list) ? list : [list])
    .filter(Boolean)
    .map(cleanQuestion)
    .filter((q) => q.enunciado && Array.isArray(q.opciones) && q.opciones.length >= 2);
  if (!clean.length) return { inserted: 0, updated: 0, skipped: [] };
  const rows = await request('/questions?on_conflict=id', {
    method: 'POST',
    headers: Object.assign({}, HEADERS, { Prefer: 'return=representation,resolution=merge-duplicates' }),
    body: JSON.stringify(clean)
  });
  return { inserted: rows.length, updated: rows.length, skipped: [] };
}

async function listRows(table, select) {
  return request('/' + table + '?select=' + (select || '*') + '&order=id');
}

async function tableExists(table) {
  try {
    const rows = await request('/' + table + '?select=id&limit=1');
    return { exists: true, count: await countRows(table) };
  } catch (e) {
    return e.status === 404 ? { exists: false, error: 'No existe la tabla `' + table + '`. Ejecuta db/supabase-schema.sql en el SQL Editor de Supabase.' } : { exists: false, error: e.message };
  }
}

async function countRows(table) {
  try {
    const res = await fetch(BASE + '/' + table + '?select=id', { headers: Object.assign({}, HEADERS, { Prefer: 'count=exact', Range: '0-0' }) });
    const count = res.headers.get('content-range');
    if (count) { const m = count.match(/\/(\d+)$/); if (m) return Number(m[1]); }
    const rows = await res.text();
    try { return JSON.parse(rows).length; } catch (_) { return -1; }
  } catch (_) { return -1; }
}

async function exists(table, column, value) {
  const rows = await request('/' + table + '?select=id&' + column + '=eq.' + encodeURIComponent(value));
  return rows.length > 0;
}

/* GET /courses? ... el select por defecto puede traer todo */
async function deleteRow(table, column, value) {
  return request('/' + table + '?' + column + '=eq.' + encodeURIComponent(value), {
    method: 'DELETE',
    headers: Object.assign({}, HEADERS, { Prefer: 'return=representation' })
  });
}

async function insertRows(table, rows) {
  const body = Array.isArray(rows) ? rows : [rows];
  return request('/' + table + '?select=*', {
    method: 'POST',
    headers: Object.assign({}, HEADERS, { Prefer: 'return=representation' }),
    body: JSON.stringify(body)
  });
}

module.exports = {
  BASE, HEADERS, request,
  listQuestions, upsertQuestions, listRows, tableExists, exists, insertRows, deleteRow
};