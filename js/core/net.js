/* ============================================================
 * LudoApp core/net.js
 * Cliente unificado para partidas en red (Socket.IO)
 * ============================================================ */
window.App = window.App || {};
App.net = (function () {
  'use strict';

  const KEY_DOC = 'partida_docente';
  const KEY_ALU = 'partida_alumno';
  const ESPERA_ACK = 12000;

  let socket = null;
  let pendingRejoin = null;
  const handlers = Object.create(null);

  const M = {
    rol: null, codigo: null, yo: null,
    sala: null, estado: null, pregunta: null, fin: null, registro: null,
    turnoVence: null, partidaVence: null, ahora: 0, off: 0,
    online: false
  };

  function leer(store, key) {
    try { return JSON.parse(store.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function guardar(store, key, valor) {
    try { if (valor) store.setItem(key, JSON.stringify(valor)); else store.removeItem(key); } catch (e) {}
  }

  function on(ev, fn) {
    if (typeof fn !== 'function') return function () {};
    (handlers[ev] = handlers[ev] || []).push(fn);
    return function () { off(ev, fn); };
  }
  function off(ev, fn) {
    const list = handlers[ev];
    if (!list) return;
    const i = list.indexOf(fn);
    if (i >= 0) list.splice(i, 1);
  }
  function emitir(ev, dato) {
    (handlers[ev] || []).slice().forEach(function (fn) {
      try { fn(dato); } catch (e) { console.error('[net]', ev, e); }
    });
  }

  function conectar() {
    if (socket) return socket;
    if (typeof io !== 'function') {
      console.warn('[net] socket.io no está cargado');
      return null;
    }
    socket = io();

    socket.on('connect', function () {
      M.online = true;
      emitir('conectado');
      reanudar().catch(function () {});
    });
    socket.on('disconnect', function () { M.online = false; emitir('desconectado'); });

    socket.on('partida:sala', function (s) { M.sala = s; M.codigo = s.codigo; emitir('sala', s); });
    socket.on('partida:estado', function (p) {
      if (!p) return;
      M.estado = p.estado || null;
      M.turnoVence = p.turnoVence || null;
      M.partidaVence = p.partidaVence || null;
      M.ahora = p.ahora || Date.now();
      M.off = M.ahora - Date.now();
      emitir('estado', p);
    });
    socket.on('partida:pregunta', function (q) { M.pregunta = q; emitir('pregunta', q); });
    socket.on('partida:fin', function (f) { M.fin = f; emitir('fin', f); });
    socket.on('partida:registro', function (r) { M.registro = r; emitir('registro', r); });
    socket.on('partida:expulsado', function () { limpiarAlumno(); emitir('expulsado', {}); });
    socket.on('partida:cerrada', function () { limpiarDocente(); emitir('cerrada', {}); });

    return socket;
  }

  function pedir(ev, dato) {
    conectar();
    if (!socket) return Promise.resolve({ ok: false, error: 'SIN_CONEXION', mensaje: 'No hay conexión con el servidor' });
    return new Promise(function (resolve) {
      let cerrado = false;
      const timer = setTimeout(function () {
        if (cerrado) return;
        cerrado = true;
        resolve({ ok: false, error: 'SIN_RESPUESTA', mensaje: 'El servidor no respondió' });
      }, ESPERA_ACK);
      socket.emit(ev, dato, function (r) {
        if (cerrado) return;
        cerrado = true;
        clearTimeout(timer);
        resolve(r || { ok: false, error: 'SIN_RESPUESTA', mensaje: 'Respuesta vacía' });
      });
    });
  }

  function recordarDocente(d) { guardar(sessionStorage, KEY_DOC, d); }
  function recordarAlumno(d) { guardar(localStorage, KEY_ALU, d); }
  function limpiarDocente() { guardar(sessionStorage, KEY_DOC, null); }
  function limpiarAlumno() { guardar(localStorage, KEY_ALU, null); }
  function tieneDocente() { return !!leer(sessionStorage, KEY_DOC); }
  function tieneAlumno() { return !!leer(localStorage, KEY_ALU); }

  function reanudar() {
    if (pendingRejoin) return pendingRejoin;
    const doc = leer(sessionStorage, KEY_DOC);
    const alu = doc ? null : leer(localStorage, KEY_ALU);
    if (!doc && !alu) return Promise.reject({ error: 'SIN_SESION' });

    pendingRejoin = (doc
      ? pedir('partida:docente-volver', { codigo: doc.codigo, token: doc.token }).then(function (r) {
        if (!r.ok) { limpiarDocente(); throw r; }
        M.rol = 'docente'; M.codigo = doc.codigo; M.sala = r.sala || null; M.estado = r.estado ? r.estado.estado : null;
        if (r.estado) { M.turnoVence = r.estado.turnoVence; M.partidaVence = r.estado.partidaVence; M.ahora = r.estado.ahora; M.off = M.ahora - Date.now(); }
        M.fin = r.fin || null;
        emitir('reanudado', r);
        return r;
      })
      : pedir('partida:unirse', { codigo: alu.codigo, pid: alu.pid }).then(function (r) {
        if (!r.ok) { limpiarAlumno(); throw r; }
        M.rol = 'alumno'; M.codigo = r.codigo; M.yo = r.yo.asiento;
        M.sala = null; M.estado = null; M.pregunta = null; M.fin = null; M.registro = null;
        emitir('reanudado', r);
        return r;
      })
    ).then(function (r) { pendingRejoin = null; return r; }, function (e) { pendingRejoin = null; throw e; });

    return pendingRejoin;
  }

  function crear(d) {
    return pedir('partida:crear', d).then(function (r) {
      if (r.ok) {
        M.rol = 'docente'; M.codigo = r.codigo; M.yo = null; M.estado = null; M.pregunta = null; M.fin = null; M.registro = null;
        recordarDocente({ codigo: r.codigo, token: r.token });
      }
      return r;
    });
  }

  function unirse(d) {
    return pedir('partida:unirse', d).then(function (r) {
      if (r.ok) {
        M.rol = 'alumno'; M.codigo = r.codigo; M.yo = r.yo.asiento; M.pregunta = null; M.fin = null; M.registro = null;
        recordarAlumno({ codigo: r.codigo, pid: r.pid });
      }
      return r;
    });
  }

  function olvidar() {
    M.rol = null; M.codigo = null; M.yo = null; M.sala = null; M.estado = null; M.pregunta = null; M.fin = null; M.registro = null;
    M.turnoVence = null; M.partidaVence = null; M.ahora = 0; M.off = 0;
  }

  return {
    conectar: conectar, reanudar: reanudar,
    crear: crear, unirse: unirse,
    iniciar: function () { return pedir('partida:iniciar', {}); },
    saltar: function () { return pedir('partida:saltar-turno', {}); },
    expulsar: function (asiento) { return pedir('partida:expulsar', { asiento: asiento }); },
    accion: function (a) { return pedir('partida:accion', a); },
    cerrar: function () { return pedir('partida:cerrar', {}).then(function (r) { if (r.ok) { limpiarDocente(); olvidar(); } return r; }); },
    salir: function () { return pedir('partida:salir', {}).then(function (r) { limpiarAlumno(); olvidar(); return r; }); },
    on: on, off: off,
    sala: function () { return M.sala; },
    estado: function () { return M.estado; },
    pregunta: function () { return M.pregunta; },
    fin: function () { return M.fin; },
    registro: function () { return M.registro; },
    rol: function () { return M.rol; },
    yo: function () { return M.yo; },
    codigo: function () { return M.codigo; },
    vencimientos: function () { return { turno: M.turnoVence, partida: M.partidaVence, off: M.off }; },
    online: function () { return M.online; },
    limpiarDocente: limpiarDocente, limpiarAlumno: limpiarAlumno,
    tieneDocente: tieneDocente, tieneAlumno: tieneAlumno,
    olvidar: olvidar
  };
})();
