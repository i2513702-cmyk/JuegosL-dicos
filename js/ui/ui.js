/* ============================================================
 * LudoApp ui/ui.js
 * Primitivas de UI compartidas por los 4 juegos:
 * helpers DOM, toasts, confeti, shake, tarjeta de pregunta,
 * temporizador, sonidos opcionales (WebAudio) y pódium final.
 * ============================================================ */
window.App = window.App || {};
App.ui = (function () {
  function el(tag, className, html) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  const TEAM = {
    rojo: { nombre: 'Rojo', color: '#dc2626', fondo: '#fee2e2' },
    verde: { nombre: 'Verde', color: '#059669', fondo: '#d1fae5' },
    azul: { nombre: 'Azul', color: '#2563eb', fondo: '#dbeafe' },
    amarillo: { nombre: 'Amarillo', color: '#d97706', fondo: '#fef3c7' },
    morado: { nombre: 'Morado', color: '#7c3aed', fondo: '#ede9fe' },
    rosa: { nombre: 'Rosa', color: '#db2777', fondo: '#fce7f3' }
  };
  const PALETTE = Object.keys(TEAM);
  function teamColor(i) { return PALETTE[i % PALETTE.length]; }

  function toast(message, type, ms) {
    type = type || 'info';
    const colors = {
      success: 'bg-emerald-600 text-white',
      error: 'bg-rose-600 text-white',
      info: 'bg-indigo-700 text-white',
      warn: 'bg-amber-500 text-indigo-950'
    };
    const box = document.getElementById('toast-root');
    if (!box) return;
    const t = el('div', 'toast toast-in px-4 py-3 rounded-xl shadow-lg font-semibold text-sm ' + (colors[type] || colors.info), message);
    box.appendChild(t);
    setTimeout(() => {
      t.classList.remove('toast-in');
      t.classList.add('toast-out');
      setTimeout(() => t.remove(), 350);
    }, ms || 2400);
  }

  function confetti(container) {
    const host = container || document.body;
    const colors = ['#f59e0b', '#ec4899', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444'];
    for (let i = 0; i < 60; i++) {
      const p = el('div', 'confetti', '');
      p.style.left = Math.random() * 100 + '%';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 0.6) + 's';
      p.style.animationDuration = (1.2 + Math.random() * 1.4) + 's';
      host.appendChild(p);
      setTimeout(() => p.remove(), 3000);
    }
  }

  function shake(node) {
    if (!node) return;
    node.classList.remove('shake');
    void node.offsetWidth;
    node.classList.add('shake');
  }

  function flash(node, cls, ms) {
    if (!node) return;
    node.classList.add(cls);
    setTimeout(() => node.classList.remove(cls), ms || 900);
  }

  function floatText(container, text, cls) {
    const f = el('div', 'float-text ' + (cls || ''),
      text);
    f.style.left = (30 + Math.random() * 40) + '%';
    container.appendChild(f);
    setTimeout(() => f.remove(), 1400);
  }

  /* ------------------------ sonido (WebAudio, opcional) ------------------------ */
  let audioCtx = null;
  let soundEnabled = App.storage.getKey('settings', {}).sound !== false;
  function beep(freq, dur, type, vol) {
    if (!soundEnabled) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.value = vol || 0.14;
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch (e) { /* audio no disponible */ }
  }
  function sound(name) {
    if (name === 'correct') { beep(660, 0.18, 'triangle'); setTimeout(() => beep(880, 0.22, 'triangle'), 120); }
    else if (name === 'wrong') { beep(220, 0.35, 'sawtooth', 0.1); }
    else if (name === 'win') { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.25, 'triangle', 0.16), i * 140)); }
    else if (name === 'dice') { beep(440 + Math.random() * 220, 0.05, 'square', 0.06); }
    else if (name === 'hit') { beep(160, 0.2, 'sawtooth', 0.16); }
  }
  function toggleSound() {
    soundEnabled = !soundEnabled;
    const s = App.storage.getKey('settings', {});
    s.sound = soundEnabled;
    App.storage.setKey('settings', s);
    return soundEnabled;
  }

  /* ------------------------ tarjeta de pregunta ------------------------ */
  function question(ctx, container, opts) {
    /* ctx = { engine, question, extraBadges } ; opts = { onHint, onDismiss } */
    opts = opts || {};
    const q = ctx.question;
    const engine = ctx.engine;
    const dif = engine ? engine.dificultadDe(q) : null;
    const cat = engine ? engine.categoriaDe(q) : null;
    const difColor = { 'Fácil': 'bg-emerald-100 text-emerald-800', 'Media': 'bg-amber-100 text-amber-800', 'Difícil': 'bg-rose-100 text-rose-800' };
    container.innerHTML = '';

    const card = el('div', 'q-card');
    const head = el('div', 'flex flex-wrap items-center gap-2 mb-3');
    if (dif) head.appendChild(el('span', 'badge ' + (difColor[dif.nombre] || 'bg-indigo-100 text-indigo-800'), '🎯 ' + dif.nombre + ' · ' + (dif.peso_puntos * 10) + ' pts'));
    if (cat) head.appendChild(el('span', 'badge bg-indigo-100 text-indigo-800', '📚 ' + cat.nombre));
    (ctx.extraBadges || []).forEach((b) => head.appendChild(b));
    card.appendChild(head);

    card.appendChild(el('h3', 'q-text text-slate-900', q.enunciado));

    const keys = ['A', 'B', 'C', 'D'];
    const list = el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4');

    let hintDisabled = [];
    let resolved = false;
    let elims = 0;

    function optionBtn(i, label, text) {
      const btn = el('button', 'opt-btn',
        '<span class="opt-key">' + label + '</span><span class="opt-label">' + text + '</span>');
      btn.addEventListener('click', () => choose(i));
      return btn;
    }

    function choose(i) {
      if (resolved) return;
      resolved = true;
      const correct = engine.check(q, i);
      container.querySelectorAll('.opt-btn').forEach((btn, idx) => {
        btn.disabled = true;
        if (idx === q.respuesta_correcta) btn.classList.add('opt-correct');
        else if (idx === i) btn.classList.add('opt-wrong');
        else btn.classList.add('opt-dim');
      });
      if (correct) App.ui.sound('correct'); else App.ui.sound('wrong');

      const fb = el('div', 'feedback-block ' + (correct ? 'bg-emerald-50 border-emerald-300' : 'bg-rose-50 border-rose-300'),
        '<div class="font-bold ' + (correct ? 'text-emerald-800' : 'text-rose-800') + '">' +
        (correct ? '✓ ¡Correcto!' + (opts.showRewards ? ' +' + opts.showRewards : '') : '✗ Incorrecto') + '</div>' +
        '<p class="text-sm text-slate-700 mt-1"><strong>Retroalimentación:</strong> ' + q.feedback + '</p>' +
        (q.ejemplo_aplicado ? '<p class="text-sm text-slate-600 mt-1 bg-white rounded-lg border border-slate-200 p-2"><strong>Ejemplo aplicado:</strong> ' + q.ejemplo_aplicado + '</p>' : ''));
      card.appendChild(fb);

      const cont = el('button', 'btn-primary w-full mt-3', 'Continuar →');
      let contBusy = false;
      cont.addEventListener('click', () => {
        if (contBusy) return;
        contBusy = true;
        cont.classList.add('opacity-60');
        setTimeout(() => {
          try {
            opts.onAnswered && opts.onAnswered({ correct: correct, selectedIndex: i, question: q });
          } catch (e) {
            console.error(e);
            contBusy = false;
            cont.classList.remove('opacity-60');
            App.ui.toast('⚠️ No se pudo continuar: ' + e.message, 'error');
          }
        }, 0);
      });
      card.appendChild(cont);
    }

    function hint() {
      if (elims >= 2 || resolved) return;
      if (opts.onHint && !opts.onHint()) return;
      const wrong = [];
      q.opciones.forEach((_, i) => { if (i !== q.respuesta_correcta) wrong.push(i); });
      hintDisabled = wrong.sort(() => Math.random() - 0.5).slice(0, 2 - elims);
      hintDisabled.forEach((i) => {
        const btn = container.querySelectorAll('.opt-btn')[i];
        btn.classList.add('opt-dim', 'opt-disabled');
        btn.disabled = true;
      });
      elims += hintDisabled.length;
      App.ui.toast('💡 Pista usada: se eliminaron opciones incorrectas', 'info');
      App.ui.sound('dice');
    }

    const btns = el('div', 'flex items-center gap-2 mt-3');
    if (opts.onHint) {
      const hb = el('button', 'btn-ghost', '💡 Pista');
      hb.addEventListener('click', hint);
      btns.appendChild(hb);
    }
    if (opts.onDismiss) {
      const db = el('button', 'btn-ghost', '✕ Omitir');
      db.addEventListener('click', () => { if (!resolved) { resolved = true; opts.onDismiss(); } });
      btns.appendChild(db);
    }

    q.opciones.forEach((opc, i) => list.appendChild(optionBtn(i, keys[i], opc)));
    card.appendChild(list);
    container.appendChild(card);
    if (btns.children.length) container.appendChild(btns);

    return {
      hint,
      get disabled() { return resolved; },
      els: { card, list }
    };
  }

  /* ------------------------ temporizador ------------------------ */
  function timerBar(elNode, seconds, onEnd) {
    let left = seconds;
    let timer = null;
    function paint() {
      const pct = Math.max(0, (left / seconds) * 100);
      elNode.querySelector('.tb-fill').style.width = pct + '%';
      elNode.querySelector('.tb-label').textContent =
        Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0');
      if (left <= 60) elNode.querySelector('.tb-fill').classList.add('tb-low');
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function start() {
      stop();
      timer = setInterval(() => {
        if (left <= 0) { stop(); onEnd && onEnd(); return; }
        left--;
        paint();
      }, 1000);
    }
    paint();
    return { start, stop, pause: stop, get left() { return left; }, startFrom: function (s) { left = s; paint(); start(); } };
  }

  /* ------------------------ pódium final ------------------------ */
function podium(container, results, meta) {
    container.innerHTML = '';
    const box = el('div', 'max-w-2xl mx-auto text-center');
    box.appendChild(el('h2', 'text-2xl font-extrabold text-slate-900 mb-2', meta.title || '🏁 ¡Partida finalizada!'));
    box.appendChild(el('p', 'text-slate-500 mb-6 text-sm', meta.subtitle || ''));
    const sorted = results.slice().sort((a, b) => (a.rank || 99) - (b.rank || 99));

    const grid = el('div', 'grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6');
    sorted.forEach((r) => {
      const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : '🏅';
      const tile = el('div', 'podium-card text-left',
        '<div class="flex items-center gap-2"><span class="text-2xl">' + (r.icono || '🔹') + '</span>' +
        '<div><div class="font-bold ' + (r.rank === 1 ? 'text-amber-600' : 'text-slate-800') + '">' + r.nombre + '</div>' +
        '<div class="text-xs text-slate-500">' + (r.subtitulo || '') + '</div></div></div>' +
        '<div class="mt-2 flex justify-between text-xs"><span>' + (r.campo1Label || 'Puntos') + ': <strong>' + r.campo1 + '</strong></span>' +
        '<span>' + (r.campo2Label || '') + '<strong>' + (r.campo2 || '') + '</strong></span></div>' +
        '<div class="medal">' + medal + '</div>');
      grid.appendChild(tile);
    });
    box.appendChild(grid);
    if (meta.bonus) box.appendChild(el('div', 'bonus-summary', meta.bonus));
    container.appendChild(box);
  }

  /* ------------------------ párrafo de bonus/extras ------------------------ */
  function bonusParagraph(recipients) {
    const list = (recipients || []).filter(Boolean);
    if (!list.length) return '';
    const parts = list.map((r) => {
      let s = r.nombre + ' recibe +' + (r.xp || 0) + ' XP y +' + (r.monedas || 0) + ' monedas';
      if (r.logros && r.logros.length) s += ', y desbloquea ' + r.logros.join(', ');
      if (r.detalle && r.detalle.length) s += ' (' + r.detalle.join(' · ') + ')';
      return s;
    });
    return '🎁 Bonus y extras de la partida: ' + parts.join('. ') + '.';
  }

  /* ------------------------ utilidades varias ------------------------ */
  function teamStyle(colorName) {
    return TEAM[colorName] || TEAM.rojo;
  }

  function playersChips(container, players, currentId) {
    container.innerHTML = '';
    players.forEach((p) => {
      const s = teamStyle(p.color);
      const chip = el('div', 'player-chip ' + (p.id === currentId ? 'player-chip-active' : ''),
        '<span class="w-3 h-3 rounded-full inline-block mr-1" style="background:' + s.color + '"></span>' +
        '<span class="font-semibold truncate">' + p.nombre + '</span>');
      container.appendChild(chip);
    });
  }

  return {
    el, TEAM, PALETTE, teamColor, teamStyle,
    toast, confetti, shake, flash, floatText,
    sound, toggleSound,
    question, timerBar, podium, playersChips, bonusParagraph
  };
})();