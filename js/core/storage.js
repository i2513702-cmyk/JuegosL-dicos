/* ============================================================
 * LudoApp core/storage.js
 * Capa de persistencia LOCAL con la misma forma de una API REST.
 * Endpoints documentados para migrar a PostgreSQL/Supabase/Firebase
 * cambiando SOLO esta capa (endpoint()) sin tocar la lógica de juego.
 *   GET    /questions            -> listar
 *   GET    /questions/:id        -> uno
 *   POST   /questions            -> crear
 *   PUT    /questions/:id        -> actualizar
 *   DELETE /questions/:id        -> eliminar
 *   POST   /answers              -> registrar intento
 *   GET    /ranking              -> ranking de jugadores
 * ============================================================ */
window.App = window.App || {};
App.storage = (function () {
  const PREFIX = 'ludoApp:';
  const COLLECTIONS = ['courses', 'categories', 'difficulties', 'questions', 'players', 'sessions', 'attempts', 'users', 'lobbies'];
  const SKILL_STARTS = { pista: 2, comodin: 2, doble_dano: 2, escudo: 2, impulso: 2, cura: 3 };
  const SHARED = ['players', 'users', 'lobbies'];

  function syncNotify(col, id) {
    if (SHARED.indexOf(col) === -1) return;
    if (App.sync && App.sync.mark) App.sync.mark(col, id);
  }

  function read(collection) {
    try {
      const raw = localStorage.getItem(PREFIX + collection);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function write(collection, data) {
    localStorage.setItem(PREFIX + collection, JSON.stringify(data));
  }

  function uid() {
    return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /* ---- operaciones de colección ---- */
  function all(collection) {
    return read(collection).slice();
  }

  function find(collection, predicate) {
    return read(collection).filter(predicate);
  }

  function getById(collection, id) {
    return read(collection).find((item) => item.id === id) || null;
  }

  function create(collection, obj) {
    const items = read(collection);
    const record = Object.assign({ id: uid() }, obj, { createdAt: new Date().toISOString() });
    items.push(record);
    write(collection, items);
    syncNotify(collection, record.id);
    return record;
  }

  function update(collection, id, patch) {
    const items = read(collection);
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) return null;
    items[idx] = Object.assign({}, items[idx], patch, { updatedAt: new Date().toISOString() });
    write(collection, items);
    syncNotify(collection, id);
    return items[idx];
  }

  function remove(collection, id) {
    write(collection, read(collection).filter((item) => item.id !== id));
    if (SHARED.indexOf(collection) !== -1 && App.sync && App.sync.tomb) App.sync.tomb(collection, id);
  }

  /* ---- utilidades de clave simple (settings, sesión actual, etc.) ---- */
  function getKey(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? (fallback === undefined ? null : fallback) : JSON.parse(raw);
    } catch (e) {
      return fallback === undefined ? null : fallback;
    }
  }

  function setKey(key, value) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  }

  /* ---- endpoint REST simulado (punto único de migración a backend) ---- */
  function endpoint(method, path, body) {
    const parts = path.split('/').filter(Boolean); // p.ej. ["questions", "id_123"]
    const collection = parts[0];
    const id = parts[1] || null;

    if (collection === 'answers') {
      if (method === 'POST') {
        const record = Object.assign({ id: uid() }, body, { collectedAt: new Date().toISOString() });
        const items = read('attempts');
        items.push(record);
        write('attempts', items);
        return { ok: true, data: record, status: 201 };
      }
      return { ok: false, status: 405 };
    }

    if (collection === 'ranking') {
      if (method === 'GET') {
        const players = read('players')
          .filter((p) => p.rol !== 'docente')
          .map((p) => ({
            id: p.id,
            nombre: p.nombre,
            xp: p.xp,
            nivel: p.nivel,
            monedas: p.monedas,
            puntos: p.puntos,
            correctas: p.correctas,
            incorrectas: p.incorrectas,
            rachaMax: p.rachaMax,
            logros: p.logros,
            modosGanados: p.modosGanados || []
          }))
          .sort((a, b) => b.xp - a.xp);
        return { ok: true, data: players, status: 200 };
      }
      return { ok: false, status: 405 };
    }

    if (COLLECTIONS.indexOf(collection) === -1) {
      return { ok: false, status: 404 };
    }

    switch (method) {
      case 'GET':
        if (id) {
          const rec = getById(collection, id);
          return { ok: !!rec, data: rec, status: rec ? 200 : 404 };
        }
        return { ok: true, data: all(collection), status: 200 };
      case 'POST':
        return { ok: true, data: create(collection, body), status: 201 };
      case 'PUT':
        return { ok: true, data: update(collection, id, body), status: 200 };
      case 'DELETE':
        remove(collection, id);
        return { ok: true, data: { deleted: true }, status: 200 };
      default:
        return { ok: false, status: 405 };
    }
  }

  /* ---- guardas y consultas de alto nivel usadas por los juegos ---- */
  function getCourses() { return all('courses'); }
  function getCategories(courseId) {
    const c = all('categories');
    return courseId ? c.filter((x) => x.course_id === courseId) : c;
  }
  function getDifficulties() { return all('difficulties'); }
  function getQuestions(filter) {
    let q = all('questions');
    if (!q.length && !localStorage.getItem(PREFIX + 'seeded')) { init(); q = all('questions'); }
    if (filter) {
      if (filter.course_id) q = q.filter((x) => x.course_id === filter.course_id);
      if (filter.category_id) q = q.filter((x) => x.category_id === filter.category_id);
      if (filter.difficulty_id) q = q.filter((x) => x.difficulty_id === filter.difficulty_id);
    }
    return q;
  }

  function resetData() {
    COLLECTIONS.forEach((c) => localStorage.removeItem(PREFIX + c));
    localStorage.removeItem(PREFIX + 'seeded');
    init();
  }

  function defaultStudent(nombre) {
    return {
      nombre,
      rol: 'estudiante',
      xp: 0,
      monedas: 60,
      puntos: 0,
      correctas: 0,
      incorrectas: 0,
      racha: 0,
      rachaMax: 0,
      nivel: 1,
      logros: [],
      modosGanados: [],
      skills: Object.assign({}, SKILL_STARTS)
    };
  }

  /* Kit inicial garantizado: la partida siempre debe tener curacion
     disponible. Nunca se baja lo que el jugador ya tenga. */
  function grantSkillStarts() {
    const all = read('players');
    let changed = false;
    all.forEach((p) => {
      p.skills = p.skills || {};
      Object.keys(SKILL_STARTS).forEach((k) => {
        if ((p.skills[k] || 0) < SKILL_STARTS[k]) { p.skills[k] = SKILL_STARTS[k]; changed = true; }
      });
    });
    if (changed) write('players', all);
  }

  function seedAll(collection, items) {
    if (read(collection).length) return;
    items.forEach((it) => create(collection, it));
  }

  function init() {
    seedAll('courses', App.seedData.courses);
    seedAll('categories', App.seedData.categories);
    seedAll('difficulties', App.seedData.difficulties);
    seedAll('questions', App.seedData.questions);

    /* cuentas demo locales. Cada estudiante queda vinculado a su ficha
       de jugador (progresión); si ya existía por nombre, se reutiliza. */
    if (!read('users').length) {
      App.seedData.users.forEach((u) => {
        let player_id = null;
        if (u.rol === 'estudiante') {
          let p = read('players').find((x) => x.nombre === u.nombre);
          if (!p) p = create('players', defaultStudent(u.nombre));
          player_id = p.id;
        }
        create('users', {
          nombre: u.nombre,
          usuario: u.usuario,
          clave: u.clave,
          rol: u.rol,
          player_id
        });
      });
    }

    localStorage.setItem(PREFIX + 'seeded', 'true');
    grantSkillStarts();
  }

  init();

  return {
    all, find, getById, create, update, remove,
    getKey, setKey,
    endpoint,
    getCourses, getCategories, getDifficulties, getQuestions,
    resetData,
    getPlayers: () => all('players'),
    getSessions: () => all('sessions').slice().reverse(),
    getAttempts: () => all('attempts').slice().reverse(),
    getUsers: () => all('users'),
    getLobbies: () => all('lobbies')
  };
})();