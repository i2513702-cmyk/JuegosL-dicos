/* LudoApp api/auth.js
 * Autenticación segura (lado servidor):
 *  - contraseñas NUNCA en claro: se guardan hasheadas con scrypt + salt.
 *  - sesión mediante token firmado con HMAC-SHA256 (AppSecret).
 * La clave en claro solo existe en memoria de forma efímera durante el login. */
'use strict';
const crypto = require('node:crypto');
const config = require('./config');
const supabase = require('./supabase');

const TOKEN_TTL_SEC = 60 * 60 * 24; // 24 h

function hashPassword(clave) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(clave, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { salt, hash };
}

function verifyPassword(clave, salt, hashHex) {
  if (!clave || !salt || !hashHex) return false;
  const computed = crypto.scryptSync(clave, salt, 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(hashHex, 'hex');
  return computed.length === expected.length && crypto.timingSafeEqual(computed, expected);
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function signToken(payload) {
  const body = {
    sub: payload.sub,
    rol: payload.rol,
    nombre: payload.nombre,
    player_id: payload.player_id,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC
  };
  const enc = b64url(body);
  const sig = crypto.createHmac('sha256', config.appSecret).update(enc).digest('base64url');
  return enc + '.' + sig;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const sig = crypto.createHmac('sha256', config.appSecret).update(parts[0]).digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(parts[1], 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_) { return null; }
}

/* ---- endpoints lógicos ---- */

async function register({ nombre, usuario, clave, rol }) {
  nombre = (nombre || '').trim();
  usuario = String(usuario || '').trim().toLowerCase();
  rol = (rol || 'estudiante') === 'docente' ? 'docente' : 'estudiante';
  if (!nombre || !usuario || !clave) return { ok: false, status: 400, reason: 'Nombre, usuario y clave son obligatorios.' };
  if (String(clave).length < 4) return { ok: false, status: 400, reason: 'La clave debe tener al menos 4 caracteres.' };
  if (await supabase.exists('app_users', 'usuario', usuario)) {
    return { ok: false, status: 409, reason: 'El usuario ya existe.' };
  }
  const { salt, hash } = hashPassword(clave);
  const [player] = await supabase.insertRows('players', { nombre, rol });
  const [user] = await supabase.insertRows('app_users', {
    nombre, usuario, rol,
    clave_salt: salt,
    clave_hash: hash,
    player_id: player.id
  });
  return {
    ok: true,
    user: { id: user.id, nombre: user.nombre, usuario: user.usuario, rol: user.rol, player_id: user.player_id },
    token: signToken({ sub: user.id, rol: user.rol, nombre: user.nombre, player_id: user.player_id })
  };
}

async function login({ usuario, clave }) {
  usuario = String(usuario || '').trim().toLowerCase();
  let rows;
  try {
    rows = await supabase.request('/app_users?select=*&usuario=eq.' + encodeURIComponent(usuario));
  } catch (e) {
    return { ok: false, status: 500, reason: 'No se pudo consultar la base: ' + e.message };
  }
  const user = rows[0];
  if (!user || !verifyPassword(clave, user.clave_salt, user.clave_hash)) {
    return { ok: false, status: 401, reason: 'Usuario o contraseña incorrectos.' };
  }
  return {
    ok: true,
    user: { id: user.id, nombre: user.nombre, usuario: user.usuario, rol: user.rol, player_id: user.player_id },
    token: signToken({ sub: user.id, rol: user.rol, nombre: user.nombre, player_id: user.player_id })
  };
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, register, login };