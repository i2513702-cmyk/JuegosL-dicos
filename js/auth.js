/* ============================================================
 * LudoApp auth.js
 * Autenticación LOCAL de demostración (docente / alumno) y
 * gestión de SALAS: el docente crea la partida con una
 * configuración por defecto y comparte un código; los alumnos
 * se unen ingresando ese código.
 * ============================================================ */
window.App = window.App || {};

/* ----------------------- autenticación ----------------------- */
App.auth = (function () {
  function who() {
    const id = App.storage.getKey('currentUser');
    return id ? App.storage.getById('users', id) : null;
  }

  function currentPlayer() {
    const u = who();
    if (!u || !u.player_id) return null;
    return App.storage.getById('players', u.player_id);
  }

  function login(usuario, clave) {
    const u = App.storage.getUsers().find(
      (x) => String(x.usuario || '').trim().toLowerCase() === String(usuario || '').trim().toLowerCase() &&
             String(x.clave || '') === String(clave || '')
    );
    if (!u) return { ok: false, reason: 'Usuario o contraseña incorrectos.' };
    App.storage.setKey('currentUser', u.id);
    return { ok: true, user: u };
  }

  /* Login seguro: valida en Supabase (contraseña hasheada, nunca en claro).
   * Si el server de la API no responde, cae a la demo local (modo offline). */
  function loginSecuro(usuario, clave) {
    if (!(App.api && App.api.login)) return Promise.resolve(login(usuario, clave));
    return App.api.login(usuario, clave).then((r) => {
      if (!r) { ui.toast('⚠️ Sin conexión a la BD: modo offline local', 'warn'); return login(usuario, clave); }
      if (!r.ok) return { ok: false, reason: r.reason || 'Credenciales rechazadas por la BD.' };
      App.api.setToken(r.token);
      const local = login(usuario, clave);
      return local.ok ? local : { ok: true, user: r.user };
    });
  }

  function logout() {
    App.storage.setKey('currentUser', null);
    App.storage.setKey('currentSession', null);
    if (App.api) App.api.setToken(null);
  }

  function isDocente() {
    const u = who();
    return !!u && u.rol === 'docente';
  }

  return { who, currentPlayer, login, loginSecuro, logout, isDocente };
})();

/* ------------------------- salas (lobby) ------------------------- */
App.lobby = (function () {
  const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const MIN = { ludo: 1, batalla: 2, carrera: 2, conquista: 2 };

  function makeCode() {
    let code;
    do {
      code = '';
      for (let i = 0; i < 5; i++) code += LETRAS[Math.floor(Math.random() * LETRAS.length)];
    } while (App.storage.getLobbies().some((l) => l.codigo === code));
    return code;
  }

  /* configuración por defecto: los juegos arrancan con esto */
  function defaultConfig() {
    const curso = App.storage.getCourses()[0];
    return {
      mode: 'ludo',
      courseId: curso ? curso.id : null,
      categoryId: '',
      difficultyId: '',
      timeSeconds: 300,
      maxJugadores: 4
    };
  }

  function create(docenteId) {
    return App.storage.create('lobbies', {
      codigo: makeCode(),
      docenteId: docenteId,
      estado: 'abierta',
      config: defaultConfig(),
      jugadores: []
    });
  }

  function get(id) {
    return App.storage.getById('lobbies', id);
  }

  function byCodigo(codigo) {
    const c = String(codigo || '').trim().toUpperCase();
    return App.storage.getLobbies().find((l) => l.codigo === c) || null;
  }

  function updateConfig(id, cfg) {
    return App.storage.update('lobbies', id, { config: cfg });
  }

  function join(id, playerId) {
    const l = get(id);
    if (!l) return { ok: false, reason: 'No existe una sala abierta con ese código.' };
    if (l.estado !== 'abierta') return { ok: false, reason: 'La partida con ese código ya comenzó (estado: ' + l.estado + ').' };
    if (l.jugadores.indexOf(playerId) !== -1) return { ok: false, reason: 'Ya estás dentro de esa sala.' };
    if (l.jugadores.length >= l.config.maxJugadores) return { ok: false, reason: 'La sala está llena.' };
    return { ok: true, lobby: App.storage.update('lobbies', id, { jugadores: l.jugadores.concat([playerId]) }) };
  }

  function leave(id, playerId) {
    const l = get(id);
    if (!l) return { ok: false };
    return { ok: true, lobby: App.storage.update('lobbies', id, { jugadores: l.jugadores.filter((x) => x !== playerId) }) };
  }

  function close(id) {
    App.storage.remove('lobbies', id);
  }

  function listMine(docenteId) {
    return App.storage.getLobbies().filter((l) => l.docenteId === docenteId).reverse();
  }

  function listForPlayer(playerId) {
    return App.storage.getLobbies().filter((l) => l.estado === 'abierta' && l.jugadores.indexOf(playerId) !== -1).reverse();
  }

  function start(id) {
    const l = get(id);
    if (!l) return { ok: false, reason: 'La sala no existe.' };
    if (l.estado !== 'abierta') return { ok: false, reason: 'La sala no está abierta a jugadores.' };
    if (!l.jugadores.length) return { ok: false, reason: 'Aún no se ha unido ningún jugador.' };
    const need = MIN[l.config.mode] || 1;
    if (l.jugadores.length < need) return { ok: false, reason: 'Este modo necesita al menos ' + need + ' jugadores.' };
    return { ok: true, lobby: App.storage.update('lobbies', id, { estado: 'jugando' }) };
  }

  function reopen(id) {
    const l = get(id);
    if (!l) return { ok: false, reason: 'La sala no existe.' };
    return { ok: true, lobby: App.storage.update('lobbies', id, { estado: 'abierta' }) };
  }

  return {
    defaultConfig, create, get, byCodigo, updateConfig,
    join, leave, close, listMine, listForPlayer, start, reopen
  };
})();