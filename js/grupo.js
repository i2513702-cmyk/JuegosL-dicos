/* ============================================================
 * LudoApp grupo.js
 * "Jugar en grupo": 2 a 4 estudiantes juegan por turnos en ESTE dispositivo
 * (sin sala ni código de sala). Si el grupo entró a la sesión del docente
 * (botón 📡), su pantalla se ve en vivo en el panel del docente.
 * Se muestra arriba de la pantalla de inicio del estudiante.
 * ============================================================ */
window.App = window.App || {};
App.grupo = (function () {
  const MODES = [
    ['ludo', '🎲 Ludo'],
    ['batalla', '⚔️ Batalla'],
    ['carrera', '🏁 Carrera'],
    ['conquista', '🏰 Conquista']
  ];

  function opt(sel, value, label, selected) {
    const o = document.createElement('option');
    o.value = value; o.textContent = label; if (selected) o.selected = true;
    sel.appendChild(o);
  }

  /* reutiliza la ficha si ya existe un jugador con ese nombre */
  function playerFor(name) {
    const key = name.trim().toLowerCase();
    const found = App.storage.all('players').find((p) => p.rol !== 'docente' && String(p.nombre || '').trim().toLowerCase() === key);
    return found || App.storage.create('players', App.storage.defaultStudent(name.trim()));
  }

  function mount(container) {
    const ui = App.ui;
    if (!container || !App.auth || !App.auth.currentPlayer()) return;

    const card = ui.el('div', 'l-card setup-card', '');
    card.appendChild(ui.el('h2', 'setup-title', '👥 Jugar en grupo'));
    const s = App.share && App.share.session && App.share.session();
    card.appendChild(ui.el('p', 'setup-sub', s
      ? '📡 Conectados con el docente (sesión ' + s.code + '). Esta partida se verá en vivo en su pantalla.'
      : 'Juega con 2 a 4 compañeros en este dispositivo, por turnos. Para que el docente vea tu partida, pulsa 📡 Docente arriba e ingresa su código.'));

    const selMode = document.createElement('select');
    MODES.forEach(([id, label]) => opt(selMode, id, label));
    const selCourse = document.createElement('select');
    App.storage.getCourses().forEach((c, i) => opt(selCourse, c.id, c.nombre, i === 0));
    const selCat = document.createElement('select');
    const selDif = document.createElement('select');
    const selTime = document.createElement('select');
    [[180, '3 minutos'], [300, '5 minutos'], [600, '10 minutos']].forEach(([v, l], i) => opt(selTime, v, l, i === 1));

    function fillCats() {
      selCat.innerHTML = '';
      opt(selCat, '', '📚 Todas las categorías', true);
      (App.storage.getCategories(selCourse.value) || []).forEach((c) => opt(selCat, c.id, c.nombre));
    }
    selCourse.addEventListener('change', fillCats);
    fillCats();
    opt(selDif, '', '🎯 Todas las dificultades', true);
    (App.storage.getDifficulties() || []).forEach((d) => opt(selDif, d.id, d.nombre));

    const lbl = (t, el) => { card.appendChild(ui.el('label', 'form-label mt-2', t)); card.appendChild(el); };
    lbl('Juego', selMode);
    lbl('Curso', selCourse);
    lbl('Categoría', selCat);
    lbl('Dificultad', selDif);
    lbl('Duración', selTime);

    card.appendChild(ui.el('label', 'form-label mt-3', 'Integrantes (mínimo 2, máximo 4)'));
    const names = [];
    for (let i = 0; i < 4; i++) {
      const inp = document.createElement('input');
      inp.className = 'ffield mt-1';
      inp.maxLength = 20;
      inp.placeholder = (i < 2 ? 'Nombre del jugador ' : 'Jugador ') + (i + 1) + (i < 2 ? '' : ' (opcional)');
      card.appendChild(inp);
      names.push(inp);
    }

    const go = ui.el('button', 'btn-primary w-full mt-4', '▶️ Empezar partida');
    go.addEventListener('click', () => {
      const list = names.map((n) => n.value.trim()).filter(Boolean);
      const uniq = list.filter((n, i) => list.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i);
      if (uniq.length < 2) return ui.toast('⚠️ Escribe al menos 2 nombres distintos para jugar en grupo.', 'warn');
      App.launchGame({
        container: document.getElementById('app'),
        mode: selMode.value,
        courseId: selCourse.value || null,
        categoryId: selCat.value || null,
        difficultyId: selDif.value || null,
        timeSeconds: Number(selTime.value) || 300,
        playerIds: uniq.map((n) => playerFor(n).id)
      });
    });
    card.appendChild(go);

    container.insertBefore(card, container.firstChild);
  }

  return { mount };
})();
