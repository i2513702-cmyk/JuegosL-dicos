/* ============================================================
 * LudoApp admin.js
 * Panel docente: CRUD de cursos, categorías, dificultades y
 * preguntas; gestión de estudiantes; reportes y respaldo de datos.
 * ============================================================ */
(function () {
  const ui = App.ui;
  let currentSection = 'preguntas';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  function card(title, inner) {
    const c = ui.el('div', 'l-card', '');
    c.appendChild(ui.el('h2', 'text-lg font-bold mb-3', title));
    c.appendChild(inner);
    return c;
  }

  function field(label, input) {
    const w = ui.el('div', 'form-row', '');
    w.appendChild(ui.el('label', 'form-label', label));
    w.appendChild(ui.el('div', 'form-ctl', '')).appendChild(input);
    return w;
  }

  /* ------------------------------- modal ------------------------------- */
  function modal(body) {
    const ov = ui.el('div', 'modal-overlay', '');
    const box = ui.el('div', 'modal-box', '');
    box.appendChild(body);
    const close = ui.el('button', 'modal-close', '✕');
    close.addEventListener('click', () => ov.remove());
    box.appendChild(close);
    ov.appendChild(box);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    return { box, close, ov };
  }

  function confirmBox(message, onYes) {
    const m = modal(ui.el('div', 'p-4', ''));
    m.box.querySelector('.modal-close').remove();
    m.box.classList.remove('modal-box');
    m.box.className = 'confirm-box';
    m.box.innerHTML = '<div class="text-lg font-bold mb-2">¿Confirmar?</div><p class="text-sm text-slate-600 mb-4">' + message + '</p>';
    const ok = ui.el('button', 'btn-primary', 'Sí, continuar');
    const no = ui.el('button', 'btn-ghost ml-2', 'Cancelar');
    ok.addEventListener('click', () => { m.ov.remove(); onYes(); });
    no.addEventListener('click', () => m.ov.remove());
    m.box.append(ok, no);
  }

  /* ------------------------------- render ------------------------------- */
  function render(container) {
    container.innerHTML = '';
    container.appendChild(ui.el('h1', 'text-2xl font-extrabold text-slate-900 mb-5', '👩‍🏫 Panel docente'));
    const side = ui.el('div', 'admin-tabs', '');
    const tabs = [
      ['preguntas', '📝 Preguntas'],
      ['cursos', '🏫 Cursos'],
      ['categorias', '🗂️ Categorías'],
      ['dificultades', '🎯 Dificultades'],
      ['estudiantes', '🧑‍🎓 Estudiantes'],
      ['reportes', '📈 Reportes'],
      ['datos', '💾 Datos']
    ];
    tabs.forEach(([k, label]) => {
      const b = ui.el('button', 'admin-tab' + (k === currentSection ? ' admin-tab-on' : ''), label);
      b.addEventListener('click', () => { currentSection = k; render(container); });
      side.appendChild(b);
    });
    container.appendChild(side);
    const body = ui.el('div', 'admin-body', '');
    container.appendChild(body);
    sections[currentSection](body);
  }

  /* ---------------------------- secciones ---------------------------- */
  const sections = { preguntas, cursos, categorias, dificultades, estudiantes, reportes, datos };

  function selectCurso(value, change) {
    const s = document.createElement('select');
    const cs = App.storage.getCourses();
    const o = document.createElement('option'); o.value = ''; o.textContent = '— Curso —'; s.appendChild(o);
    cs.forEach((c) => {
      const op = document.createElement('option'); op.value = c.id; op.textContent = c.nombre;
      if (c.id === value) op.selected = true;
      s.appendChild(op);
    });
    s.addEventListener('change', () => change && change(s.value));
    return s;
  }

  function preguntas(body) {
    const filtros = ui.el('div', 'flex flex-wrap gap-2 mb-4', '');
    const sCurso = selectCurso(null);
    const sCat = document.createElement('select'); sCat.innerHTML = '<option value="">— Categoría —</option>';
    const sDif = document.createElement('select'); sDif.innerHTML = '<option value="">— Dificultad —</option>';
    App.storage.getDifficulties().forEach((d) => {
      const op = document.createElement('option'); op.value = d.id; op.textContent = d.nombre; sDif.appendChild(op);
    });
    const paintCat = () => {
      sCat.innerHTML = '<option value="">— Categoría —</option>';
      App.storage.getCategories(sCurso.value || null).forEach((c) => {
        const op = document.createElement('option'); op.value = c.id; op.textContent = c.nombre; sCat.appendChild(op);
      });
      paint();
    };
    sCurso.addEventListener('change', paintCat);
    sCat.addEventListener('change', paint);
    sDif.addEventListener('change', paint);

    const nueva = ui.el('button', 'btn-primary', '➕ Nueva pregunta');
    nueva.addEventListener('click', () => formPregunta(null));
    const subir = ui.el('button', 'btn-ghost text-xs', '☁️ Subir todo a la BD');
    subir.addEventListener('click', () => syncAll(false));
    const traer = ui.el('button', 'btn-ghost text-xs', '🌐 Traer de la BD');
    traer.addEventListener('click', pullDb);
    filtros.append(sCurso, sCat, sDif, nueva, subir, traer);
    body.appendChild(filtros);

    const list = ui.el('div', 'flex flex-col gap-2', '');
    body.appendChild(list);

    /* Sincroniza el banco local de preguntas hacia Supabase (upsert por id). */
    function syncAll(quiet) {
      if (!(App.api && App.api.token())) {
        if (!quiet) ui.toast('Inicia sesión con la API activa (server corriendo) para subir a la BD', 'warn');
        return;
      }
      const listQ = App.storage.all('questions');
      if (!listQ.length) { if (!quiet) ui.toast('No hay preguntas locales para subir', 'warn'); return; }
      App.api.importQuestions(listQ).then((r) => {
        if (!r) return ui.toast('⚠️ API no disponible (¿corre "node api/server.js"?).', 'warn');
        if (!r.ok) return ui.toast('Error al subir: ' + (r.error || r.reason || ''), 'error');
        ui.toast('☁️ Subidas ' + (r.inserted || listQ.length) + ' preguntas a la BD de Supabase', 'success');
      });
    }

    /* Trae las preguntas desde Supabase y las guarda en el banco local. */
    function pullDb() {
      if (!(App.api && App.api.token())) return ui.toast('Inicia sesión con la API activa (server corriendo) para traer de la BD', 'warn');
      App.api.listQuestions().then((r) => {
        if (!r) return ui.toast('⚠️ API no disponible (¿corre "node api/server.js"?).', 'warn');
        if (!r.ok) return ui.toast('Error: ' + (r.error || r.reason || ''), 'error');
        localStorage.setItem('ludoApp:questions', JSON.stringify(r.data));
        ui.toast('🌐 BD sincronizada: ' + r.count + ' preguntas en local', 'success');
        paint();
      });
    }

    function paint() {
      let qs = App.storage.getQuestions();
      if (sCurso.value) qs = qs.filter((x) => x.course_id === sCurso.value);
      if (sCat.value) qs = qs.filter((x) => x.category_id === sCat.value);
      if (sDif.value) qs = qs.filter((x) => x.difficulty_id === sDif.value);
      list.innerHTML = '';
      if (!qs.length) {
        list.appendChild(ui.el('p', 'text-sm text-slate-500', 'Sin preguntas con esos filtros.'));
        return;
      }
      const cat = {}, dif = {}, cur = {};
      App.storage.getCategories().forEach((c) => cat[c.id] = c);
      App.storage.getDifficulties().forEach((d) => dif[d.id] = d);
      App.storage.getCourses().forEach((c) => cur[c.id] = c);
      qs.forEach((q) => {
        const row = ui.el('div', 'admin-row', '');
        row.innerHTML =
          '<div class="flex-1 min-w-0"><div class="font-semibold text-sm truncate">' + esc(q.enunciado) + '</div>' +
          '<div class="text-xs text-slate-500">' +
          ['A', 'B', 'C', 'D'].map((k, i) => (i === q.respuesta_correcta ? '✅' : '•') + ' ' + esc(q.opciones[i])).join(' &nbsp;·&nbsp; ') +
          '</div><div class="text-xs text-slate-400 mt-1">' +
          (cur[q.course_id] ? '🏫 ' + esc(cur[q.course_id].nombre) : '') +
          (cat[q.category_id] ? ' · 📚 ' + esc(cat[q.category_id].nombre) : '') +
          (dif[q.difficulty_id] ? ' · 🎯 ' + esc(dif[q.difficulty_id].nombre) : '') + '</div></div>';
        const btns = ui.el('div', 'flex gap-1', '');
        const ed = ui.el('button', 'btn-ghost text-xs', '✏️ Editar');
        ed.addEventListener('click', () => formPregunta(q));
        const del = ui.el('button', 'btn-ghost btn-danger text-xs', '🗑️');
        del.addEventListener('click', () => confirmBox('¿Eliminar esta pregunta?', () => {
          App.storage.endpoint('DELETE', '/questions/' + q.id);
          if (App.api && App.api.token()) App.api.deleteQuestion(q.id);
          ui.toast('Pregunta eliminada', 'success');
          paint();
        }));
        btns.append(ed, del);
        row.appendChild(btns);
        list.appendChild(row);
      });
    }

    function formPregunta(q) {
      const m = modal(ui.el('div', 'p-4', ''));
      m.box.querySelector('.modal-close').remove();
      m.box.classList.remove('modal-box');
      m.box.className = 'admin-form';
      m.box.innerHTML = '<div class="text-lg font-bold mb-3">' + (q ? '✏️ Editar pregunta' : '➕ Nueva pregunta') + '</div>';
      const form = ui.el('div', 'flex flex-col gap-3', '');

      const sCursoQ = selectCurso(q && q.course_id, () => { sCatQ.innerHTML = '<option value="">— Categoría —</option>'; App.storage.getCategories(sCursoQ.value || null).forEach((c) => { const op = document.createElement('option'); op.value = c.id; op.textContent = c.nombre; sCatQ.appendChild(op); }); });
      const sCatQ = document.createElement('select');
      sCatQ.innerHTML = '<option value="">— Categoría —</option>';
      App.storage.getCategories((q && q.course_id) || null).forEach((c) => {
        const op = document.createElement('option'); op.value = c.id; op.textContent = c.nombre;
        if (q && q.category_id === c.id) op.selected = true;
        sCatQ.appendChild(op);
      });
      const sDifQ = document.createElement('select');
      App.storage.getDifficulties().forEach((d) => {
        const op = document.createElement('option'); op.value = d.id; op.textContent = d.nombre;
        if (q && q.difficulty_id === d.id) op.selected = true;
        sDifQ.appendChild(op);
      });

      const iEnun = document.createElement('input'); iEnun.className = 'ffield'; iEnun.value = q ? q.enunciado : '';
      const iFeedback = document.createElement('input'); iFeedback.className = 'ffield'; iFeedback.value = q ? (q.feedback || '') : '';
      const iEjemplo = document.createElement('input'); iEjemplo.className = 'ffield'; iEjemplo.value = q ? (q.ejemplo_aplicado || '') : '';
      const iOpc = [];
      for (let i = 0; i < 4; i++) {
        const t = document.createElement('input'); t.className = 'ffield'; t.value = q ? (q.opciones[i] || '') : '';
        iOpc.push(t);
      }
      const sCorr = document.createElement('select');
      ['A', 'B', 'C', 'D'].forEach((k, i) => {
        const op = document.createElement('option'); op.value = i; op.textContent = k;
        if (q && q.respuesta_correcta === i) op.selected = true;
        sCorr.appendChild(op);
      });

      form.appendChild(field('Curso', sCursoQ));
      form.appendChild(field('Categoría', sCatQ));
      form.appendChild(field('Dificultad', sDifQ));
      form.appendChild(field('Enunciado', iEnun));
      ['Opción A', 'Opción B', 'Opción C', 'Opción D'].forEach((l, i) => form.appendChild(field(l, iOpc[i])));
      form.appendChild(field('Respuesta correcta', sCorr));
      form.appendChild(field('Retroalimentación', iFeedback));
      form.appendChild(field('Ejemplo aplicado (opcional)', iEjemplo));

      const save = ui.el('button', 'btn-primary w-full', '💾 Guardar');
      save.addEventListener('click', () => {
        const bodyP = {
          course_id: sCursoQ.value,
          category_id: sCatQ.value,
          difficulty_id: sDifQ.value,
          enunciado: iEnun.value.trim(),
          opciones: iOpc.map((t) => t.value.trim()),
          respuesta_correcta: Number(sCorr.value),
          feedback: iFeedback.value.trim(),
          ejemplo_aplicado: iEjemplo.value.trim()
        };
        if (!bodyP.course_id) return ui.toast('Selecciona un curso', 'warn');
        if (!bodyP.enunciado || bodyP.opciones.some((x) => !x)) return ui.toast('Completa enunciado y las 4 opciones', 'warn');
        if (q) App.storage.endpoint('PUT', '/questions/' + q.id, bodyP);
        else App.storage.endpoint('POST', '/questions', bodyP);
        ui.toast('✅ Pregunta guardada', 'success');
        m.ov.remove();
        paint();
        syncAll(true);
        sCurso.dispatchEvent(new Event('change'));
      });
      form.appendChild(save);
      m.box.appendChild(form);
    }
    paint();
  }

  function cursos(body) {
    const addRow = ui.el('div', 'flex gap-2 mb-4', '');
    const iNew = document.createElement('input'); iNew.className = 'ffield flex-1'; iNew.placeholder = 'Nombre del curso…';
    const add = ui.el('button', 'btn-primary', '➕ Añadir');
    add.addEventListener('click', () => {
      if (!iNew.value.trim()) return ui.toast('Escribe un nombre', 'warn');
      App.storage.create('courses', { nombre: iNew.value.trim(), descripcion: '' });
      iNew.value = '';
      renderSection();
    });
    addRow.append(iNew, add);
    body.appendChild(addRow);

    const list = ui.el('div', 'flex flex-col gap-2', '');
    body.appendChild(list);

    function renderSection() {
      list.innerHTML = '';
      const cs = App.storage.getCourses();
      if (!cs.length) return;
      cs.forEach((c) => {
        const row = ui.el('div', 'admin-row', '');
        row.innerHTML = '<div class="flex-1"><div class="font-semibold">' + esc(c.nombre) + '</div>' +
          '<div class="text-xs text-slate-500">' + App.storage.getQuestions().filter((q) => q.course_id === c.id).length + ' preguntas · ' + App.storage.getCategories(c.id).length + ' categorías</div></div>';
        const btns = ui.el('div', 'flex gap-1', '');
        const ed = ui.el('button', 'btn-ghost text-xs', '✏️ Renombrar');
        ed.addEventListener('click', () => {
          const nn = prompt('Nuevo nombre del curso', c.nombre);
          if (nn && nn.trim()) { App.storage.update('courses', c.id, { nombre: nn.trim() }); renderSection(); }
        });
        const del = ui.el('button', 'btn-ghost btn-danger text-xs', '🗑️');
        del.addEventListener('click', () => {
          if (App.storage.getQuestions().some((q) => q.course_id === c.id)) return ui.toast('No se puede eliminar: tiene preguntas asociadas', 'warn');
          confirmBox('¿Eliminar el curso ' + c.nombre + '?', () => { App.storage.endpoint('DELETE', '/courses/' + c.id); renderSection(); });
        });
        btns.append(ed, del);
        row.appendChild(btns);
        list.appendChild(row);
      });
    }
    renderSection();
  }

  function categorias(body) {
    const sCurso = selectCurso(null, () => renderSection());
    body.appendChild(ui.el('div', 'flex flex-wrap gap-2 mb-4', '')).appendChild(sCurso);

    const addRow = ui.el('div', 'flex gap-2 mb-4', '');
    const iNew = document.createElement('input'); iNew.className = 'ffield flex-1'; iNew.placeholder = 'Nombre de la categoría…';
    const add = ui.el('button', 'btn-primary', '➕ Añadir');
    add.addEventListener('click', () => {
      if (!sCurso.value) return ui.toast('Selecciona un curso', 'warn');
      if (!iNew.value.trim()) return ui.toast('Escribe un nombre', 'warn');
      App.storage.create('categories', { nombre: iNew.value.trim(), course_id: sCurso.value });
      iNew.value = '';
      renderSection();
    });
    addRow.append(iNew, add);
    body.appendChild(addRow);

    const list = ui.el('div', 'flex flex-col gap-2', '');
    body.appendChild(list);

    function renderSection() {
      list.innerHTML = '';
      const cs = App.storage.getCategories(sCurso.value || null);
      if (!cs.length) { list.appendChild(ui.el('p', 'text-sm text-slate-500', sCurso.value ? 'Sin categorías para este curso.' : 'Selecciona un curso.')); return; }
      cs.forEach((c) => {
        const row = ui.el('div', 'admin-row', '');
        row.innerHTML = '<div class="flex-1 font-semibold">' + esc(c.nombre) + '</div>';
        const btns = ui.el('div', 'flex gap-1', '');
        const ed = ui.el('button', 'btn-ghost text-xs', '✏️');
        ed.addEventListener('click', () => {
          const nn = prompt('Nombre de la categoría', c.nombre);
          if (nn && nn.trim()) { App.storage.update('categories', c.id, { nombre: nn.trim() }); renderSection(); }
        });
        const del = ui.el('button', 'btn-ghost btn-danger text-xs', '🗑️');
        del.addEventListener('click', () => {
          if (App.storage.getQuestions().some((q) => q.category_id === c.id)) return ui.toast('No se puede eliminar: tiene preguntas asociadas', 'warn');
          confirmBox('¿Eliminar la categoría ' + c.nombre + '?', () => { App.storage.endpoint('DELETE', '/categories/' + c.id); renderSection(); });
        });
        btns.append(ed, del);
        row.appendChild(btns);
        list.appendChild(row);
      });
    }
    renderSection();
  }

  function dificultades(body) {
    const addRow = ui.el('div', 'flex gap-2 mb-4', '');
    const iNew = document.createElement('input'); iNew.className = 'ffield flex-1'; iNew.placeholder = 'Nombre (p.ej. Fácil)…';
    const iPeso = document.createElement('input'); iPeso.className = 'ffield'; iPeso.type = 'number'; iPeso.value = '1'; iPeso.title = 'Puntos base';
    const add = ui.el('button', 'btn-primary', '➕ Añadir');
    add.addEventListener('click', () => {
      if (!iNew.value.trim()) return ui.toast('Escribe un nombre', 'warn');
      App.storage.create('difficulties', { nombre: iNew.value.trim(), peso_puntos: Number(iPeso.value || 1) });
      iNew.value = '';
      renderSection();
    });
    addRow.append(iNew, iPeso, add);
    body.appendChild(addRow);

    const list = ui.el('div', 'flex flex-col gap-2', '');
    body.appendChild(list);
    function renderSection() {
      list.innerHTML = '';
      const ds = App.storage.getDifficulties();
      ds.forEach((d) => {
        const row = ui.el('div', 'admin-row', '');
        row.innerHTML = '<div class="flex-1 font-semibold">' + esc(d.nombre) + ' <span class="text-xs text-slate-400">· peso ' + d.peso_puntos + '</span></div>';
        const btns = ui.el('div', 'flex gap-1', '');
        const ed = ui.el('button', 'btn-ghost text-xs', '✏️');
        ed.addEventListener('click', () => {
          const nn = prompt('Nombre de la dificultad', d.nombre);
          if (nn && nn.trim()) { App.storage.update('difficulties', d.id, { nombre: nn.trim() }); renderSection(); }
        });
        const del = ui.el('button', 'btn-ghost btn-danger text-xs', '🗑️');
        del.addEventListener('click', () => {
          if (App.storage.getQuestions().some((q) => q.difficulty_id === d.id)) return ui.toast('No se puede eliminar: tiene preguntas asociadas', 'warn');
          confirmBox('¿Eliminar la dificultad ' + d.nombre + '?', () => { App.storage.endpoint('DELETE', '/difficulties/' + d.id); renderSection(); });
        });
        btns.append(ed, del);
        row.appendChild(btns);
        list.appendChild(row);
      });
    }
    renderSection();
  }

  function estudiantes(body) {
    const addRow = ui.el('div', 'flex gap-2 mb-4', '');
    const iNew = document.createElement('input'); iNew.className = 'ffield flex-1'; iNew.placeholder = 'Nombre del estudiante…';
    const add = ui.el('button', 'btn-primary', '➕ Añadir');
    add.addEventListener('click', () => {
      if (!iNew.value.trim()) return ui.toast('Escribe un nombre', 'warn');
      App.storage.create('players', App.storage.defaultStudent
        ? App.storage.defaultStudent(iNew.value.trim())
        : {
          nombre: iNew.value.trim(), rol: 'estudiante', xp: 0, monedas: 60, puntos: 0,
          correctas: 0, incorrectas: 0, racha: 0, rachaMax: 0, nivel: 1, logros: [], modosGanados: [],
          skills: { pista: 1, comodin: 0, doble_dano: 1, escudo: 1, impulso: 0, cura: 0 }
        });
      iNew.value = '';
      renderSection();
    });
    addRow.append(iNew, add);
    body.appendChild(addRow);

    const list = ui.el('div', 'flex flex-col gap-2', '');
    body.appendChild(list);

    function avatarPicker(p, cb) {
      const m = modal(ui.el('div', 'p-4', ''));
      const cx = m.box.querySelector('.modal-close');
      if (cx) cx.remove();
      m.box.classList.remove('modal-box');
      m.box.className = 'admin-form';
      m.box.innerHTML = '<div class="text-lg font-bold mb-3">🎨 Elegir avatar de ' + esc(p.nombre) + '</div>';
      const grid = ui.el('div', 'grid grid-cols-2 sm:grid-cols-3 gap-2', '');
      App.avatars.CHARACTERS.forEach((c) => {
        const b = ui.el('button', 'btn-ghost avatar-choice', '');
        b.appendChild(App.avatars.badge(c, 44));
        b.appendChild(ui.el('div', 'text-xs font-semibold mt-1', esc(c.name)));
        b.addEventListener('click', () => {
          App.storage.update('players', p.id, { avatarId: c.id });
          ui.toast('✅ Avatar de ' + p.nombre + ': ' + c.name, 'success');
          m.ov.remove();
          cb && cb();
        });
        grid.appendChild(b);
      });
      m.box.appendChild(grid);
    }

    function renderSection() {
      list.innerHTML = '';
      App.storage.getPlayers().filter((p) => p.rol !== 'docente').forEach((p, i) => {
        const row = ui.el('div', 'admin-row', '');
        const info = ui.el('div', 'flex-1', '');
        info.appendChild(ui.el('div', 'font-semibold', esc(p.nombre)));
        info.appendChild(ui.el('div', 'text-xs text-slate-500', 'Nv ' + p.nivel + ' · ' + p.correctas + ' aciertos · ' + p.xp + ' XP'));
        row.appendChild(info);

        const chips = ui.el('div', 'flex gap-1 items-center', '');
        const avChip = ui.el('span', 'l-chip flex items-center gap-1', '');
        const av = App.avatars.resolve(p, i);
        avChip.appendChild(App.avatars.badge(av, 26));
        const avBtn = ui.el('button', 'btn-ghost text-xs', '🎨');
        avBtn.title = 'Cambiar avatar (' + av.name + ')';
        avBtn.addEventListener('click', () => avatarPicker(p, renderSection));
        avChip.appendChild(avBtn);
        chips.appendChild(avChip);

        const del = ui.el('button', 'btn-ghost btn-danger text-xs', '🗑️');
        del.addEventListener('click', () => confirmBox('¿Eliminar a ' + p.nombre + '?', () => { App.storage.endpoint('DELETE', '/players/' + p.id); renderSection(); }));
        chips.appendChild(del);
        row.appendChild(chips);
        list.appendChild(row);
      });
    }
    renderSection();
  }

  function reportes(body) {
    const rk = App.progression.ranking();
    const attempts = App.storage.getAttempts();
    const correctas = attempts.filter((a) => a.correcto).length;

    const cards = ui.el('div', 'grid grid-cols-2 md:grid-cols-4 gap-3 mb-6', '');
    [
      { l: 'Preguntas', v: App.storage.getQuestions().length },
      { l: 'Intentos', v: attempts.length },
      { l: 'Aciertos', v: correctas },
      { l: 'Precisión', v: attempts.length ? Math.round(correctas / attempts.length * 100) + '%' : '—' }
    ].forEach((x) => cards.appendChild(ui.el('div', 'stat-card', '<div class="text-xs text-slate-500">' + x.l + '</div><div class="text-lg font-extrabold">' + x.v + '</div>')));
    body.appendChild(cards);

    body.appendChild(card('🏆 Ranking de jugadores', (() => {
      const t = ui.el('table', 'l-table', '');
      t.innerHTML = '<thead><tr><th>#</th><th>Jugador</th><th>Nivel</th><th>XP</th><th>Aciertos</th><th>Victorias</th></tr></thead><tbody>' +
        rk.map((r, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(r.nombre) + '</td><td>' + r.nivel + '</td><td>' + r.xp + '</td><td>' + r.correctas + '</td><td>' + r.victorias + '</td></tr>').join('') +
        '</tbody>';
      return t;
    })()));

    body.appendChild(card('📈 Últimos intentos', (() => {
      const t = ui.el('table', 'l-table', '');
      const folks = {};
      App.storage.getPlayers().forEach((p) => folks[p.id] = p.nombre);
      const difs = {};
      App.storage.getDifficulties().forEach((d) => difs[d.id] = d.nombre);
      t.innerHTML = '<thead><tr><th>Fecha</th><th>Jugador</th><th>Modo</th><th>Dificultad</th><th>Resultado</th><th>+XP</th></tr></thead><tbody>' +
        attempts.slice(0, 15).map((a) => {
          const when = new Date(a.collectedAt || a.createdAt).toLocaleString();
          return '<tr><td class="text-xs">' + when + '</td><td>' + esc(folks[a.playerId] || '?') + '</td><td>' + (a.mode || '') + '</td>' +
            '<td>' + esc(difs[a.dificultadId] || '') + '</td><td>' + (a.correcto ? '✅' : '❌') + '</td><td>' + a.xp + '</td></tr>';
        }).join('') + '</tbody>';
      return t;
    })()));
  }

  function datos(body) {
    const btnBackup = ui.el('button', 'btn-primary', '📥 Exportar respaldo');
    btnBackup.addEventListener('click', () => {
      const data = {
        courses: App.storage.all('courses'),
        categories: App.storage.all('categories'),
        difficulties: App.storage.all('difficulties'),
        questions: App.storage.all('questions'),
        players: App.storage.all('players'),
        sessions: App.storage.all('sessions'),
        attempts: App.storage.all('attempts')
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ludoapp-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      ui.toast('Respaldo generado', 'success');
    });

    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json';
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const data = JSON.parse(rd.result);
          ['courses', 'categories', 'difficulties', 'questions', 'players', 'sessions', 'attempts'].forEach((k) => {
            if (Array.isArray(data[k])) localStorage.setItem('ludoApp:' + k, JSON.stringify(data[k]));
          });
          ui.toast('Datos restaurados', 'success');
          setTimeout(() => location.reload(), 600);
        } catch (e) { ui.toast('Archivo inválido', 'error'); }
      };
      rd.readAsText(f);
    });
    const btnImport = ui.el('button', 'btn-ghost', '📤 Importar respaldo');
    btnImport.addEventListener('click', () => inp.click());

    const btnReset = ui.el('button', 'btn-ghost btn-danger', '⚠️ Restablecer datos de demo');
    btnReset.addEventListener('click', () => confirmBox('¿Borrar todo y recargar los datos de ejemplo?', () => { App.storage.resetData(); location.reload(); }));

    const inner = ui.el('div', 'flex flex-wrap gap-2', '');
    inner.append(btnBackup, btnImport, btnReset);
    body.appendChild(card('Respaldo y restauración', inner));
  }

  /* registrar la vista como módulo de ruteo */
  App.roam = App.roam || {};
  App.roam.sectionDocente = function (container) {
    App.roam.navBtn('docente');
    render(container);
  };
})();