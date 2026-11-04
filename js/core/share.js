/* ============================================================
 * LudoApp core/share.js
 * El grupo entra con el CÓDIGO del docente y, mientras juega, su
 * pantalla se transmite en vivo al panel del docente (ver.html).
 *   - join(code, name)  : entra a la sesión del docente
 *   - attach(root, mode): empieza a transmitir la partida (lo llama launchGame)
 *   - detach()          : avisa que ya no hay partida
 * Al unirse recibe además el BANCO DE PREGUNTAS del docente y lo guarda
 * en el almacenamiento local (cursos, categorías, dificultades, preguntas).
 * Sin servidor en vivo (file://, servidor.js) no hace nada y la app sigue igual.
 * ============================================================ */
window.App = window.App || {};
App.share = (function () {
  const KEY = 'ludoShare';
  const PREFIX = 'ludoApp:';
  const BANK_COLS = ['courses', 'categories', 'difficulties', 'questions'];

  let socket = null;
  let sess = null;               // { code, name, id }
  let btn = null;
  let root = null, mode = '', obs = null, timer = null, deb = null, lastHash = '';

  const hasIO = () => typeof window.io === 'function';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const save = (v) => { try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch (e) { /* sin storage */ } };
  const toast = (m, t) => { try { App.ui.toast(m, t || 'info'); } catch (e) { /* ui aún no cargó */ } };

  function paintBtn() {
    if (!btn) return;
    btn.textContent = sess ? '📡 ' + sess.code + ' · ' + sess.name : '📡 Docente';
    btn.title = sess ? 'Transmitiendo tu pantalla al docente. Clic para salir.' : 'Entrar con el código del docente';
    btn.classList.toggle('share-on', !!sess);
  }

  function connect() {
    if (socket) return socket;
    socket = window.io();
    socket.on('connect', () => { if (sess) rejoin(); });
    socket.on('watch:closed', () => { toast('El docente cerró la sesión de observación', 'warn'); leave(true); });
    socket.on('share:kicked', () => { toast('El docente te sacó de la sesión', 'warn'); leave(true); });
    return socket;
  }

  function rejoin() {
    if (!sess) return;
    socket.emit('share:join', { code: sess.code, name: sess.name, id: sess.id }, (r) => {
      if (!r || !r.ok) { leave(true); return; }
      sess.id = r.id; save(sess); paintBtn();
      if (root) { lastHash = ''; tick(true); }
    });
  }

  /* guarda el banco del docente en el almacenamiento local de este dispositivo */
  function applyBank(bank) {
    if (!bank) return 0;
    let n = 0;
    BANK_COLS.forEach((c) => {
      if (Array.isArray(bank[c]) && bank[c].length) {
        try { localStorage.setItem(PREFIX + c, JSON.stringify(bank[c])); } catch (e) { /* lleno */ }
        if (c === 'questions') n = bank[c].length;
      }
    });
    try { localStorage.setItem(PREFIX + 'seeded', 'true'); } catch (e) { /* ok */ }
    return n;
  }

  function join(code, name, cb) {
    cb = cb || function () {};
    if (!hasIO()) return cb({ ok: false, error: 'Esta función requiere el servidor en vivo (desplegado). Abre la app desde la URL del docente.' });
    code = String(code || '').trim().toUpperCase();
    name = String(name || '').trim();
    if (code.length < 4) return cb({ ok: false, error: 'Escribe el código que te dio el docente.' });
    connect().emit('share:join', { code, name }, (r) => {
      if (!r || !r.ok) return cb({ ok: false, error: (r && r.error) || 'No se pudo entrar.' });
      sess = { code: r.code, name: r.name, id: r.id };
      save(sess); paintBtn();
      const n = applyBank(r.bank);
      cb({ ok: true, questions: n });
      if (root) { lastHash = ''; tick(true); }
    });
  }

  function leave(silent) {
    stopCapture();
    sess = null; save(null); paintBtn();
    if (!silent) toast('Saliste de la sesión del docente', 'info');
  }

  /* ----------------------- captura de pantalla ----------------------- */
  function snapshot() {
    const clone = root.cloneNode(true);
    const src = root.querySelectorAll('canvas'), dst = clone.querySelectorAll('canvas');
    src.forEach((c, i) => {
      try {
        const img = document.createElement('img');
        img.src = c.toDataURL('image/png');
        img.className = c.className;
        if (c.id) img.id = c.id;
        img.width = c.width; img.height = c.height;
        img.style.cssText = c.style.cssText + ';image-rendering:' + (getComputedStyle(c).imageRendering || 'auto');
        dst[i].replaceWith(img);
      } catch (e) { /* canvas "tainted": se omite */ }
    });
    clone.querySelectorAll('script,iframe,video,audio,object,embed').forEach((n) => n.remove());
    return clone.innerHTML;
  }

  function hash(str) { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return h + ':' + str.length; }

  function tick(force) {
    if (!sess || !root || !socket || !socket.connected) return;
    if (!App.ludoInGame || !document.body.contains(root)) { detach(); return; }
    let html; try { html = snapshot(); } catch (e) { return; }
    const h = hash(html);
    if (!force && h === lastHash) return;
    lastHash = h;
    socket.emit('share:frame', {
      html, mode,
      meta: { vw: window.innerWidth, vh: root.scrollHeight + 60, cls: document.body.className, hcls: document.documentElement.className, rcls: root.className }
    });
  }

  function attach(container, gameMode) {
    stopCapture();
    root = container; mode = gameMode || '';
    if (!sess || !hasIO()) return;
    lastHash = '';
    try {
      obs = new MutationObserver(() => { clearTimeout(deb); deb = setTimeout(tick, 350); });
      obs.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    } catch (e) { /* sin observer: queda el intervalo */ }
    timer = setInterval(tick, 1500);   // cubre cambios dentro de <canvas>
    tick(true);
  }

  function stopCapture() {
    if (obs) { obs.disconnect(); obs = null; }
    clearInterval(timer); timer = null; clearTimeout(deb); deb = null;
    root = null; lastHash = '';
  }

  function detach() {
    const was = !!root;
    stopCapture();
    if (was && sess && socket && socket.connected) socket.emit('share:end');
  }

  /* ----------------------- botón y ventana de ingreso ----------------------- */
  function dialog() {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    const box = document.createElement('div');
    box.className = 'l-card';
    box.style.cssText = 'width:min(420px,100%);padding:20px';
    let defName = '';
    try { const u = App.auth && App.auth.who(); defName = u ? (u.nombre || u.usuario || '') : ''; } catch (e) { /* sin sesión */ }
    box.innerHTML =
      '<div class="text-lg font-bold mb-2">📡 Entrar a la sesión del docente</div>' +
      '<p class="text-sm mb-3" style="opacity:.8">Escribe el código que aparece en la pantalla del docente y el nombre de tu grupo. Tu partida se verá en vivo en su panel.</p>' +
      '<input id="sh-code" class="ffield join-code" maxlength="6" placeholder="Código (ej. K7M2P)" autocomplete="off">' +
      '<input id="sh-name" class="ffield mt-2" maxlength="24" placeholder="Nombre del grupo (ej. Mesa 1)" autocomplete="off">' +
      '<p id="sh-err" class="text-sm mt-2" style="color:#ff9a9a;min-height:18px"></p>' +
      '<div class="flex gap-2 mt-2"><button id="sh-ok" class="btn-primary" style="flex:1">Entrar</button><button id="sh-no" class="btn-ghost">Cancelar</button></div>';
    ov.appendChild(box); document.body.appendChild(ov);
    const $ = (q) => box.querySelector(q);
    $('#sh-name').value = defName;
    $('#sh-code').focus();
    const close = () => ov.remove();
    $('#sh-no').onclick = close;
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    $('#sh-ok').onclick = () => {
      $('#sh-err').textContent = '';
      join($('#sh-code').value, $('#sh-name').value, (r) => {
        if (!r.ok) { $('#sh-err').textContent = r.error; return; }
        close();
        toast('✅ Conectado con el docente' + (r.questions ? ' · ' + r.questions + ' preguntas cargadas' : ''), 'success');
        /* repinta la pantalla de inicio para que use el banco recién recibido */
        try { if (!App.ludoInGame) window.dispatchEvent(new Event('hashchange')); } catch (e) { /* ok */ }
      });
    };
  }

  function bind(button) {
    btn = button;
    if (!btn) return;
    if (!hasIO()) { btn.style.display = 'none'; return; }
    btn.addEventListener('click', () => {
      if (sess) { if (confirm('¿Dejar de compartir tu pantalla con el docente?')) { detach(); leave(); } }
      else dialog();
    });
    const prev = load();
    if (prev && prev.code) { sess = prev; connect(); }
    paintBtn();
  }

  return { bind, join, leave, attach, detach, isOn: () => !!sess, session: () => sess };
})();
