/* ============================================================
 * LudoApp salasAdmin.js
 * Administrar salas abiertas: ver y cerrar (una o todas).
 * Se usa desde el Panel docente (pestaña "Salas") y desde
 * "Ludo en red" (botón "Ver y cerrar salas").
 *  - Salas del servidor (partidas en red, quiz en vivo, observación):
 *    piden la clave del docente (HOST_KEY) y se cierran en el servidor.
 *  - Salas del modo anterior (código de sala): se cierran en este
 *    navegador y la sincronización las quita de los demás.
 * ============================================================ */
(function () {
  'use strict';
  const ui = App.ui;

  const TIPOS = { partida: 'Partida en red', quiz: 'Quiz en vivo', observacion: 'Observación' };
  const JUEGOS = { ludo: 'Ludo', carrera: 'Carrera', conquista: 'Conquista', batalla: 'Batalla' };
  const ESTADOS = { sala: 'esperando', jugando: 'jugando', terminada: 'terminada', lobby: 'esperando', question: 'en pregunta', reveal: 'resultado', ended: 'terminado', abierta: 'abierta' };

  let clave = '';   // solo en memoria: se pide otra vez al recargar la página

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (m, t) => { if (ui && ui.toast) ui.toast(m, t || 'info'); };
  function hace(ts) {
    const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
    return m < 1 ? 'ahora' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  }
  function boton(clase, texto, fn) {
    const b = ui.el('button', clase, texto);
    b.addEventListener('click', fn);
    return b;
  }
  function tabla(cabeceras, filas) {
    const caja = ui.el('div', '', '');
    caja.style.overflowX = 'auto';
    const t = ui.el('table', 'l-table', '');
    t.appendChild(ui.el('thead', '', '<tr>' + cabeceras.map((h) => '<th>' + esc(h) + '</th>').join('') + '</tr>'));
    const tb = ui.el('tbody', '', '');
    filas.forEach((f) => {
      const tr = document.createElement('tr');
      f.forEach((c) => {
        const td = document.createElement('td');
        if (c && c.nodeType) td.appendChild(c); else td.textContent = c;
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    caja.appendChild(t);
    return caja;
  }
  function tarjeta(titulo) {
    const c = ui.el('div', 'l-card', '');
    c.appendChild(ui.el('h2', 'text-lg font-bold mb-3', esc(titulo)));
    return c;
  }

  /* ---------------- salas del servidor ---------------- */
  function seccionServidor(raiz) {
    const c = tarjeta('🌐 Salas abiertas en el servidor');
    if (!App.net || typeof io !== 'function') {
      c.appendChild(ui.el('p', 'text-sm text-rose-600', 'Sin conexión con el servidor en vivo. Abre la app desde el servidor (npm run live).'));
      raiz.appendChild(c);
      return;
    }
    c.appendChild(ui.el('p', 'text-sm text-slate-400 mb-3', 'Incluye partidas en red, quizzes en vivo y sesiones de observación de cualquier docente. Hace falta la clave del docente (HOST_KEY).'));

    const inp = document.createElement('input');
    inp.type = 'password'; inp.autocomplete = 'off'; inp.className = 'input w-full';
    inp.placeholder = 'Clave del docente (HOST_KEY)'; inp.value = clave;
    const fila = ui.el('div', 'mb-3', '');
    fila.appendChild(inp);
    c.appendChild(fila);

    const acciones = ui.el('div', 'flex flex-wrap gap-2 mb-3', '');
    const estado = ui.el('div', 'text-sm mb-2', '');
    const lista = ui.el('div', '', '');

    const btnVer = boton('btn-primary', '🔄 Ver salas', () => cargar());
    const btnTodas = boton('btn-ghost btn-danger', '🛑 Cerrar todas', () => {
      if (!confirm('¿Cerrar TODAS las salas del servidor? Se echa a todos los jugadores.')) return;
      clave = inp.value;
      btnTodas.disabled = true;
      App.net.adminCerrarTodas(clave).then((r) => {
        if (!r.ok) { toast(r.mensaje || r.error || 'No se pudo cerrar', 'error'); btnTodas.disabled = false; return; }
        toast(r.cerradas + (r.cerradas === 1 ? ' sala cerrada' : ' salas cerradas'), 'success');
        cargar();
      });
    });
    btnTodas.disabled = true;
    acciones.append(btnVer, btnTodas);
    c.append(acciones, estado, lista);
    raiz.appendChild(c);

    function cargar() {
      clave = inp.value;
      btnVer.disabled = true;
      estado.textContent = 'Consultando…';
      App.net.adminSalas(clave).then((r) => {
        btnVer.disabled = false;
        lista.innerHTML = '';
        if (!r.ok) { btnTodas.disabled = true; estado.innerHTML = '<span class="text-rose-600">' + esc(r.mensaje || r.error || 'No se pudo consultar') + '</span>'; return; }
        const salas = r.salas || [];
        btnTodas.disabled = !salas.length;
        estado.textContent = salas.length ? salas.length + (salas.length === 1 ? ' sala abierta' : ' salas abiertas') : 'No hay salas abiertas en el servidor.';
        if (!salas.length) return;
        lista.appendChild(tabla(['Tipo', 'Código', 'Estado', 'Jugadores', 'Abierta hace', ''], salas.map((s) => {
          const det = [JUEGOS[s.juego] || s.juego, ESTADOS[s.estado] || s.estado].filter(Boolean).join(' · ');
          const cerrar = boton('btn-ghost btn-danger', 'Cerrar', () => {
            if (!confirm('¿Cerrar la sala ' + s.codigo + '? Se echa a todos los jugadores.')) return;
            cerrar.disabled = true;
            App.net.adminCerrar(clave, s.tipo, s.codigo).then((x) => {
              toast(x.ok ? 'Sala ' + s.codigo + ' cerrada' : (x.mensaje || x.error || 'No se pudo cerrar'), x.ok ? 'success' : 'error');
              cargar();
            });
          });
          return [TIPOS[s.tipo] || s.tipo, s.codigo, det, s.enLinea + ' en línea / ' + s.jugadores, hace(s.creada), cerrar];
        })));
      });
    }
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') cargar(); });
    if (clave) cargar();
  }

  /* ---------------- salas del modo anterior (en este navegador) ---------------- */
  function seccionAnterior(raiz, repintar) {
    if (!App.lobby || !App.storage || !App.storage.getLobbies) return;
    const lobbies = App.storage.getLobbies();
    const c = tarjeta('🏠 Salas con código (modo anterior)');
    if (!lobbies.length) {
      c.appendChild(ui.el('p', 'text-sm text-slate-400', 'No hay salas de este tipo.'));
      raiz.appendChild(c);
      return;
    }
    c.appendChild(ui.el('p', 'text-sm text-slate-400 mb-3', 'Se cierran en este navegador; al sincronizar desaparecen también de los demás dispositivos.'));
    c.appendChild(tabla(['Código', 'Modo', 'Estado', 'Jugadores', ''], lobbies.slice().reverse().map((l) => {
      const cerrar = boton('btn-ghost btn-danger', 'Cerrar', () => {
        if (!confirm('¿Cerrar la sala ' + l.codigo + '?')) return;
        App.lobby.close(l.id);
        toast('Sala ' + l.codigo + ' cerrada', 'success');
        repintar();
      });
      return [l.codigo, JUEGOS[l.config && l.config.mode] || (l.config && l.config.mode) || '', ESTADOS[l.estado] || l.estado, String((l.jugadores || []).length), cerrar];
    })));
    const todas = boton('btn-ghost btn-danger mt-3', '🛑 Cerrar todas las de este tipo', () => {
      if (!confirm('¿Cerrar las ' + lobbies.length + ' salas del modo anterior?')) return;
      lobbies.forEach((l) => App.lobby.close(l.id));
      toast('Salas cerradas', 'success');
      repintar();
    });
    c.appendChild(todas);
    raiz.appendChild(c);
  }

  function render(contenedor) {
    contenedor.innerHTML = '';
    const repintar = () => render(contenedor);
    seccionServidor(contenedor);
    seccionAnterior(contenedor, repintar);
  }

  function abrirModal() {
    const ov = ui.el('div', 'modal-overlay', '');
    const box = ui.el('div', 'modal-box', '');
    const cont = ui.el('div', 'p-4', '');
    box.appendChild(cont);
    const x = ui.el('button', 'modal-close', '✕');
    x.addEventListener('click', () => ov.remove());
    box.appendChild(x);
    ov.appendChild(box);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
    render(cont);
  }

  App.salasAdmin = { render: render, abrirModal: abrirModal };
})();
