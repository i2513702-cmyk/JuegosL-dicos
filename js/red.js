/* ============================================================
 * LudoApp red.js
 * Pantalla "Ludo en red" (ruta #/red y #/red/CODIGO).
 *  - Docente: crea la sala, ve quién entra y pulsa "Iniciar partida".
 *  - Alumno : escribe el código y su nombre; espera al docente.
 * Al empezar la partida dibuja el tablero con App.games.ludo.initNet.
 * Depende de App.net (core/net.js), que habla con servidor/partidas.js.
 * ============================================================ */
window.App = window.App || {};

App.red = (function () {
  'use strict';
  const ui = App.ui;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, t) => { if (ui && ui.toast) ui.toast(m, t || 'info'); };

  let offs = [];          // desuscripciones de eventos de App.net
  let raiz = null;        // contenedor actual
  let enJuego = false;

  function soltar() { offs.forEach((f) => { try { f(); } catch (e) { /* ok */ } }); offs = []; }

  function usuario() { return App.auth && App.auth.who ? App.auth.who() : null; }
  function esDocente() { const u = usuario(); return !!u && u.rol === 'docente'; }

  function banco(courseId) {
    const cats = {};
    (App.storage.getCategories() || []).forEach((c) => { cats[c.id] = c.nombre; });
    return App.storage.getQuestions(courseId ? { course_id: courseId } : null).map((q) => ({
      id: q.id,
      enunciado: q.enunciado,
      opciones: q.opciones,
      respuesta_correcta: q.respuesta_correcta,
      difficulty_id: q.difficulty_id,
      categoria: cats[q.category_id] || ''
    }));
  }

  function tarjeta(titulo) {
    const c = ui.el('div', 'card p-5 mb-4', '');
    if (titulo) c.appendChild(ui.el('h3', 'font-bold text-lg mb-3', titulo));
    return c;
  }

  function campo(etiqueta, input) {
    const w = ui.el('label', 'block mb-3 text-sm', '');
    w.appendChild(ui.el('div', 'font-semibold mb-1', etiqueta));
    w.appendChild(input);
    return w;
  }

  function input(tipo, valor, ph) {
    const i = document.createElement('input');
    i.type = tipo; i.value = valor || ''; if (ph) i.placeholder = ph;
    i.className = 'input w-full';
    return i;
  }

  function select(opciones, valor) {
    const s = document.createElement('select');
    s.className = 'input w-full';
    opciones.forEach((o) => {
      const op = document.createElement('option');
      op.value = o[0]; op.textContent = o[1];
      if (String(o[0]) === String(valor)) op.selected = true;
      s.appendChild(op);
    });
    return s;
  }

  /* ------------------------- formulario ------------------------- */
  function formulario(codigoUrl) {
    soltar(); enJuego = false;
    App.ludoInGame = false;
    raiz.innerHTML = '';
    raiz.appendChild(ui.el('h2', 'text-2xl font-bold mb-1', '🌐 Ludo en red'));
    raiz.appendChild(ui.el('p', 'text-sm text-slate-400 mb-4',
      'Cada alumno juega desde su propio dispositivo. El servidor lleva la partida.'));

    if (!App.net) {
      raiz.appendChild(ui.el('div', 'p-4 text-rose-700 bg-rose-50 rounded', 'No se cargó el módulo de red (core/net.js).'));
      return;
    }
    if (typeof io !== 'function') {
      raiz.appendChild(ui.el('div', 'p-4 text-rose-700 bg-rose-50 rounded',
        'No hay conexión con el servidor en vivo. Abre la app desde el servidor (npm run live), no desde el archivo.'));
      return;
    }

    /* ---- docente: crear sala ---- */
    if (esDocente()) {
      const c = tarjeta('👩‍🏫 Crear sala (docente)');
      const cursos = [['', 'Todos los cursos']].concat(App.storage.getCourses().map((x) => [x.id, x.nombre]));
      const selCurso = select(cursos, '');
      const clave = input('password', '', 'Clave del docente (HOST_KEY)');
      const selTurno = select([[30, '30 s'], [60, '60 s'], [90, '90 s'], [120, '2 min']], 90);
      const selTotal = select([[0, 'Sin límite'], [600, '10 min'], [1200, '20 min'], [1800, '30 min']], 0);
      c.appendChild(campo('Curso (de dónde salen las preguntas)', selCurso));
      c.appendChild(campo('Clave del docente (déjala vacía si el servidor no tiene HOST_KEY)', clave));
      c.appendChild(campo('Tiempo por turno', selTurno));
      c.appendChild(campo('Tiempo total de la partida', selTotal));
      const btn = ui.el('button', 'btn-primary', '➕ Crear sala de Ludo');
      btn.addEventListener('click', () => {
        const preguntas = banco(selCurso.value);
        if (!preguntas.length) { toast('Ese curso no tiene preguntas.', 'warn'); return; }
        btn.disabled = true;
        App.net.crear({
          juego: 'ludo', key: clave.value, banco: preguntas,
          turnoSeg: +selTurno.value, tiempoSeg: +selTotal.value
        }).then((r) => {
          btn.disabled = false;
          if (!r.ok) { toast(r.mensaje || r.error || 'No se pudo crear la sala', 'error'); return; }
          if (r.descartadas) toast(r.descartadas + ' preguntas inválidas se descartaron.', 'warn');
          vistaSala();
        });
      });
      c.appendChild(btn);
      raiz.appendChild(c);
    }

    /* ---- alumno (o cualquiera): unirse ---- */
    const u = usuario();
    const j = tarjeta('🎒 Unirme a una sala');
    const cod = input('text', codigoUrl || '', 'Código de 4 letras (ej. BKTM)');
    cod.maxLength = 4; cod.style.textTransform = 'uppercase';
    const nom = input('text', (u && (u.nombre || u.usuario)) ? String(u.nombre || u.usuario).slice(0, 14) : '', 'Tu nombre');
    nom.maxLength = 14;
    j.appendChild(campo('Código de la sala', cod));
    j.appendChild(campo('Tu nombre', nom));
    const bj = ui.el('button', 'btn-primary', '🚪 Entrar a la sala');
    bj.addEventListener('click', () => {
      bj.disabled = true;
      App.net.unirse({ codigo: cod.value.trim().toUpperCase(), nombre: nom.value, avatar: Math.floor(Math.random() * 16) }).then((r) => {
        bj.disabled = false;
        if (!r.ok) { toast(r.mensaje || r.error || 'No se pudo entrar', 'error'); return; }
        vistaSala();
      });
    });
    j.appendChild(bj);
    raiz.appendChild(j);
  }

  /* --------------------------- sala --------------------------- */
  function vistaSala() {
    soltar();
    raiz.innerHTML = '';
    const NET = App.net;
    const docente = NET.rol() === 'docente';
    const codigo = NET.codigo();

    raiz.appendChild(ui.el('h2', 'text-2xl font-bold mb-1', '🌐 Sala de Ludo'));
    const cab = tarjeta('');
    cab.appendChild(ui.el('div', 'text-sm text-slate-400', 'Código de la sala'));
    const big = ui.el('div', '', esc(codigo));
    big.style.cssText = 'font-size:3rem;font-weight:800;letter-spacing:.3em;margin:.25rem 0';
    cab.appendChild(big);
    if (docente) {
      const link = location.origin + '/partida.html?sala=' + codigo;
      const lnk = ui.el('div', 'text-xs text-slate-400 mb-2', 'Enlace para los alumnos: <b>' + esc(link) + '</b>');
      cab.appendChild(lnk);
      const cp = ui.el('button', 'btn-ghost text-sm', '📋 Copiar enlace');
      cp.addEventListener('click', () => {
        try { navigator.clipboard.writeText(link).then(() => toast('Enlace copiado', 'success')); } catch (e) { toast(link, 'info'); }
      });
      cab.appendChild(cp);
    }
    raiz.appendChild(cab);

    const lista = tarjeta('Jugadores');
    const ul = ui.el('div', '', '');
    lista.appendChild(ul);
    const info = ui.el('div', 'text-sm text-slate-400 mt-2', '');
    lista.appendChild(info);
    raiz.appendChild(lista);

    const acc = ui.el('div', 'flex gap-2 flex-wrap', '');
    const ini = ui.el('button', 'btn-primary', '▶ Iniciar partida');
    const cer = ui.el('button', 'btn-ghost', docente ? '✕ Cerrar sala' : '🚪 Salir');
    if (docente) acc.appendChild(ini);
    acc.appendChild(cer);
    raiz.appendChild(acc);

    function pintar() {
      const s = NET.sala();
      ul.innerHTML = '';
      const js = (s && s.jugadores) || [];
      if (!js.length) ul.appendChild(ui.el('div', 'text-sm text-slate-400', 'Esperando jugadores…'));
      js.forEach((p) => {
        const fila = ui.el('div', 'flex items-center justify-between py-1', '');
        fila.appendChild(ui.el('span', '', (p.online ? '🟢 ' : '⚪ ') + esc(p.nombre) +
          (!docente && NET.yo() === p.asiento ? ' (tú)' : '')));
        if (docente) {
          const x = ui.el('button', 'btn-ghost text-xs', 'Expulsar');
          x.addEventListener('click', () => NET.expulsar(p.asiento));
          fila.appendChild(x);
        }
        ul.appendChild(fila);
      });
      const min = s ? s.min : 1, max = s ? s.max : 4;
      info.textContent = js.length + ' de ' + max + ' jugadores' + (js.length < min ? ' · faltan jugadores (mínimo ' + min + ')' : '');
      ini.disabled = js.length < min;
      if (!docente) info.textContent += ' · esperando que el docente inicie…';
    }
    pintar();

    ini.addEventListener('click', () => {
      ini.disabled = true;
      NET.iniciar().then((r) => {
        if (!r.ok) { toast(r.mensaje || r.error || 'No se pudo iniciar', 'error'); pintar(); }
      });
    });
    cer.addEventListener('click', () => {
      if (docente && !confirm('¿Cerrar la sala? Se echa a todos los jugadores.')) return;
      (docente ? NET.cerrar() : NET.salir()).then(() => formulario(''));
    });

    offs.push(NET.on('sala', pintar));
    offs.push(NET.on('estado', () => { if (!enJuego) vistaJuego(); }));
    offs.push(NET.on('cerrada', () => { toast('El docente cerró la sala.', 'warn'); formulario(''); }));
    offs.push(NET.on('expulsado', () => { toast('Fuiste retirado de la sala.', 'warn'); formulario(''); }));

    if (NET.estado()) vistaJuego();     // reconexión con la partida ya empezada
  }

  /* --------------------------- juego --------------------------- */
  function vistaJuego() {
    const NET = App.net;
    enJuego = true;
    soltar();
    raiz.innerHTML = '';
    raiz.classList.add('game-view');
    App.ludoInGame = true;
    const cont = ui.el('div', '', '');
    raiz.appendChild(cont);
    try {
      App.games.ludo.initNet({ container: cont, codigo: NET.codigo(), rol: NET.rol(), yo: NET.yo() });
    } catch (e) {
      console.error(e);
      cont.appendChild(ui.el('div', 'p-4 text-rose-700 bg-rose-50 rounded', 'No se pudo dibujar la partida: ' + esc(e.message)));
    }
  }

  /* ------------------------- entrada ------------------------- */
  function mount(container, codigoUrl) {
    raiz = container;
    soltar(); enJuego = false;
    const NET = App.net;
    if (!NET) { formulario(codigoUrl); return; }
    NET.conectar();
    if (NET.tieneDocente() || NET.tieneAlumno()) {
      raiz.innerHTML = '';
      raiz.appendChild(ui.el('p', 'text-slate-400', 'Reconectando a tu sala…'));
      let hecho = false;
      const dejar = () => { if (hecho) return; hecho = true; formulario(codigoUrl); };
      NET.reanudar().then(() => { if (!hecho) { hecho = true; vistaSala(); } }, dejar);
      setTimeout(dejar, 8000);
      return;
    }
    formulario(codigoUrl);
  }

  return { mount };
})();
