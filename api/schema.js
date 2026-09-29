/* LudoApp api/schema.js
 * Aplica db/supabase-schema.sql a la base automáticamente la primera vez
 * (bootstrap idempotente): si la tabla `questions` ya existe, no hace nada.
 * Usa node-postgres (pg) con la DATABASE_URL de .env. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

const SQL_PATH = path.join(__dirname, '..', 'db', 'supabase-schema.sql');

function pgAvailable() {
  try { require('pg'); return true; } catch (_) { return false; }
}

async function ensureSchema() {
  if (!config.databaseUrl) {
    console.log('[schema] Sin DATABASE_URL en .env: omite la creación automática.');
    return false;
  }
  if (!pgAvailable()) {
    console.log('[schema] Driver "pg" no instalado. Ejecuta  npm install pg  o aplica db/supabase-schema.sql en el SQL Editor.');
    return false;
  }
  const { Client } = require('pg');
  const client = new Client({ connectionString: config.databaseUrl, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    const { rows } = await client.query("select to_regclass('public.questions') as t");
    if (rows[0] && rows[0].t) {
      console.log('[schema] Tablas ya existen: no se re-aplica el esquema.');
      return true;
    }
    const sql = fs.readFileSync(SQL_PATH, 'utf8').replace(/^\uFEFF/, '');
    await client.query(sql); /* multi-sentencia: protocolo simple (sin parámetros) */
    console.log('[schema] Esquema aplicado correctamente en Supabase (tablas + seed de preguntas).');
    return true;
  } catch (e) {
    console.error('[schema] Error al aplicar el esquema: ' + e.message);
    console.error('[schema] Puedes aplicarlo manualmente pegando db/supabase-schema.sql en el SQL Editor de Supabase.');
    return false;
  } finally {
    try { await client.end(); } catch (_) { /* noop */ }
  }
}

module.exports = { ensureSchema, pgAvailable };