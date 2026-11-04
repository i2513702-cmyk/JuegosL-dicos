/* LudoApp api/config.js
 * Carga la configuración desde .env (mismo directorio del proyecto).
 * No depende de dotenv: lector mínimo de VARIABLE=valor.
 * NUNCA imprimir secretos. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ENV_PATH = path.join(__dirname, '..', '.env');

function loadEnv() {
  const out = {};
  try {
    const raw = fs.readFileSync(ENV_PATH, 'utf8').replace(/^\uFEFF/, '');
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2];
    }
  } catch (_) { /* sin .env -> quedan vacíos */ }
  return out;
}

const env = loadEnv();

function required(name) {
  const v = env[name];
  if (!v) throw new Error('Falta ' + name + ' en el archivo .env (debe estar en la raíz del proyecto, junto a package.json).');
  return v;
}

const config = {
  env,
  port: Number(env.PORT || 3100),
  supabaseUrl: env.SUPABASE_URL || '',
  supabaseKey: required('SUPABASE_KEY'),
  serviceKey: required('SUPABASE_SERVICE_KEY'),
  appSecret: required('APP_SECRET'),
  databaseUrl: env.DATABASE_URL || ''
};

module.exports = config;