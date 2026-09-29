/* ============================================================
 * LudoApp app.js
 * Capa de aplicación: gestión de sesión, ruteo de vistas,
 * lobby de configuración de partida y tablero del estudiante.
 * ============================================================ */
window.App = window.App || {};
App.ui = App.ui;

/* ----------------------- gestor de sesión ----------------------- */
App.session = (function () {
  function start(config) {
    const s = {
      mode: config.mode,
      courseId: config.courseId,
      categoryId: config.categoryId,
      difficultyId: config.difficultyId,
      startAt: new Date().toISOString(),
      endAt: null,
      ganadorId: null,
      players: config.players.map((p) => ({ id: p.id, nombre: p.nombre, color: p.color, puntos: 0 }))
    };
    const rec = App.storage.create('sessions', s);
    App.storage.setKey('currentSession', rec.id);
    return rec;
  }

  function record(config, standings, mode) {
    const id = App.storage.getKey('currentSession');
    if (!id) return;
    const s = App.storage.getById('sessions', id);
    if (!s || s.mode !== mode) return;
    const byId = {};
    standings.forEach((x) => { byId[x.id] = x.puntos; });
    s.players.forEach((p) => { p.puntos = byId[p.id] || p.puntos; });
    s.ganadorId = (standings[0] && standings[0].id) || null;
    s.endAt = new Date().toISOString();
    App.storage.update('sessions', id, s);
  }

  function historial() {
    return App.storage.getSessions().map((s) => ({
      id: s.id,
      mode: s.mode,
      startAt: s.startAt,
      endAt: s.endAt,
      jugadores: (s.players || []).length,
      ganador: App.storage.getById('players', s.ganadorId)
    }));
  }

  return { start, record, historial };
})();

/* ----------------------------- metadatos ----------------------------- */
const GAMES_META = [
  { id: 'ludo', icono: '🎲', nombre: 'Ludo Educativo', desc: 'El clásico ludo: tira el dado, responde y avanza por la pista hasta la meta.', jug: '1 - 4', color: '#dc2626' },
  { id: 'batalla', icono: '⚔️', nombre: 'Batalla de Preguntas', desc: 'Duelo de conocimientos: ataca, defiéndete y gasta la vida del rival.', jug: '2 - 4', color: '#7c3aed' },
  { id: 'carrera', icono: '🏁', nombre: 'Carrera de Preguntas', desc: 'Carrera por turnos: acierta para avanzar, esquiva obstáculos y llega 1º.', jug: '2 - 4', color: '#2563eb' },
  { id: 'conquista', icono: '🗺️', nombre: 'Conquista de Territorios', desc: 'Domina el mapa atacando y defendiendo territorios con tus respuestas.', jug: '2 - 4', color: '#059669' }
];

/* --------------------------- helpers DOM --------------------------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function filed(container, content) {
  container.innerHTML = '';
}

/* ------------------------- rutas / vistas ------------------------- */
App.roam = (function () {
  const ui = App.ui;

  function navBtn(current) {
    const nav = document.getElementById('main-nav');
    if (!nav) return;
    const user = App.auth.who();
    const links = user && user.rol === 'docente'
      ? [['inicio', '🎮 Sala de juego'], ['docente', '👩‍🏫 Panel docente']]
      : user
        ? [['inicio', '🎮 Jugar'], ['estudiante', '🎒 Mi progreso']]
        : [];
    nav.innerHTML = '';
    links.forEach(([key, label]) => {
      const b = ui.el('button', 'nav-btn' + (current === key ? ' nav-btn-active' : ''), label);
      b.addEventListener('click', () => App.go(key));
      nav.appendChild(b);
    });
  }

  function renderUserBar() {
    const bar = document.getElementById('user-bar');
    if (!bar) return;
    bar.innerHTML = '';
    const user = App.auth.who();
    if (!user) return;
    bar.appendChild(ui.el('span', 'nav-chip',
      '👤 ' + esc(user.nombre || user.usuario) + ' · ' + (user.rol === 'docente' ? 'Docente' : 'Alumno')));
    const out = ui.el('button', 'nav-btn', 'Salir');
    out.addEventListener('click', () => {
      App.auth.logout();
      location.hash = '#/login';
      route();
    });
    bar.appendChild(out);
  }

  function sectionInicio(container) {
    const user = App.auth.who();
    if (user && user.rol === 'docente') sectionSalaDocente(container);
    else sectionUnirse(container);
  }

  function configSummary(cfg) {
    const meta = GAMES_META.find((g) => g.id === cfg.mode);
    const curso = App.storage.getById('courses', cfg.courseId);
    const cat = cfg.categoryId ? App.storage.getById('categories', cfg.categoryId) : null;
    const dif = cfg.difficultyId ? App.storage.getById('difficulties', cfg.difficultyId) : null;
    return (meta ? meta.icono + ' ' + meta.nombre : cfg.mode) +
      ' · ' + (curso ? curso.nombre : '— sin curso —') +
      (cat ? ' · 📚 ' + cat.nombre : '') +
      (dif ? ' · 🎯 ' + dif.nombre : '') +
      ' · ⏱ ' + Math.round((cfg.timeSeconds || 300) / 60) + ' min';
  }

  function fillSelect(sel, items, label, selected) {
    sel.innerHTML = '';
    const ph = document.createElement('option');
    ph.value = ''; ph.textContent = label; sel.appendChild(ph);
    items.forEach((it) => {
      const opt = document.createElement('option');
      opt.value = it.id || '';
      opt.textContent = it.nombre;
      if (opt.value === selected) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  /* ------------------ docente: sala de juego ------------------ */
  function sectionSalaDocente(container) {
    navBtn('inicio');
    container.innerHTML = '';
    const user = App.auth.who();
    container.appendChild(ui.el('h1', 'text-2xl font-extrabold text-slate-900 mb-1', '🎮 Sala de juego'));
    container.appendChild(ui.el('p', 'text-sm text-slate-500 mb-5',
      'Las partidas se crean con una configuración por defecto y generan un código. Compártelo con tus alumnos; ellos se unen con su cuenta. Puedes ajustar la configuración cuando quieras.'));

    const createBtn = ui.el('button', 'btn-primary', '➕ Crear nueva partida');
    createBtn.addEventListener('click', () => {
      const l = App.lobby.create(user.id);
      ui.toast('✅ Sala creada. Código: ' + l.codigo, 'success');
      renderList();
    });
    container.appendChild(createBtn);

    const list = ui.el('div', 'mt-6 flex flex-col gap-4', '');
    container.appendChild(list);

    function renderList() {
      const mine = App.lobby.listMine(user.id);
      list.innerHTML = '';
      if (!mine.length) {
        list.appendChild(ui.el('p', 'text-sm text-slate-400', 'Aún no has creado ninguna partida. Usa el botón de arriba.'));
        return;
      }
      mine.forEach((l) => {
        const card = ui.el('div', 'l-card', '');
        const head = ui.el('div', 'flex items-center justify-between flex-wrap gap-2', '');
        head.appendChild(ui.el('div', 'lobby-code', '🔑 ' + l.codigo));
        const st = ui.el('span', 'badge ' + (l.estado === 'abierta' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'),
          l.estado === 'abierta' ? 'En espera' : 'En juego');
        head.appendChild(st);
        card.appendChild(head);
        card.appendChild(ui.el('p', 'text-sm text-slate-600 mt-1', configSummary(l.config)));

        const chips = ui.el('div', 'flex flex-wrap gap-2 mt-3', '');
        l.jugadores.forEach((pid, i) => {
          const pr = App.storage.getById('players', pid);
          const chip = ui.el('span', 'l-chip', '');
          if (pr) chip.appendChild(App.avatars.badge(App.avatars.resolve(pr, i), 22));
          chip.appendChild(document.createTextNode(' ' + (pr ? esc(pr.nombre) : '?')));
          chips.appendChild(chip);
        });
        if (!l.jugadores.length) {
          chips.appendChild(ui.el('span', 'text-sm text-slate-400', 'Sin jugadores todavía. Usa el código ' + l.codigo + ' para que se unan.'));
        }
        card.appendChild(chips);

        const acts = ui.el('div', 'flex flex-wrap gap-2 mt-4', '');
        const cfgBtn = ui.el('button', 'btn-ghost', '⚙️ Configurar');
        cfgBtn.addEventListener('click', () => configModal(l.id, renderList));
        const startBtn = ui.el('button', 'btn-primary', '▶ Iniciar partida');
        startBtn.addEventListener('click', () => {
          const r = App.lobby.start(l.id);
          if (!r.ok) return ui.toast(r.reason, 'warn');
          const cfg = r.lobby.config;
          ui.toast('🎮 Partida iniciada con ' + r.lobby.jugadores.length + ' jugador(es)', 'success');
          App.launchGame({
            container,
            mode: cfg.mode,
            courseId: cfg.courseId || null,
            categoryId: cfg.categoryId || null,
            difficultyId: cfg.difficultyId || null,
            timeSeconds: cfg.timeSeconds,
            playerIds: r.lobby.jugadores.slice()
          });
        });
        const closeBtn = ui.el('button', 'btn-ghost btn-danger', '✕ Eliminar');
        closeBtn.addEventListener('click', () => { App.lobby.close(l.id); renderList(); });
        acts.append(cfgBtn, startBtn, closeBtn);
        if (l.estado !== 'abierta') {
          const reopenBtn = ui.el('button', 'btn-ghost', '↩️ Reabrir sala');
          reopenBtn.addEventListener('click', () => {
            const r = App.lobby.reopen(l.id);
            ui.toast(r.ok ? '✅ Sala reabierta, el código ' + l.codigo + ' vuelve a aceptar jugadores' : r.reason, r.ok ? 'success' : 'warn');
            renderList();
          });
          acts.prepend(reopenBtn);
        }
        card.appendChild(acts);
        list.appendChild(card);
      });
    }
    renderList();
  }

  function configModal(lobbyId, onSave) {
    const l = App.lobby.get(lobbyId);
    const cfg = (l && l.config) ? l.config : App.lobby.defaultConfig();
    const ov = ui.el('div', 'modal-overlay', '');
    const box = ui.el('div', 'admin-form', '');
    box.appendChild(ui.el('div', 'text-lg font-bold mb-3', '⚙️ Configurar partida'));
    const form = ui.el('div', 'flex flex-col gap-3', '');

    const sMode = document.createElement('select');
    GAMES_META.forEach((g) => {
      const o = document.createElement('option');
      o.value = g.id; o.textContent = g.icono + ' ' + g.nombre;
      if (g.id === cfg.mode) o.selected = true;
      sMode.appendChild(o);
    });

    const sCurso = document.createElement('select');
    const sCat = document.createElement('select');
    const sDif = document.createElement('select');
    App.storage.getCourses().forEach((c) => {
      const o = document.createElement('option');
      o.value = c.id; o.textContent = c.nombre;
      if (c.id === cfg.courseId) o.selected = true;
      sCurso.appendChild(o);
    });
    function paintCat() {
      sCat.innerHTML = '<option value="">— Todas —</option>';
      App.storage.getCategories(sCurso.value || null).forEach((c) => {
        const o = document.createElement('option');
        o.value = c.id; o.textContent = c.nombre;
        if (c.id === cfg.categoryId) o.selected = true;
        sCat.appendChild(o);
      });
    }
    sCurso.addEventListener('change', paintCat);
    sDif.innerHTML = '<option value="">— Todas —</option>';
    App.storage.getDifficulties().forEach((d) => {
      const o = document.createElement('option');
      o.value = d.id; o.textContent = d.nombre;
      if (d.id === cfg.difficultyId) o.selected = true;
      sDif.appendChild(o);
    });

    const sTiempo = document.createElement('select');
    [60, 120, 180, 300, 600].forEach((t) => {
      const o = document.createElement('option');
      o.value = t;
      o.textContent = (t >= 60 ? Math.floor(t / 60) + ' min' : t + ' seg');
      if (t === cfg.timeSeconds) o.selected = true;
      sTiempo.appendChild(o);
    });

    const iMax = document.createElement('input');
    iMax.className = 'ffield';
    iMax.type = 'number'; iMax.min = 1; iMax.max = 4;
    iMax.value = cfg.maxJugadores || 4;

    function row(label, icon, ctl) {
      const r = ui.el('div', 'form-row', '');
      r.appendChild(ui.el('label', 'form-label', '<span class="row-icon">' + icon + '</span> ' + label));
      r.appendChild(ui.el('div', 'form-ctl', '')).appendChild(ctl);
      form.appendChild(r);
    }
    row('Modo de juego', '🎯', sMode);
    row('Curso', '🏫', sCurso);
    row('Categoría', '📚', sCat);
    row('Dificultad', '🎯', sDif);
    row('Tiempo por partida', '⏱️', sTiempo);
    row('Máx. jugadores', '🧑‍🎓', iMax);

    const save = ui.el('button', 'btn-primary w-full', '💾 Guardar configuración');
    save.addEventListener('click', () => {
      const body = {
        mode: sMode.value,
        courseId: sCurso.value || null,
        categoryId: sCat.value || '',
        difficultyId: sDif.value || '',
        timeSeconds: Number(sTiempo.value || 300),
        maxJugadores: Math.min(4, Math.max(1, Number(iMax.value || 4)))
      };
      const pool = App.storage.getQuestions({
        course_id: body.courseId || undefined,
        category_id: body.categoryId || undefined,
        difficulty_id: body.difficultyId || undefined
      });
      if (!pool.length) return ui.toast('No hay preguntas para esa combinación', 'warn');
      App.lobby.updateConfig(lobbyId, body);
      ui.toast('✅ Configuración guardada', 'success');
      ov.remove();
      onSave && onSave();
    });
    const cancel = ui.el('button', 'btn-ghost', 'Cancelar');
    cancel.addEventListener('click', () => ov.remove());

    form.appendChild(save);
    form.appendChild(cancel);
    box.appendChild(form);
    ov.appendChild(box);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    paintCat();
  }

  /* ------------------ alumno: unirse por código ------------------ */
  function sectionUnirse(container) {
    navBtn('inicio');
    container.innerHTML = '';
    const player = App.auth.currentPlayer();
    if (!player) {
      container.appendChild(ui.el('p', 'text-sm text-slate-500', 'Necesitas iniciar sesión como alumno.'));
      return;
    }
    container.appendChild(ui.el('h1', 'text-2xl font-extrabold text-slate-900 mb-1', '🎮 Unirse a la partida'));
    container.appendChild(ui.el('p', 'text-sm text-slate-500 mb-5',
      'Ingresa el código que te compartió tu docente. La partida empieza cuando el docente la inicie.'));
    container.appendChild(ui.el('p', 'text-xs text-amber-700 bg-amber-50 rounded-lg p-2 mb-4',
      '💡 Si el docente creó la sala en OTRO navegador de esta misma PC, abran la app con el servidor local (node servidor.js) en http://localhost:8787 desde ambos navegadores para que se compartan las salas.'));

    const card = ui.el('div', 'l-card', '');
    container.appendChild(card);
    const icode = document.createElement('input');
    icode.className = 'ffield join-code';
    icode.maxLength = 5;
    icode.placeholder = 'Ingresa el código…';
    card.appendChild(icode);
    const joinBtn = ui.el('button', 'btn-primary w-full mt-3', '🔑 Unirme a la sala');
    joinBtn.addEventListener('click', () => {
      const l = App.lobby.byCodigo(icode.value);
      if (!l) return ui.toast('⚠️ No se encontró una sala con el código "' + icode.value.toUpperCase() + '" en este navegador (datos locales). ¿La creaste en este mismo dispositivo?', 'error');
      const r = App.lobby.join(l.id, player.id);
      if (r.ok) { ui.toast('✅ Te uniste a la sala ' + l.codigo, 'success'); icode.value = ''; }
      else ui.toast('⚠️ ' + r.reason, 'warn');
      renderJoined();
    });
    card.appendChild(joinBtn);

    const joinedWrap = ui.el('div', 'mt-6', '');
    container.appendChild(joinedWrap);

    function renderJoined() {
      const rooms = App.lobby.listForPlayer(player.id);
      joinedWrap.innerHTML = '';
      if (!rooms.length) {
        joinedWrap.appendChild(ui.el('p', 'text-sm text-slate-400', 'Todavía no estás en ninguna sala.'));
        return;
      }
      joinedWrap.appendChild(ui.el('h2', 'text-lg font-bold mb-3', '🧑‍🤝‍🧑 Mis salas'));
      rooms.forEach((l) => {
        const c = ui.el('div', 'l-card', '');
        c.appendChild(ui.el('div', 'lobby-code', '🔑 ' + l.codigo));
        c.appendChild(ui.el('p', 'text-sm text-slate-600 mt-1', configSummary(l.config)));
        c.appendChild(ui.el('p', 'text-sm text-emerald-700 font-semibold mt-2', '✅ Te has unido · esperando a que el docente inicie'));
        const leaveBtn = ui.el('button', 'btn-ghost mt-3', 'Salir de la sala');
        leaveBtn.addEventListener('click', () => { App.lobby.leave(l.id, player.id); renderJoined(); });
        c.appendChild(leaveBtn);
        joinedWrap.appendChild(c);
      });
    }
    renderJoined();
  }

  /* ----------------------- login ----------------------- */
  function sectionLogin(container) {
    navBtn('login');
    container.innerHTML = '';
    const hero = ui.el('div', 'hero-card', '');
    hero.innerHTML =
      '<div class="hero-title">🎓 <span>LudoApp</span></div>' +
      '<div class="hero-sub">Aprende jugando en grupo: el docente crea la partida y comparte un código; los alumnos se unen con ese código.</div>' +
      '<div class="hero-pills"><span>👩‍🏫 Docente: crea salas</span><span>🧑‍🎓 Alumno: entra con el código</span><span>🕹️ 4 juegos educativos</span></div>';
    container.appendChild(hero);

    const card = ui.el('div', 'l-card setup-card', '');
    container.appendChild(card);
    card.appendChild(ui.el('h2', 'setup-title', '🔐 Iniciar sesión'));
    card.appendChild(ui.el('p', 'setup-sub', 'Cuentas de prueba locales · la contraseña es 1234 para todas.'));

    let rol = 'estudiante';
    const roleRow = ui.el('div', 'flex gap-2 mb-4', '');
    card.appendChild(roleRow);
    function roleBtn(label, key) {
      const b = ui.el('button', 'nav-btn' + (rol === key ? ' nav-btn-active' : ''), label);
      b.addEventListener('click', () => { rol = key; repaint(); });
      return b;
    }
    roleRow.append(roleBtn('🧑‍🎓 Alumno', 'estudiante'), roleBtn('👩‍🏫 Docente', 'docente'));

    const selUsr = document.createElement('select');
    const iKey = document.createElement('input');
    iKey.className = 'ffield';
    iKey.type = 'password';
    iKey.value = '1234';
    card.appendChild(ui.el('label', 'form-label', 'Cuenta'));
    card.appendChild(selUsr);
    card.appendChild(ui.el('label', 'form-label mt-2', 'Contraseña'));
    card.appendChild(iKey);

    function repaint() {
      const users = App.storage.getUsers().filter((u) => u.rol === rol);
      selUsr.innerHTML = '';
      users.forEach((u) => {
        const o = document.createElement('option');
        o.value = u.usuario;
        o.textContent = (u.nombre || u.usuario) + ' (@' + u.usuario + ')';
        selUsr.appendChild(o);
      });
    }

    const doLogin = ui.el('button', 'btn-primary w-full mt-3', '🔑 Ingresar');
    doLogin.addEventListener('click', () => {
      doLogin.disabled = true;
      App.auth.loginSecuro(selUsr.value, iKey.value).then((r) => {
        doLogin.disabled = false;
        if (!r.ok) return ui.toast('⚠️ ' + r.reason, 'error');
        ui.toast('👋 Hola, ' + (r.user.nombre || r.user.usuario), 'success');
        location.hash = '#/inicio';
      });
    });
    card.appendChild(doLogin);

    card.appendChild(ui.el('h3', 'setup-title mt-5', '⚡ Acceso rápido (demo)'));
    const quick = ui.el('div', 'flex flex-wrap gap-2 mt-2', '');
    App.storage.getUsers().forEach((u) => {
      const q = ui.el('button', 'btn-ghost text-xs',
        (u.rol === 'docente' ? '👩‍🏫 ' : '🧑‍🎓 ') + (u.nombre || u.usuario));
      q.addEventListener('click', () => {
        App.auth.loginSecuro(u.usuario, '1234').then(() => {
          ui.toast('👋 Hola, ' + (u.nombre || u.usuario), 'success');
          location.hash = '#/inicio';
        });
      });
      quick.appendChild(q);
    });
    card.appendChild(quick);

    repaint();
  }

  /* ------------------------- vista estudiante ------------------------- */
  function sectionEstudiante(container) {
    navBtn('estudiante');
    container.innerHTML = '';
    const player = App.auth.currentPlayer();
    if (!player) {
      container.appendChild(ui.el('div', 'l-card', '<p class="text-sm">Debes iniciar sesión como alumno para ver tu progreso.</p>'));
      return;
    }
    let current = player;

    const head = ui.el('div', 'flex flex-wrap items-center gap-3 mb-5', '');
    head.appendChild(ui.el('h1', 'text-2xl font-extrabold text-slate-900', '🎒 Mi progreso'));
    const nameChip = ui.el('span', 'badge bg-indigo-100 text-indigo-800 flex items-center gap-2', '');
    nameChip.appendChild(App.avatars.badge(App.avatars.resolve(App.storage.getById('players', current.id), 0), 26));
    nameChip.appendChild(document.createTextNode('🧑‍🎓 ' + esc(current.nombre)));
    head.appendChild(nameChip);
    container.appendChild(head);

    const wrap = ui.el('div', 'l-card', '');
    container.appendChild(wrap);

    function paint() {
      const P = App.progression.getPlayerProfile(current.id);
      if (!P) return;
      wrap.innerHTML = '';

      /* resumen */
      const xpInto = P.xp - P.xpNivelBase;
      const xpTotal = P.xpParaSiguiente - P.xpNivelBase;
      const sum = ui.el('div', 'grid grid-cols-2 md:grid-cols-4 gap-3 mb-6', '');
      [
        { l: 'Nivel', v: '🛡 ' + P.nivel },
        { l: 'Monedas', v: '💰 ' + P.monedas },
        { l: 'Racha máx.', v: '🔥 ' + P.rachaMax },
        { l: 'Aciertos', v: '✔ ' + P.correctas }
      ].forEach((x) => sum.appendChild(ui.el('div', 'stat-card',
        '<div class="text-xs text-slate-500">' + x.l + '</div><div class="text-lg font-extrabold">' + x.v + '</div>')));
      wrap.appendChild(sum);

      const xpbar = ui.el('div', 'mb-6', '');
      xpbar.innerHTML = '<div class="flex justify-between text-xs text-slate-500 mb-1"><span>XP ' + P.xp + '</span><span>Nivel ' + (P.nivel + 1) + ' en ' + P.xpParaSiguiente + '</span></div>' +
        '<div class="xp-track"><div class="xp-fill" style="width:' + Math.min(100, Math.round(xpInto / Math.max(1, xpTotal) * 100)) + '%"></div></div>';
      wrap.appendChild(xpbar);

      /* habilidades / tienda */
      wrap.appendChild(ui.el('h2', 'text-lg font-bold mb-2', '🧰 Habilidades y tienda'));
      const shop = ui.el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6', '');
      App.progression.SKILLS_KEYS = App.progression.SKILLS_KEYS || Object.keys(App.progression.SKILLS);
      Object.keys(App.progression.SKILLS).forEach((k) => {
        const s = App.progression.SKILLS[k];
        const have = P.skills[k] || 0;
        const c = ui.el('div', 'shop-row',
          '<div class="text-xl">' + s.icono + '</div>' +
          '<div class="flex-1"><div class="font-semibold text-sm">' + s.nombre + ' <span class="text-xs text-slate-400">×' + have + '</span></div>' +
          '<div class="text-xs text-slate-500">' + s.desc + '</div></div>' +
          '<button class="btn-ghost text-xs" data-k="' + k + '">Comprar (' + s.coste + ' ⭐)</button>');
        c.querySelector('button').addEventListener('click', () => {
          const r = App.progression.buySkill(current, k);
          ui.toast(r.ok ? '✅ Compraste: ' + s.nombre : '⚠️ ' + r.reason, r.ok ? 'success' : 'warn');
          if (r.ok) paint();
        });
        shop.appendChild(c);
      });
      wrap.appendChild(shop);

      /* estadísticas por modo */
      wrap.appendChild(ui.el('h2', 'text-lg font-bold mb-2', '📊 Estadísticas por modo'));
      const tab = ui.el('table', 'l-table mb-6', '');
      tab.innerHTML = '<thead><tr><th>Modo</th><th>Victorias</th><th>Aciertos</th><th>Fallos</th><th>XP</th></tr></thead><tbody>';
      const stats = [
        ['ludo', '🎲 Ludo'], ['batalla', '⚔️ Batalla'], ['carrera', '🏁 Carrera'], ['conquista', '🗺️ Conquista']
      ];
      stats.forEach(([k, label]) => {
        const m = P.modeStats[k] || { correctas: 0, incorrectas: 0, victorias: 0, xp: 0 };
        tab.innerHTML += '<tr><td>' + label + '</td><td>' + m.victorias + '</td><td>' + m.correctas + '</td><td>' + m.incorrectas + '</td><td>' + m.xp + '</td></tr>';
      });
      tab.innerHTML += '</tbody>';
      wrap.appendChild(tab);

      /* ranking */
      const rk = App.progression.ranking();
      const pos = rk.findIndex((x) => x.id === current.id) + 1;
      wrap.appendChild(ui.el('h2', 'text-lg font-bold mb-2', '🏆 Ranking global ' + (pos ? '· posición #' + pos : '')));
      const top = ui.el('div', 'flex flex-col gap-2', '');
      rk.slice(0, 5).forEach((r, i) => {
        const m = i === pos - 1 ? ' ring-2 ring-indigo-400' : '';
        top.appendChild(ui.el('div', 'rank-row' + m,
          '<span class="text-sm font-bold w-8">#' + (i + 1) + '</span>' +
          '<span class="flex-1 truncate font-semibold">' + esc(r.nombre) + '</span>' +
          '<span class="text-xs text-slate-500">Nv ' + r.nivel + ' · ' + r.xp + ' XP</span>'));
      });
      wrap.appendChild(top);
    }
    paint();
  }

  return { sectionInicio, sectionEstudiante, sectionLogin, navBtn, renderUserBar };
})();

/* --------------------------- lanzador de juego --------------------------- */
App.launchGame = function (opts) {
  const ui = App.ui;
  const container = opts.container || document.getElementById('app');
  App.ludoInGame = true;
  const players = opts.playerIds.map((id, i) => {
    const pr = App.storage.getById('players', id);
    return { id, nombre: pr ? pr.nombre : 'Jugador ' + (i + 1), color: ui.teamColor(i), avatar: App.avatars.resolve(pr, i) };
  });
  const config = {
    container,
    mode: opts.mode,
    courseId: opts.courseId,
    categoryId: opts.categoryId,
    difficultyId: opts.difficultyId,
    timeSeconds: opts.timeSeconds || 300,
    players
  };

  container.innerHTML = '';
  const game = App.games[opts.mode];
  if (!game || !game.init) { container.appendChild(ui.el('p', 'text-sm', 'Modo no implementado.')); return; }

  /* toolbar de salida */
  const top = ui.el('div', 'flex items-center justify-between mb-4', '');
  const meta = GAMES_META.find((g) => g.id === opts.mode);
  top.appendChild(ui.el('div', 'font-bold text-lg', (meta ? meta.icono + ' ' + meta.nombre : opts.mode)));
  const back = ui.el('button', 'btn-ghost text-sm', '← Volver al inicio');
  back.addEventListener('click', () => App.go('inicio'));
  top.appendChild(back);
  container.appendChild(top);

  const session = App.session.start(config);
  try {
    game.init(config);
  } catch (e) {
    container.appendChild(ui.el('div', 'p-4 text-rose-700 bg-rose-50 rounded mt-3', '<b>No se pudo iniciar:</b> ' + esc(e.message)));
    App.session.record(config, config.players.map((p) => ({ id: p.id, puntos: 0 })), opts.mode);
    console.error(e);
    return;
  }
  App.roam.navBtn('inicio');
};

/* --------------------------- ruteo --------------------------- */
App.go = function (key) {
  const app = document.getElementById('app');
  if (!app) return;
  location.hash = '/' + (key || 'inicio');
};

function route() {
  const app = document.getElementById('app');
  if (!app) return;
  App.ludoInGame = false;
  App.roam.renderUserBar();
  const user = App.auth.who();
  const hash = (location.hash || '#/inicio').replace('#/', '');
  if (!user) { App.roam.sectionLogin(app); return; }
  if (user.rol === 'docente') {
    if (hash === 'docente') App.roam.sectionDocente(app);
    else App.roam.sectionInicio(app);
  } else {
    if (hash === 'estudiante') App.roam.sectionEstudiante(app);
    else App.roam.sectionInicio(app);
  }
}

App.boot = function () {
  if (App.sync && App.sync.isEnabled && App.sync.isEnabled()) {
    window.addEventListener('ludo:synced', function () {
      if (App.ludoInGame) return;
      const a = document.activeElement;
      const tag = a && a.tagName ? a.tagName.toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      route();
    });
  }
  window.addEventListener('hashchange', route);
  route();
};