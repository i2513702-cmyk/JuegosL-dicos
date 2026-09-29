/* ============================================================
 * LudoApp core/api.js
 * Cliente HTTP hacia la API local (api/server.js) que conecta
 * con Supabase. Sin dependencias (fetch nativo).
 *  - con la API: login con contraseña hasheada + token, y
 *    sincronización de preguntas (import/descarga).
 *  - sin la API: todo sigue funcionando offline con localStorage.
 * Configuración guardada en ludoApp:apiUrl (por defecto el server local).
 * ============================================================ */
window.App = window.App || {};
App.api = (function () {
  const PREFIX = 'ludoApp:';

  function base() {
    return App.storage.getKey('apiUrl') || 'http://localhost:3100/api';
  }

  function setBase(url) {
    App.storage.setKey('apiUrl', String(url || '').replace(/\/+$/, ''));
  }

  function token() {
    return App.storage.getKey('apiToken') || null;
  }

  function setToken(t) {
    App.storage.setKey('apiToken', t || null);
  }

  /* request(): devuelve Promise<respuesta> o Promise<null> si la API no responde. */
  function request(path, opts) {
    opts = opts || {};
    return fetch(base() + path, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (opts.token || token())
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    })
      .then((r) => r.json().catch(() => ({ ok: false, reason: 'HTTP ' + r.status })))
      .catch(() => null);
  }

  function health() {
    return request('/health', { method: 'GET' });
  }

  function login(usuario, clave) {
    return request('/auth/login', { method: 'POST', body: { usuario, clave } });
  }

  function register(data) {
    return request('/auth/register', { method: 'POST', body: data });
  }

  /* importa una lista de preguntas a Supabase (crea/actualiza por id) */
  function importQuestions(list) {
    return request('/questions/import', { method: 'POST', body: { questions: list } });
  }

  function listQuestions(filtros) {
    const qs = new URLSearchParams(filtros || {}).toString();
    return request('/questions' + (qs ? '?' + qs : ''));
  }

  function deleteQuestion(id) {
    return request('/questions?id=' + encodeURIComponent(id), { method: 'DELETE' });
  }

  return { base, setBase, token, setToken, request, health, login, register, importQuestions, listQuestions, deleteQuestion };
})();